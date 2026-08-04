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

type PortoState = { porto_base: string | null; porto: string | null; last_origem: string };

function isMudanca(origem: string): boolean {
  // "Faina de Lancha XXX" = mudança de porto (exceto resgate)
  return origem.startsWith("Faina de Lancha") || origem === "Mudança do Local da Lancha";
}

function oposto(porto: string | null): string | null {
  if (porto === "Pecém") return "Mucuripe";
  if (porto === "Mucuripe") return "Pecém";
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
    if (!Array.isArray(indicadores))
      throw new Error("Resposta do WebPilot inválida (não é uma lista)");

    // Array vazio é resposta válida ("nenhum indicador novo"). Retorna cedo:
    // o passo 3 abaixo acessa indicadores[0] e quebraria com a lista vazia.
    if (indicadores.length === 0) {
      const detalhe = "Nenhum indicador novo encontrado";
      await supabase.from("sync_log").insert({
        status: "parcial", lanchas_atualizadas: 0, eventos_importados: 0, detalhe,
      });
      return new Response(
        JSON.stringify({ sucesso: true, registros_inseridos: 0, detalhe }),
        { headers: { "Content-Type": "application/json", ...CORS } },
      );
    }

    // 2. Ordenar por dh_leitura ASC para calcular porto corretamente
    indicadores.sort((a, b) => a.DH_LEITURA.localeCompare(b.DH_LEITURA));

    // 3. Inicializar portoState com o registro imediatamente anterior à janela da API
    const portoState: Record<number, PortoState> = {};

    const dhMaisAntigo = indicadores[0].DH_LEITURA; // já ordenado ASC no passo 2

    const { data: ultimos } = await supabase
      .from("indicadores_ativos")
      .select("cd_lancha, porto_base, porto, ds_origem, dh_leitura")
      .not("porto_base", "is", null)
      .lt("dh_leitura", dhMaisAntigo) // apenas antes da janela da API
      .order("dh_leitura", { ascending: false })
      .limit(10000);

    if (ultimos) {
      const visto = new Set<number>();
      for (const row of ultimos as {
        cd_lancha: number; porto_base: string; porto: string; ds_origem: string | null;
      }[]) {
        if (!visto.has(row.cd_lancha)) {
          portoState[row.cd_lancha] = {
            porto_base: row.porto_base,
            porto: row.porto,
            last_origem: row.ds_origem ?? "",
          };
          visto.add(row.cd_lancha);
        }
      }
    }

    // 4. Processar cada indicador com lógica de porto (replica fórmula do Excel)
    for (const ind of indicadores) {
      const cdLancha = Number(ind.CD_LANCHA);
      const origem = ind.DS_ORIGEM ?? "";

      const s = portoState[cdLancha];
      const porto_base = s ? (isMudanca(origem) ? oposto(s.porto_base) : s.porto_base) : null;
      const porto = s ? (isMudanca(s.last_origem) ? s.porto_base : s.porto) : null;

      portoState[cdLancha] = { porto_base, porto, last_origem: origem };

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
