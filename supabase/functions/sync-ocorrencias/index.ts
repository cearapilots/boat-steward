import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itOcorrenciasOperacionais.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WpOcorrencia = {
  CD_OCORRENCIA: number | string;
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  DH_ABERTURA: string;
  DH_FECHAMENTO: string | null;
  NR_HORAS: number | null;
  DS_TIPO_OCORRENCIA: string;
  DS_OCORRENCIA: string;
  DS_EFEITO: string;
};

const MAPEAMENTO_PERIODICAS: Record<string, string> = {
  "Docagem (Preventiva)": "Docagem",
  "Docagem (Corretiva)": "Docagem",
  "Limpeza do tanque de MDO (Preventiva)": "Limpeza de tanque",
  "Aftercooler (Preventiva)": "Limpeza dos aftercoolers",
  "Aftercooler (Corretiva)": "Limpeza dos aftercoolers",
  "Ar Condicionado (Preventiva)": "Limpeza/manutenção ar-condicionado",
  "Ar Condicionado (Corretiva)": "Limpeza/manutenção ar-condicionado",
  "Regulagem de válvulas (Preventiva)": "Regulagem de válvulas dos motores",
  "Treinamento dos tripulantes": "Treinamento dos tripulantes",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let ocorrenciasImportadas = 0;
  let periodicasRegistradas = 0;
  const contagemPorLancha = new Map<string, number>();

  try {
    // ── 1. Buscar registros do WebPilot ──────────────────────────────────────
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot retornou HTTP ${resp.status}`);

    const ocorrencias: WpOcorrencia[] = await resp.json();
    if (!Array.isArray(ocorrencias) || ocorrencias.length === 0)
      throw new Error("Resposta do WebPilot vazia ou inválida");

    // ── 2. Carregar lanchas do banco ─────────────────────────────────────────
    const { data: lanchasBanco, error: errLanchas } = await supabase
      .from("lanchas")
      .select("id, nome, id_webpilot, horimetro, horimetro_gerador")
      .not("id_webpilot", "is", null);

    if (errLanchas) throw new Error(`Erro ao buscar lanchas: ${errLanchas.message}`);

    // ── 3. Carregar tipos de manutenção periódica ────────────────────────────
    const { data: tiposPeriodicasBanco, error: errTipos } = await supabase
      .from("manutencoes_periodicas_tipos")
      .select("id, nome");

    if (errTipos) throw new Error(`Erro ao buscar tipos periódicas: ${errTipos.message}`);

    const tipoIdByNome = new Map<string, string>();
    (tiposPeriodicasBanco ?? []).forEach((t: any) => tipoIdByNome.set(t.nome, t.id));

    // ── 4. Processar cada ocorrência ─────────────────────────────────────────
    for (const oc of ocorrencias) {
      const lancha = lanchasBanco?.find((l) => l.id_webpilot === String(oc.CD_LANCHA));
      if (!lancha) continue;

      const cdOcorrencia = Number(oc.CD_OCORRENCIA);

      const efeitosValidos = ["Inoperante", "Operante", "Operante com Restrições", "Não Altera"];
      const efeito = efeitosValidos.includes(oc.DS_EFEITO) ? oc.DS_EFEITO : null;

      // ── INSERT OR UPDATE em ocorrencias_webpilot ─────────────────────────
      // Tenta INSERT primeiro; em conflito (cd_ocorrencia já existe),
      // atualiza apenas data_fim e duracao_horas — preserva descricao editada manualmente.
      const { error: errInsert } = await supabase
        .from("ocorrencias_webpilot")
        .insert({
          cd_ocorrencia: cdOcorrencia,
          data_inicio: oc.DH_ABERTURA,
          data_fim: oc.DH_FECHAMENTO ?? null,
          duracao_horas: oc.NR_HORAS ?? null,
          tipo_ocorrencia: oc.DS_TIPO_OCORRENCIA,
          descricao: oc.DS_OCORRENCIA,
          efeito,
          lancha_id: lancha.id,
          origem: "webpilot_sync",
        });

      if (errInsert) {
        if (errInsert.code === "23505") {
          // Registro já existe — atualiza apenas campos que o WebPilot pode mudar
          const { error: errUpdate } = await supabase
            .from("ocorrencias_webpilot")
            .update({
              data_fim: oc.DH_FECHAMENTO ?? null,
              duracao_horas: oc.NR_HORAS ?? null,
              efeito,
            })
            .eq("cd_ocorrencia", cdOcorrencia);
          if (errUpdate) {
            console.error(`Erro update cd_ocorrencia ${oc.CD_OCORRENCIA}:`, errUpdate);
            continue;
          }
        } else {
          console.error(`Erro insert cd_ocorrencia ${oc.CD_OCORRENCIA}:`, errInsert);
          continue;
        }
      }

      ocorrenciasImportadas++;
      contagemPorLancha.set(lancha.nome, (contagemPorLancha.get(lancha.nome) ?? 0) + 1);

      // ── Verificar se é manutenção periódica ──────────────────────────────
      let nomePeriodicaMapeado = MAPEAMENTO_PERIODICAS[oc.DS_TIPO_OCORRENCIA];

      if (!nomePeriodicaMapeado) {
        const desc = oc.DS_OCORRENCIA.toLowerCase();
        if (desc.includes("regulag") && desc.includes("válvula")) {
          nomePeriodicaMapeado = "Regulagem de válvulas dos motores";
        } else if (desc.includes("ar condicionado") || desc.includes("ar-condicionado")) {
          nomePeriodicaMapeado = "Limpeza/manutenção ar-condicionado";
        }
      }

      if (nomePeriodicaMapeado) {
        const tipoId = tipoIdByNome.get(nomePeriodicaMapeado);
        if (tipoId) {
          const { data: existePeriodicaOc } = await supabase
            .from("manutencoes_periodicas")
            .select("id")
            .eq("lancha_id", lancha.id)
            .eq("tipo_id", tipoId)
            .eq("data_realizada", oc.DH_ABERTURA.slice(0, 10))
            .neq("origem", "manual")
            .maybeSingle();

          if (!existePeriodicaOc) {
            const { error: errPeriodica } = await supabase
              .from("manutencoes_periodicas")
              .insert({
                lancha_id: lancha.id,
                tipo_id: tipoId,
                data_realizada: oc.DH_ABERTURA.slice(0, 10),
                observacao: oc.DS_OCORRENCIA,
                origem: "webpilot_sync",
              });
            if (errPeriodica) {
              if (errPeriodica.code === "23505") {
                console.log(`Periódica já existe (manual): ${nomePeriodicaMapeado} - ${lancha.nome} - ${oc.DH_ABERTURA.slice(0, 10)}`);
              } else {
                console.error(`Erro ao inserir periódica: ${errPeriodica.message}`, {
                  tipo: nomePeriodicaMapeado,
                  lancha: lancha.nome,
                  data: oc.DH_ABERTURA.slice(0, 10),
                });
              }
            } else {
              periodicasRegistradas++;
            }
          }
        }
      }

      // ── Verificar se é troca de óleo em ocorrência preventiva ────────────
      // Cobre casos onde a troca de óleo aparece como ocorrência operacional
      // e não foi capturada pela API de trocas (sync-trocas-oleo).
      const isPreventiva = oc.DS_TIPO_OCORRENCIA.toLowerCase().includes("preventiva");
      const descLower = oc.DS_OCORRENCIA.toLowerCase();
      const isTrocaOleo =
        isPreventiva &&
        (descLower.includes("troca de óleo") ||
          descLower.includes("troca de oleo") ||
          descLower.includes("troca óleo") ||
          descLower.includes("troca oleo"));

      if (isTrocaOleo) {
        const tipoOcStr = oc.DS_TIPO_OCORRENCIA.toLowerCase();
        let tipoAtivoOleo: string | null = null;
        const posicoesAlvoOleo: string[] = [];

        if (tipoOcStr.includes("motor")) {
          tipoAtivoOleo = "motor";
          posicoesAlvoOleo.push("BB", "BE");
        } else if (tipoOcStr.includes("gerador")) {
          tipoAtivoOleo = "gerador";
        } else if (tipoOcStr.includes("reversor")) {
          tipoAtivoOleo = "reversor";
          posicoesAlvoOleo.push("BB", "BE");
        }

        if (tipoAtivoOleo) {
          const dataOcorrencia = oc.DH_ABERTURA.slice(0, 10);
          const nextDayDate = new Date(dataOcorrencia + "T00:00:00");
          nextDayDate.setDate(nextDayDate.getDate() + 1);
          const nextDay = nextDayDate.toISOString().slice(0, 10);

          const { data: posicoesOleo } = await supabase
            .from("posicoes")
            .select("ativo_id, posicao, ativos(id, nome, tipo, offset_instalacao)")
            .eq("lancha_id", lancha.id)
            .lte("data_instalacao", dataOcorrencia)
            .or(`data_remocao.is.null,data_remocao.gt.${dataOcorrencia}`);

          const alvosOleo = ((posicoesOleo ?? []) as any[]).filter((p: any) => {
            if (p.ativos?.tipo !== tipoAtivoOleo) return false;
            if (posicoesAlvoOleo.length > 0 && !posicoesAlvoOleo.includes(p.posicao ?? "")) return false;
            return true;
          });

          // Horímetros da lancha carregados no início do sync
          const horimetroLanchaBase = (lancha as any).horimetro ?? null;
          const horimetroGeradorBase = (lancha as any).horimetro_gerador ?? null;

          for (const pos of alvosOleo) {
            // Dedup: verifica qualquer troca de óleo do mesmo ativo no mesmo dia
            // (range para cobrir registros com e sem componente de hora)
            const { data: existeMutOleo } = await supabase
              .from("manutencoes")
              .select("id")
              .eq("ativo_id", pos.ativo_id)
              .gte("data_manutencao", dataOcorrencia)
              .lt("data_manutencao", nextDay)
              .eq("tipo", "troca_oleo")
              .neq("origem", "manual")
              .maybeSingle();

            if (existeMutOleo) continue;

            // Calcular horímetros conforme tipo do ativo
            const tipoAtivo = (pos.ativos as any)?.tipo;
            const offsetInstalacao = (pos.ativos as any)?.offset_instalacao ?? null;
            let horimetroLancha: number | null;
            let horimetroEquipamento: number | null;

            if (tipoAtivo === "gerador") {
              horimetroLancha = null;
              horimetroEquipamento = horimetroGeradorBase;
            } else {
              // motor e reversor usam horímetro principal da lancha
              horimetroLancha = horimetroLanchaBase;
              horimetroEquipamento =
                horimetroLanchaBase != null && offsetInstalacao != null
                  ? horimetroLanchaBase - offsetInstalacao
                  : horimetroLanchaBase;
            }

            const { error: errMutOleo } = await supabase.from("manutencoes").insert({
              ativo_id: pos.ativo_id,
              lancha_id: lancha.id,
              tipo: "troca_oleo",
              data_manutencao: dataOcorrencia,
              horimetro_lancha: horimetroLancha,
              horimetro_equipamento: horimetroEquipamento,
              observacao: oc.DS_OCORRENCIA,
              origem: "webpilot_sync",
            });

            if (!errMutOleo) {
              const { data: existeHistOleo } = await supabase
                .from("historico")
                .select("id")
                .eq("ativo_id", pos.ativo_id)
                .eq("data_evento", dataOcorrencia)
                .eq("tipo_evento", "troca_oleo")
                .maybeSingle();

              if (!existeHistOleo) {
                await supabase.from("historico").insert({
                  tipo_evento: "troca_oleo",
                  ativo_id: pos.ativo_id,
                  lancha_id: lancha.id,
                  data_evento: dataOcorrencia,
                  descricao: oc.DS_OCORRENCIA,
                  dados_extras: {
                    cd_ocorrencia: cdOcorrencia,
                    ds_tipo_ocorrencia: oc.DS_TIPO_OCORRENCIA,
                    horimetro_lancha: horimetroLancha,
                    horimetro_equipamento: horimetroEquipamento,
                  },
                  origem: "webpilot_sync",
                });
              }
            }
          }
        }
      }
    }

    // ── 5. Gravar no sync_log ────────────────────────────────────────────────
    const detalhe = contagemPorLancha.size > 0
      ? [...contagemPorLancha.entries()]
          .map(([nome, qtd]) => `${nome}: ${qtd}`)
          .join(" | ") + ` | Periódicas: ${periodicasRegistradas}`
      : `Nenhuma ocorrência nova | Periódicas: ${periodicasRegistradas}`;

    await supabase.from("sync_log").insert({
      status: ocorrenciasImportadas > 0 ? "sucesso" : "parcial",
      lanchas_atualizadas: contagemPorLancha.size,
      eventos_importados: ocorrenciasImportadas,
      detalhe,
    });

    return new Response(
      JSON.stringify({
        sucesso: true,
        ocorrencias_importadas: ocorrenciasImportadas,
        periodicas_registradas: periodicasRegistradas,
        detalhe,
      }),
      { headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await supabase.from("sync_log").insert({
      status: "erro",
      lanchas_atualizadas: 0,
      eventos_importados: 0,
      detalhe: mensagem,
    });
    return new Response(
      JSON.stringify({ sucesso: false, erro: mensagem }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
