import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itAbastecimentos.aspx" +
  "?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WpAbastecimento = {
  CD_ABASTECIMENTO: number | string;
  DH_ABASTECIMENTO: string;
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  DS_POSTO: string;
  DC_LITROS: number | null;
  VL_UNITARIO: number | null;
  VL_TOTAL: number | null;
  DC_HORIMETRO_BB: number | null;
  DC_HORIMETRO_BE: number | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Buscar dados do WebPilot
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot retornou HTTP ${resp.status}`);

    const dados: WpAbastecimento[] = await resp.json();
    // Array vazio é resposta válida ("nenhum abastecimento novo"): não é erro.
    if (!Array.isArray(dados))
      throw new Error("Resposta inválida (não é uma lista)");

    // 2. Montar registros
    const records = dados
      .map((d) => {
        const dh = d.DH_ABASTECIMENTO ?? "";
        const ano_mes = dh.slice(0, 7); // "2026-07"
        return {
          cd_abastecimento: Number(d.CD_ABASTECIMENTO),
          dh_abastecimento: dh,
          cd_lancha:        Number(d.CD_LANCHA),
          ds_lancha:        (d.DS_LANCHA ?? "").trim(),
          ds_posto:         (d.DS_POSTO  ?? "").trim(),
          dc_litros:        d.DC_LITROS    ?? null,
          vl_unitario:      d.VL_UNITARIO  ?? null,
          vl_total:         d.VL_TOTAL     ?? null,
          dc_horimetro_bb:  d.DC_HORIMETRO_BB ?? null,
          dc_horimetro_be:  d.DC_HORIMETRO_BE ?? null,
          ano_mes,
        };
      })
      .filter(r => r.cd_abastecimento && r.dh_abastecimento);

    // 3. Upsert — SOBRESCREVE no conflito. Mudou em 30/09/2026.
    //
    // Antes era `ignoreDuplicates: true`, e o efeito era o defeito do Apendice
    // C.8: uma vez inserida, a linha nunca mais era atualizada, entao correcao
    // feita no WebPilot nao chegava aqui. Custou o caso de 16/09/2026 — o
    // lancamento de 40 L a R$ 22,45 da Vibra foi corrigido na origem para 770 L
    // a R$ 5,67 e o detector 10 seguia disparando com o valor velho.
    //
    // A protecao contra o outro lado (origem parar de mandar um campo e a
    // sobrescrita apagar dado bom) NAO esta aqui: esta no trigger
    // `nao_apaga_com_nulo` da tabela. Ver a migration 20260930120000.
    const { error } = await supabase
      .from("abastecimentos_combustivel")
      .upsert(records, { onConflict: "cd_abastecimento", ignoreDuplicates: false });

    if (error) throw error;

    // 4. Gravar no sync_log
    const detalhe = `Abastecimentos combustível: ${records.length} registros processados`;
    await supabase.from("sync_log").insert({
      status: "sucesso",
      lanchas_atualizadas: 0,
      eventos_importados: records.length,
      detalhe,
    });

    return new Response(
      JSON.stringify({ sucesso: true, registros: records.length, detalhe }),
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
