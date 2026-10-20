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
  // [30/09/2026] Campos novos, a pedido nosso. O DH_MANOBRA acima e a grade de
  // agendamento (sempre :00 ou :30); estes sao o evento observado.
  DH_INI_MAN: string | null;    // inicio da manobra do navio
  DH_EMBARQUE: string | null;   // embarque do pratico — sempre <= DH_INI_MAN
  DH_FIM_MAN: string | null;    // fim; nulo enquanto nao finalizada
  NR_MINUTOS: number | null;    // calculado pela origem a partir de DH_INI_MAN
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

    const manobras: WpManobra[] = await resp.json();
    // Array vazio é resposta válida ("nenhuma manobra nova"): não é erro.
    if (!Array.isArray(manobras))
      throw new Error("Resposta do WebPilot inválida (não é uma lista)");

    // 2. Montar registros
    //
    // ⚠️ DURACAO SEM FIM VEM ZERADA DA ORIGEM, e zero e um valor valido: entra
    //    em media e mediana sem avisar. Mesma regra ja aplicada nas fainas, e
    //    pelo mesmo motivo — a faina 512 puxava a mediana de travessia de 102
    //    para 99 minutos. Manobra leva ~1 h; zero nao e duracao curta, e
    //    ausencia de medida. Ver a migration 20260930100000.
    const duracao = (m: WpManobra) => {
      const semFim = !m.DH_FIM_MAN;
      return {
        nr_minutos: semFim || Number(m.NR_MINUTOS) <= 0 ? null : Number(m.NR_MINUTOS),
        dc_horas:   semFim || Number(m.DC_HORAS)   <= 0 ? null : Number(m.DC_HORAS),
      };
    };

    const records = manobras.map((m) => ({
      cd_manobra: Number(m.CD_MANOBRA),
      cd_lancha: Number(m.CD_LANCHA),
      ds_lancha: m.DS_LANCHA,
      dh_manobra: m.DH_MANOBRA,
      ds_porto: m.DS_PORTO ?? null,
      dh_ini_man: m.DH_INI_MAN ?? null,
      dh_embarque: m.DH_EMBARQUE ?? null,
      dh_fim_man: m.DH_FIM_MAN ?? null,
      ...duracao(m),
    }));

    // ⚠️ SOBRESCREVE no conflito — mudou em 30/09/2026, e so agora.
    //
    // Era `ignoreDuplicates: true`, o defeito do Apendice C.8. Mas aqui a
    // troca teve de ESPERAR, e vale saber por que:
    //
    // Em 29/09 o WebPilot reescreveu este endpoint e o campo DS_PORTO sumiu do
    // payload. Com sobrescrita ligada, o sync da manha seguinte teria gravado
    // NULO em ds_porto nas 16.115 linhas da tabela — sem erro e sem alerta. Foi
    // o defeito que nos salvou do defeito: so a manobra nova do dia entrou sem
    // porto. O campo voltou em 30/09, e so entao esta chave foi virada.
    //
    // A protecao permanente contra esse cenario nao esta aqui: esta no trigger
    // `nao_apaga_com_nulo` da tabela, que recusa NULO por cima de valor
    // preenchido. Ver a migration 20260930120000.
    const { error } = await supabase
      .from("manobras_lanchas")
      .upsert(records, { onConflict: "cd_manobra", ignoreDuplicates: false });

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
