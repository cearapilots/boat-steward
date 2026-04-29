import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL = "https://webpilot.cearapilots.com.br/WebPilot/integracao/itLanchasCEARA.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let lanchasAtualizadas = 0;
  let detalhe = "";

  try {
    // 1. Buscar dados do WebPilot
    const response = await fetch(WEBPILOT_URL, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`WebPilot retornou HTTP ${response.status}`);

    const lanchasWebPilot = await response.json();
    // Formato retornado: [{ CD_LANCHA, DS_LANCHA, DC_HORIMETRO_BB, DC_HORIMETRO_BE, DC_HORIMETRO_GERADOR, DH_ULTIMA_ATUALIZACAO }]

    if (!Array.isArray(lanchasWebPilot) || lanchasWebPilot.length === 0)
      throw new Error("Resposta do WebPilot vazia ou inválida");

    // 2. Buscar lanchas do banco com id_webpilot preenchido
    const { data: lanchasBanco, error: erroBanco } = await supabase
      .from("lanchas")
      .select("id, nome, id_webpilot, horimetro, horimetro_gerador")
      .not("id_webpilot", "is", null);

    if (erroBanco) throw new Error(`Erro ao buscar lanchas: ${erroBanco.message}`);

    const resultados: string[] = [];

    // 3. Atualizar cada lancha pelo CD_LANCHA (id_webpilot)
    for (const wp of lanchasWebPilot) {
      const lancha = lanchasBanco?.find(
        (l) => l.id_webpilot === String(wp.CD_LANCHA)
      );

      if (!lancha) {
        resultados.push(`CD_LANCHA ${wp.CD_LANCHA} (${wp.DS_LANCHA}): não encontrada no banco`);
        continue;
      }

      // Proteção: não atualizar se horímetro regrediu
      if (wp.DC_HORIMETRO_BB < lancha.horimetro) {
        resultados.push(`${lancha.nome}: horímetro WebPilot (${wp.DC_HORIMETRO_BB}) menor que banco (${lancha.horimetro}), ignorado`);
        continue;
      }

      const { error: erroUpdate } = await supabase
        .from("lanchas")
        .update({
          horimetro: wp.DC_HORIMETRO_BB,
          horimetro_gerador: wp.DC_HORIMETRO_GERADOR,
          ultima_atualizacao: wp.DH_ULTIMA_ATUALIZACAO,
        })
        .eq("id", lancha.id);

      if (erroUpdate) {
        resultados.push(`${lancha.nome}: erro — ${erroUpdate.message}`);
        continue;
      }

      lanchasAtualizadas++;
      resultados.push(`${lancha.nome}: ${lancha.horimetro}h → ${wp.DC_HORIMETRO_BB}h | Gerador: ${lancha.horimetro_gerador}h → ${wp.DC_HORIMETRO_GERADOR}h`);
    }

    detalhe = resultados.join(" | ");

    // 4. Gravar no sync_log
    await supabase.from("sync_log").insert({
      status: lanchasAtualizadas > 0 ? "sucesso" : "parcial",
      lanchas_atualizadas: lanchasAtualizadas,
      eventos_importados: lanchasWebPilot.length,
      detalhe,
    });

    return new Response(
      JSON.stringify({ sucesso: true, lanchas_atualizadas: lanchasAtualizadas, detalhe }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
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
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
