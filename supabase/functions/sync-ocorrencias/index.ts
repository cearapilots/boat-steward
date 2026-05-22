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
      .select("id, nome, id_webpilot")
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

      if (!nomePeriodicaMapeado) continue;

      const tipoId = tipoIdByNome.get(nomePeriodicaMapeado);
      if (!tipoId) continue;

      // Verificar se já existe uma periódica importada para essa cd_ocorrencia
      const { data: existePeriodicaOc } = await supabase
        .from("manutencoes_periodicas")
        .select("id")
        .eq("lancha_id", lancha.id)
        .eq("tipo_id", tipoId)
        .eq("data_realizada", oc.DH_ABERTURA.slice(0, 10))
        .neq("origem", "manual")
        .maybeSingle();

      if (existePeriodicaOc) continue;

      const { error: errPeriodica } = await supabase
        .from("manutencoes_periodicas")
        .insert({
          lancha_id: lancha.id,
          tipo_id: tipoId,
          data_realizada: oc.DH_ABERTURA.slice(0, 10),
          observacao: oc.DS_OCORRENCIA,
          origem: "webpilot_sync",
        });

      if (!errPeriodica) periodicasRegistradas++;
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
