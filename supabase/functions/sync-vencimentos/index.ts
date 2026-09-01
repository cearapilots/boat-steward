import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itVencimentos.aspx" +
  "?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeamento: campo da API → tipo interno + label display
const TIPOS: Array<{ campo: string; tipo: string; label: string }> = [
  { campo: "DT_VENCTO_INSCRICAO",              tipo: "inscricao",        label: "Inscrição" },
  { campo: "DT_VENCTO_HOMOLOG",                tipo: "homolog",          label: "Homologação" },
  { campo: "DT_VENCTO_AGULHA",                 tipo: "agulha",           label: "Agulha" },
  { campo: "DT_VENCTO_BALSA",                  tipo: "balsa",            label: "Balsa" },
  { campo: "DT_VENCTO_SISTEMA_COMBATE_INCENDIO", tipo: "combate_incendio", label: "Combate a Incêndio" },
  { campo: "DT_VENCTO_SEGURO",                 tipo: "seguro",           label: "Seguro" },
  { campo: "DT_VENCTO_SEGURO_DPEM",            tipo: "seguro_dpem",      label: "Seguro DPEM" },
];

const LANCHAS_VALIDAS = [121, 1003, 117]; // Flexeiras, Fortim, Taíba

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot HTTP ${resp.status}`);
    const dados = await resp.json();
    if (!Array.isArray(dados)) throw new Error("Resposta inválida");

    const hoje = new Date().toISOString().slice(0, 10);
    let atualizados = 0;
    let historico   = 0;
    const detalhes: string[] = [];
    const falhas: string[]   = [];

    for (const d of dados) {
      const cdLancha = Number(d.CD_LANCHA);
      if (!LANCHAS_VALIDAS.includes(cdLancha)) continue;
      const dsLancha = (d.DS_LANCHA ?? "").trim();

      for (const { campo, tipo, label } of TIPOS) {
        const novaData = d[campo] ? d[campo].slice(0, 10) : null;
        if (!novaData) continue;

        // Buscar registro atual no banco
        const { data: atualRows } = await supabase
          .from("vencimentos")
          .select("dt_vencimento")
          .eq("cd_lancha", cdLancha)
          .eq("tipo", tipo)
          .limit(1);
        const atual = atualRows?.[0] ?? null;

        if (atual && atual.dt_vencimento !== novaData) {
          // Data mudou → a data antiga foi renovada
          // Se a data antiga já passou → era um vencimento que foi tratado
          if (atual.dt_vencimento < hoje) {
            const { error: errHist } = await supabase.from("vencimentos_historico").insert({
              cd_lancha:    cdLancha,
              ds_lancha:    dsLancha,
              tipo,
              tipo_label:   label,
              dt_vencimento: atual.dt_vencimento,
              dt_detectado:  hoje,
            });
            if (errHist) {
              falhas.push(`Histórico ${dsLancha} ${label}: ${errHist.message}`);
            } else {
              historico++;
              detalhes.push(`Histórico: ${dsLancha} ${label} (${atual.dt_vencimento} → ${novaData})`);
            }
          }
        }

        // Upsert com nova data
        const { error: errUpsert } = await supabase.from("vencimentos").upsert({
          cd_lancha:    cdLancha,
          ds_lancha:    dsLancha,
          tipo,
          tipo_label:   label,
          dt_vencimento: novaData,
          updated_at:   new Date().toISOString(),
        }, { onConflict: "cd_lancha,tipo" });

        // Sem esta checagem, uma rejeição do banco (tipo novo barrado por
        // constraint, por exemplo) passaria silenciosa e o sync reportaria
        // sucesso sem ter gravado nada.
        if (errUpsert) {
          falhas.push(`${dsLancha} ${label}: ${errUpsert.message}`);
          continue;
        }

        atualizados++;
      }
    }

    const detalhe = `${atualizados} vencimentos atualizados, ${historico} movidos para histórico.`
      + (detalhes.length ? ` ${detalhes.join(" | ")}` : "")
      + (falhas.length   ? ` | FALHAS: ${falhas.join(" | ")}` : "");
    await supabase.from("sync_log").insert({
      status: falhas.length ? "parcial" : "sucesso", lanchas_atualizadas: 0,
      eventos_importados: atualizados, detalhe,
    });

    return new Response(
      JSON.stringify({ sucesso: falhas.length === 0, atualizados, historico, falhas, detalhe }),
      { headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await supabase.from("sync_log").insert({
      status: "erro", lanchas_atualizadas: 0, eventos_importados: 0, detalhe: mensagem,
    });
    return new Response(
      JSON.stringify({ sucesso: false, erro: mensagem }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
