import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itManobras.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WpManobra = {
  CD_MANOBRA: number | string;
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  DH_MANOBRA: string;
  DS_PORTO: string | null;
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

    const manobras: WpManobra[] = await resp.json();
    if (!Array.isArray(manobras) || manobras.length === 0)
      throw new Error("Resposta do WebPilot vazia ou inválida");

    // 2. Montar registros e inserir com ON CONFLICT DO NOTHING
    const records = manobras.map((m) => ({
      cd_manobra: Number(m.CD_MANOBRA),
      cd_lancha: Number(m.CD_LANCHA),
      ds_lancha: m.DS_LANCHA,
      dh_manobra: m.DH_MANOBRA,
      ds_porto: m.DS_PORTO ?? null,
    }));

    const { error } = await supabase
      .from("manobras_lanchas")
      .upsert(records, { onConflict: "cd_manobra", ignoreDuplicates: true });

    if (error) throw new Error(`Erro ao inserir manobras: ${error.message}`);

    registrosInseridos = records.length;

    const detalhe = `Manobras processadas: ${records.length}`;

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
