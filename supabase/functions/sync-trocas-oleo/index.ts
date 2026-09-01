import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itTrocasOleo.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WpTroca = {
  CD_ABASTECIMENTO: number | string;
  DH_ABASTECIMENTO: string;
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  DS_EQUIPAMENTO: string; // 'Motores' | 'Reversores' | 'Gerador'
  DC_HORIMETRO_BB: number;
  DC_HORIMETRO_BE: number;
  DC_HORIMETRO_GERADOR: number;
};

type PosicaoRow = {
  ativo_id: string;
  posicao: string | null;
  ativos: { id: string; nome: string; tipo: string; offset_instalacao: number | null } | null;
};

type SkipReason =
  | "lancha_nao_encontrada"
  | "equipamento_desconhecido"
  | "erro_posicoes"
  | "sem_ativo_na_data"
  | "duplicata"
  | "erro_insert";

type SkipEntry = {
  cd_abastecimento: number | string;
  lancha: string;
  equipamento: string;
  data: string;
  motivo: SkipReason;
  detalhe?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let trocasRegistradas = 0;
  const contagemPorLancha = new Map<string, number>();
  const skips: SkipEntry[] = [];

  try {
    // ── 1. Buscar registros do WebPilot ──────────────────────────────────────
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot retornou HTTP ${resp.status}`);

    const trocas: WpTroca[] = await resp.json();
    // Array vazio é resposta válida ("nenhuma troca nova"): não é erro.
    if (!Array.isArray(trocas))
      throw new Error("Resposta do WebPilot inválida (não é uma lista)");

    // ── 2. Carregar lanchas do banco ─────────────────────────────────────────
    const { data: lanchasBanco, error: errLanchas } = await supabase
      .from("lanchas")
      .select("id, nome, id_webpilot")
      .not("id_webpilot", "is", null);

    if (errLanchas) throw new Error(`Erro ao buscar lanchas: ${errLanchas.message}`);

    // IDs disponíveis no banco (para diagnóstico)
    const idWebpilotDisponiveis = (lanchasBanco ?? []).map((l: { nome: string; id_webpilot: string | null }) => `${l.nome}=${l.id_webpilot}`).join(", ");

    // ── 3. Processar cada registro ───────────────────────────────────────────
    for (const troca of trocas) {
      const cdLanchaStr = String(troca.CD_LANCHA);
      const lancha = lanchasBanco?.find((l) => l.id_webpilot === cdLanchaStr);

      if (!lancha) {
        skips.push({
          cd_abastecimento: troca.CD_ABASTECIMENTO,
          lancha: `CD_LANCHA=${cdLanchaStr} (${troca.DS_LANCHA})`,
          equipamento: troca.DS_EQUIPAMENTO,
          data: troca.DH_ABASTECIMENTO,
          motivo: "lancha_nao_encontrada",
          detalhe: `id_webpilot "${cdLanchaStr}" não encontrado no banco. Disponíveis: ${idWebpilotDisponiveis}`,
        });
        continue;
      }

      // Determinar tipo de ativo e posições esperadas
      let tipoAtivo: string;
      let posicoesAlvo: string[];
      let isGerador = false;

      if (troca.DS_EQUIPAMENTO === "Motores") {
        tipoAtivo = "motor";
        posicoesAlvo = ["BB", "BE"];
      } else if (troca.DS_EQUIPAMENTO === "Reversores") {
        tipoAtivo = "reversor";
        posicoesAlvo = ["BB", "BE"];
      } else if (troca.DS_EQUIPAMENTO === "Gerador") {
        tipoAtivo = "gerador";
        posicoesAlvo = [];
        isGerador = true;
      } else {
        skips.push({
          cd_abastecimento: troca.CD_ABASTECIMENTO,
          lancha: lancha.nome,
          equipamento: troca.DS_EQUIPAMENTO,
          data: troca.DH_ABASTECIMENTO,
          motivo: "equipamento_desconhecido",
          detalhe: `DS_EQUIPAMENTO="${troca.DS_EQUIPAMENTO}" não é "Motores", "Reversores" ou "Gerador"`,
        });
        continue;
      }

      const observacao = `Troca de óleo e filtro dos ${troca.DS_EQUIPAMENTO}`;
      const horimetroLancha = isGerador ? troca.DC_HORIMETRO_GERADOR : troca.DC_HORIMETRO_BB;

      // Buscar qual ativo estava instalado na lancha NA DATA do abastecimento
      const dataAbastecimento = troca.DH_ABASTECIMENTO.split("T")[0];
      const { data: posicoes, error: errPos } = await supabase
        .from("posicoes")
        .select("ativo_id, posicao, ativos(id, nome, tipo, offset_instalacao)")
        .eq("lancha_id", lancha.id)
        .lte("data_instalacao", dataAbastecimento)
        .or(`data_remocao.is.null,data_remocao.gt.${dataAbastecimento}`);

      if (errPos || !posicoes) {
        skips.push({
          cd_abastecimento: troca.CD_ABASTECIMENTO,
          lancha: lancha.nome,
          equipamento: troca.DS_EQUIPAMENTO,
          data: troca.DH_ABASTECIMENTO,
          motivo: "erro_posicoes",
          detalhe: errPos?.message ?? "posicoes retornou null",
        });
        continue;
      }

      // Filtrar pelo tipo e posição esperados
      const alvo = (posicoes as PosicaoRow[]).filter((p) => {
        if ((p.ativos as any)?.tipo !== tipoAtivo) return false;
        if (posicoesAlvo.length > 0 && !posicoesAlvo.includes(p.posicao ?? "")) return false;
        return true;
      });

      if (alvo.length === 0) {
        const tiposEncontrados = (posicoes as PosicaoRow[]).map((p: PosicaoRow) =>
          `${(p.ativos as any)?.tipo ?? "?"}@${p.posicao ?? "?"}`
        ).join(", ") || "nenhum";
        skips.push({
          cd_abastecimento: troca.CD_ABASTECIMENTO,
          lancha: lancha.nome,
          equipamento: troca.DS_EQUIPAMENTO,
          data: troca.DH_ABASTECIMENTO,
          motivo: "sem_ativo_na_data",
          detalhe: `Procurado tipo="${tipoAtivo}" posições=${JSON.stringify(posicoesAlvo)} em ${dataAbastecimento}. Ativos instalados na data: [${tiposEncontrados}]`,
        });
        continue;
      }

      for (const pos of alvo) {
        const ativoId = pos.ativo_id;
        const dhAbastecimento = troca.DH_ABASTECIMENTO;

        // ── Deduplicação: verificar se já foi importado ──────────────────────
        const { data: existeMutRows } = await supabase
          .from("manutencoes")
          .select("id")
          .eq("ativo_id", ativoId)
          .eq("data_manutencao", dhAbastecimento)
          .eq("tipo", "troca_oleo")
          .neq("origem", "manual")
          .limit(1);
        const existeMut = existeMutRows?.[0] ?? null;

        if (existeMut) {
          skips.push({
            cd_abastecimento: troca.CD_ABASTECIMENTO,
            lancha: lancha.nome,
            equipamento: troca.DS_EQUIPAMENTO,
            data: troca.DH_ABASTECIMENTO,
            motivo: "duplicata",
            detalhe: `manutencao id=${existeMut.id} já existe para ativo_id=${ativoId}`,
          });
          continue;
        }

        // horimetro_equipamento: horas acumuladas do equipamento físico.
        // Mesma fórmula de horas_equipamento_calculadas em v_situacao_atual:
        //   gerador        → contador próprio (sem offset)
        //   motor/reversor → horímetro da lancha menos o offset de instalação
        const horimetroEquipamento = isGerador
          ? horimetroLancha
          : Math.round(
              (Number(horimetroLancha) - Number((pos.ativos as any)?.offset_instalacao ?? 0)) * 10,
            ) / 10;

        // ── INSERT em manutencoes ────────────────────────────────────────────
        const { error: errMut } = await supabase.from("manutencoes").insert({
          ativo_id: ativoId,
          lancha_id: lancha.id,
          tipo: "troca_oleo",
          data_manutencao: dhAbastecimento,
          horimetro_lancha: horimetroLancha,
          horimetro_equipamento: horimetroEquipamento,
          observacao,
          origem: "webpilot_sync",
        });

        if (errMut) {
          skips.push({
            cd_abastecimento: troca.CD_ABASTECIMENTO,
            lancha: lancha.nome,
            equipamento: troca.DS_EQUIPAMENTO,
            data: troca.DH_ABASTECIMENTO,
            motivo: "erro_insert",
            detalhe: errMut.message,
          });
          continue;
        }

        // ── INSERT espelhado em historico ────────────────────────────────────
        const { data: existeHistRows } = await supabase
          .from("historico")
          .select("id")
          .eq("ativo_id", ativoId)
          .eq("data_evento", dhAbastecimento)
          .eq("tipo_evento", "troca_oleo")
          .limit(1);
        const existeHist = existeHistRows?.[0] ?? null;

        if (!existeHist) {
          await supabase.from("historico").insert({
            tipo_evento: "troca_oleo",
            ativo_id: ativoId,
            lancha_id: lancha.id,
            data_evento: dhAbastecimento,
            descricao: observacao,
            dados_extras: {
              cd_abastecimento: troca.CD_ABASTECIMENTO,
              horimetro_lancha: horimetroLancha,
              horimetro_equipamento: horimetroEquipamento,
              ds_equipamento: troca.DS_EQUIPAMENTO,
            },
            origem: "webpilot_sync",
          });
        }

        trocasRegistradas++;
        contagemPorLancha.set(lancha.nome, (contagemPorLancha.get(lancha.nome) ?? 0) + 1);
      }
    }

    // ── 4. Gravar no sync_log ────────────────────────────────────────────────
    const partes: string[] = [];
    if (contagemPorLancha.size > 0) {
      partes.push(
        [...contagemPorLancha.entries()]
          .map(([nome, qtd]) => `${nome}: ${qtd} troca${qtd > 1 ? "s" : ""}`)
          .join(" | "),
      );
    }
    if (skips.length > 0) {
      const resumoSkips = skips
        .map((s) => `[SKIP cd=${s.cd_abastecimento} ${s.lancha} ${s.equipamento}: ${s.motivo} — ${s.detalhe}]`)
        .join(" | ");
      partes.push(resumoSkips);
    }
    const detalhe = partes.length > 0 ? partes.join(" || ") : "Nenhuma troca nova encontrada";

    await supabase.from("sync_log").insert({
      status: trocasRegistradas > 0 ? "sucesso" : skips.length > 0 ? "parcial" : "parcial",
      lanchas_atualizadas: contagemPorLancha.size,
      eventos_importados: trocasRegistradas,
      detalhe,
    });

    return new Response(
      JSON.stringify({
        sucesso: true,
        trocas_registradas: trocasRegistradas,
        detalhe,
        skips,
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
