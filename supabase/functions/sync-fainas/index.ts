import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itFainasDeslocPortos.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WpFaina = {
  CD_FAINA_LANCHA: number | string;
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  DS_LOCAL_ORIG: string | null;
  DS_LOCAL_DEST: string | null;
  DH_INICIO: string;
  DH_FIM: string | null;
  NR_MINUTOS: number | null;
  DC_HORAS: number | null;
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

    const fainas: WpFaina[] = await resp.json();
    // Array vazio é resposta válida ("nenhuma faina nova"): não é erro.
    if (!Array.isArray(fainas))
      throw new Error("Resposta do WebPilot inválida (não é uma lista)");

    // 2. Montar registros e inserir com ON CONFLICT DO NOTHING
    const records = fainas.map((f) => ({
      cd_faina_lancha: Number(f.CD_FAINA_LANCHA),
      cd_lancha: Number(f.CD_LANCHA),
      ds_lancha: f.DS_LANCHA,
      ds_local_orig: f.DS_LOCAL_ORIG ?? null,
      ds_local_dest: f.DS_LOCAL_DEST ?? null,
      dh_inicio: f.DH_INICIO,
      dh_fim: f.DH_FIM ?? null,
      nr_minutos: f.NR_MINUTOS ?? null,
      dc_horas: f.DC_HORAS ?? null,
    }));

    const { error } = await supabase
      .from("fainas_deslocamentos")
      .upsert(records, { onConflict: "cd_faina_lancha", ignoreDuplicates: true });

    if (error) throw new Error(`Erro ao inserir fainas: ${error.message}`);

    registrosInseridos = records.length;

    const detalhe = `Fainas processadas: ${records.length}`;

    await supabase.from("sync_log").insert({
      status: "sucesso",
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
