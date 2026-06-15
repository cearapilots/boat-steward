import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itIndicadores.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WpIndicador = {
  CD_ATIVO_INDICADOR: number | string;
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  DH_LEITURA: string;
  DC_HORIMETRO_BB: number | null;
  DC_DIF_BB: number | null;
  DC_HORIMETRO_BE: number | null;
  DC_DIF_BE: number | null;
  DC_HORIMETRO_GERADOR: number | null;
  DC_DIF_GERADOR: number | null;
  DS_ORIGEM: string | null;
};

function portoOposto(porto: string | null): string | null {
  if (porto === "Mucuripe") return "Pecém";
  if (porto === "Pecém") return "Mucuripe";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let registrosInseridos = 0;

  try {
    // 1. Buscar dados do WebPilot
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot retornou HTTP ${resp.status}`);

    const indicadores: WpIndicador[] = await resp.json();
    if (!Array.isArray(indicadores) || indicadores.length === 0)
      throw new Error("Resposta do WebPilot vazia ou inválida");

    // 2. Ordenar por dh_leitura ASC para calcular porto corretamente
    indicadores.sort((a, b) => a.DH_LEITURA.localeCompare(b.DH_LEITURA));

    // 3. Processar cada indicador com lógica de porto
    // Map<cd_lancha, porto_atual> — rastreia onde cada lancha está
    const portoPorLancha = new Map<string, string | null>();

    for (const ind of indicadores) {
      const cdLancha = String(ind.CD_LANCHA);

      // porto_base = último porto conhecido antes desta leitura
      const porto_base = portoPorLancha.get(cdLancha) ?? null;

      // Se é Faina de Lancha, a lancha cruzou para o porto oposto
      const isFaina =
        typeof ind.DS_ORIGEM === "string" && ind.DS_ORIGEM.startsWith("Faina de Lancha");
      const porto = isFaina ? portoOposto(porto_base) : porto_base;

      // Atualizar mapa com porto atual
      portoPorLancha.set(cdLancha, porto);

      const { error } = await supabase
        .from("indicadores_ativos")
        .upsert(
          {
            cd_ativo_indicador: Number(ind.CD_ATIVO_INDICADOR),
            cd_lancha: Number(ind.CD_LANCHA),
            ds_lancha: ind.DS_LANCHA,
            dh_leitura: ind.DH_LEITURA,
            dc_horimetro_bb: ind.DC_HORIMETRO_BB ?? null,
            dc_dif_bb: ind.DC_DIF_BB ?? null,
            dc_horimetro_be: ind.DC_HORIMETRO_BE ?? null,
            dc_dif_be: ind.DC_DIF_BE ?? null,
            dc_horimetro_gerador: ind.DC_HORIMETRO_GERADOR ?? null,
            dc_dif_gerador: ind.DC_DIF_GERADOR ?? null,
            ds_origem: ind.DS_ORIGEM ?? null,
            porto_base,
            porto,
          },
          { onConflict: "cd_ativo_indicador", ignoreDuplicates: true },
        );

      if (!error) registrosInseridos++;
      else console.error(`Erro ao inserir cd_ativo_indicador ${ind.CD_ATIVO_INDICADOR}:`, error);
    }

    const detalhe = `Indicadores inseridos: ${registrosInseridos} de ${indicadores.length}`;

    await supabase.from("sync_log").insert({
      status: registrosInseridos > 0 ? "sucesso" : "parcial",
      lanchas_atualizadas: 0,
      eventos_importados: registrosInseridos,
      detalhe,
    });

    return new Response(
      JSON.stringify({ sucesso: true, registros_inseridos: registrosInseridos, detalhe }),
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
