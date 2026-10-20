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

    // 2. Montar registros
    //
    // ⚠️ DURACAO SEM FIM VEM ZERADA DA ORIGEM, e zero e um valor valido de
    //    duracao: entra em media e mediana sem avisar. Ja custou uma conclusao
    //    — a faina 512 tem DH_FIM nulo com NR_MINUTOS 0, e inclui-la puxava a
    //    mediana de travessia de 102 para 99 minutos. Nulo deixa o registro
    //    fora do calculo naturalmente, que e o comportamento correto.
    //
    //    Tratamos aqui em vez de pedir a origem: e regra nossa de leitura, nao
    //    defeito deles. Travessia entre portos leva ~2 h; zero ou negativo nao
    //    e duracao curta, e ausencia de medida.
    const duracao = (f: WpFaina) => {
      const semFim = !f.DH_FIM;
      const nr = semFim || Number(f.NR_MINUTOS) <= 0 ? null : Number(f.NR_MINUTOS);
      const dc = semFim || Number(f.DC_HORAS) <= 0 ? null : Number(f.DC_HORAS);
      return { nr_minutos: nr, dc_horas: dc };
    };

    const records = fainas.map((f) => ({
      cd_faina_lancha: Number(f.CD_FAINA_LANCHA),
      cd_lancha: Number(f.CD_LANCHA),
      ds_lancha: f.DS_LANCHA,
      ds_local_orig: f.DS_LOCAL_ORIG ?? null,
      ds_local_dest: f.DS_LOCAL_DEST ?? null,
      dh_inicio: f.DH_INICIO,
      dh_fim: f.DH_FIM ?? null,
      ...duracao(f),
    }));

    // ⚠️ SOBRESCREVE no conflito — mudou em 30/09/2026.
    //
    // Antes era `ignoreDuplicates: true`, e o efeito era o defeito sistemico do
    // Apendice C.8: a faina entrava enquanto ainda estava em curso, sem DH_FIM,
    // e quando a origem a completava a correcao nunca chegava aqui. Foi o que
    // aconteceu com a faina 524 — o endpoint tinha DH_FIM 12:47 e 107 min, e o
    // nosso banco guardava nulo com zeros, por 15 dias.
    //
    // O WebPilot e o sistema de registro das fainas. Se ele mudar um campo,
    // refletir e o certo — inclusive se um dia despreencher um.
    const { error } = await supabase
      .from("fainas_deslocamentos")
      .upsert(records, { onConflict: "cd_faina_lancha", ignoreDuplicates: false });

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
