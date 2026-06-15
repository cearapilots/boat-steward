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

// Fallback: porto na primeira ocorrência histórica de cada lancha
const PORTO_INICIAL: Record<string, string> = {
  "121":  "Mucuripe", // FLEXEIRAS  — primeiro registro: 03/01/19
  "1003": "Mucuripe", // FORTIM     — primeiro registro: 05/11/19
  "117":  "Pecém",    // TAÍBA III  — primeiro registro: 04/01/19
};

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

    const todos: WpIndicador[] = await resp.json();
    if (!Array.isArray(todos) || todos.length === 0)
      throw new Error("Resposta do WebPilot vazia ou inválida");

    // 2. Identificar quais cd_ativo_indicador já existem no banco
    const { data: existentes } = await supabase
      .from("indicadores_ativos")
      .select("cd_ativo_indicador");

    const jaSalvos = new Set<number>(
      (existentes ?? []).map((r: { cd_ativo_indicador: number }) => r.cd_ativo_indicador)
    );

    // 3. Filtrar apenas registros novos e ordenar cronologicamente
    const novos = todos
      .filter((i) => !jaSalvos.has(Number(i.CD_ATIVO_INDICADOR)))
      .sort((a, b) => a.DH_LEITURA.localeCompare(b.DH_LEITURA));

    if (novos.length === 0) {
      const detalhe = "Nenhum registro novo encontrado.";
      await supabase.from("sync_log").insert({
        status: "sucesso",
        lanchas_atualizadas: 0,
        eventos_importados: 0,
        detalhe,
      });
      return new Response(
        JSON.stringify({ sucesso: true, registros_inseridos: 0, detalhe }),
        { headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    // 4. Semear portoPorLancha com o último porto conhecido no banco
    //    (fallback para PORTO_INICIAL se lancha ainda não tiver dados)
    const portoPorLancha = new Map<string, string | null>(
      Object.entries(PORTO_INICIAL)
    );

    const { data: ultimosPortos } = await supabase
      .from("indicadores_ativos")
      .select("cd_lancha, porto")
      .not("porto", "is", null)
      .order("dh_leitura", { ascending: false })
      .limit(10000);

    if (ultimosPortos) {
      const visto = new Set<string>();
      for (const row of ultimosPortos as { cd_lancha: number; porto: string }[]) {
        const k = String(row.cd_lancha);
        if (!visto.has(k)) {
          portoPorLancha.set(k, row.porto);
          visto.add(k);
        }
      }
    }

    // 5. Processar e inserir apenas os registros novos
    for (const ind of novos) {
      const cdLancha = String(ind.CD_LANCHA);

      const porto_base = portoPorLancha.get(cdLancha) ?? null;

      const isFaina =
        typeof ind.DS_ORIGEM === "string" && ind.DS_ORIGEM.startsWith("Faina de Lancha");

      const porto = isFaina
        ? (porto_base === "Mucuripe" ? "Pecém" : porto_base === "Pecém" ? "Mucuripe" : null)
        : porto_base;

      portoPorLancha.set(cdLancha, porto);

      const { error } = await supabase
        .from("indicadores_ativos")
        .insert({
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
        });

      if (!error) registrosInseridos++;
      else console.error(`Erro ao inserir cd_ativo_indicador ${ind.CD_ATIVO_INDICADOR}:`, error);
    }

    const detalhe = `Registros novos inseridos: ${registrosInseridos} de ${novos.length} (total API: ${todos.length})`;

    await supabase.from("sync_log").insert({
      status: registrosInseridos > 0 || novos.length === 0 ? "sucesso" : "parcial",
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
