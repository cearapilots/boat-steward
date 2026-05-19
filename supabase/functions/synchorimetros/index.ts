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
  ativos: { id: string; nome: string; tipo: string } | null;
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

  try {
    // ── 1. Buscar registros do WebPilot ──────────────────────────────────────
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot retornou HTTP ${resp.status}`);

    const trocas: WpTroca[] = await resp.json();
    if (!Array.isArray(trocas) || trocas.length === 0)
      throw new Error("Resposta do WebPilot vazia ou inválida");

    // ── 2. Carregar lanchas do banco ─────────────────────────────────────────
    const { data: lanchasBanco, error: errLanchas } = await supabase
      .from("lanchas")
      .select("id, nome, id_webpilot")
      .not("id_webpilot", "is", null);

    if (errLanchas) throw new Error(`Erro ao buscar lanchas: ${errLanchas.message}`);

    // ── 3. Processar cada registro ───────────────────────────────────────────
    for (const troca of trocas) {
      const lancha = lanchasBanco?.find((l) => l.id_webpilot === String(troca.CD_LANCHA));
      if (!lancha) continue;

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
        continue; // DS_EQUIPAMENTO desconhecido — pular
      }

      const observacao = `Troca de óleo e filtro dos ${troca.DS_EQUIPAMENTO}`;
      const horimetroLancha = isGerador ? troca.DC_HORIMETRO_GERADOR : troca.DC_HORIMETRO_BB;

      // Buscar posições abertas da lancha (ativos instalados no momento)
      const { data: posicoes, error: errPos } = await supabase
        .from("posicoes")
        .select("ativo_id, posicao, ativos(id, nome, tipo)")
        .eq("lancha_id", lancha.id)
        .is("data_remocao", null);

      if (errPos || !posicoes) continue;

      // Filtrar pelo tipo e posição esperados
      const alvo = (posicoes as PosicaoRow[]).filter((p) => {
        if ((p.ativos as any)?.tipo !== tipoAtivo) return false;
        if (posicoesAlvo.length > 0 && !posicoesAlvo.includes(p.posicao ?? "")) return false;
        return true;
      });

      if (alvo.length === 0) continue;

      for (const pos of alvo) {
        const ativoId = pos.ativo_id;
        const dhAbastecimento = troca.DH_ABASTECIMENTO;

        // ── Deduplicação: verificar se já foi importado ──────────────────────
        const { data: existeMut } = await supabase
          .from("manutencoes")
          .select("id")
          .eq("ativo_id", ativoId)
          .eq("data_manutencao", dhAbastecimento)
          .eq("tipo", "troca_oleo")
          .neq("origem", "manual") // nunca sobrescrever registros manuais
          .maybeSingle();

        if (existeMut) continue; // já importado anteriormente

        // ── INSERT em manutencoes ────────────────────────────────────────────
        // O trigger trigger_atualizar_ativo_apos_manutencao atualiza
        // ativos.ultima_troca_horimetro e ativos.ultima_troca_data automaticamente.
        const { error: errMut } = await supabase.from("manutencoes").insert({
          ativo_id: ativoId,
          lancha_id: lancha.id,
          tipo: "troca_oleo",
          data_manutencao: dhAbastecimento,
          horimetro_lancha: horimetroLancha,
          horimetro_equipamento: null,
          observacao,
          origem: "webpilot_sync",
        });

        if (errMut) continue;

        // ── INSERT espelhado em historico ────────────────────────────────────
        const { data: existeHist } = await supabase
          .from("historico")
          .select("id")
          .eq("ativo_id", ativoId)
          .eq("data_evento", dhAbastecimento)
          .eq("tipo_evento", "troca_oleo")
          .maybeSingle();

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
    const detalhe = contagemPorLancha.size > 0
      ? [...contagemPorLancha.entries()]
          .map(([nome, qtd]) => `${nome}: ${qtd} troca${qtd > 1 ? "s" : ""}`)
          .join(" | ")
      : "Nenhuma troca nova encontrada";

    await supabase.from("sync_log").insert({
      status: trocasRegistradas > 0 ? "sucesso" : "parcial",
      lanchas_atualizadas: contagemPorLancha.size,
      eventos_importados: trocasRegistradas,
      detalhe,
    });

    return new Response(
      JSON.stringify({ sucesso: true, trocas_registradas: trocasRegistradas, detalhe }),
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
