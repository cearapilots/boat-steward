import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBPILOT_URL =
  "https://webpilot.cearapilots.com.br/WebPilot/integracao/lanchas/itAIS.aspx?chaveAPI=0d915fbe-f9d4-4d73-8e69-e088973a4541";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// O endpoint devolve uma janela móvel de ~48h, atualizada continuamente. Com o
// sync diário isso dá margem de 2x: uma falha isolada é recuperada na execução
// seguinte. Duas falhas seguidas perdem posições em definitivo.
const LOTE = 500;

type WpAis = {
  CD_LANCHA: number | string;
  DS_LANCHA: string;
  NR_MMSI: number | string | null;
  DH_POSICAO: string;
  DC_LATITUDE: number | null;
  DC_LONGITUDE: number | null;
  DC_SOG: number | null;
  DC_COG: number | null;
};

type RegistroAis = {
  cd_lancha: number;
  ds_lancha: string;
  nr_mmsi: number | null;
  dh_posicao: string;
  dc_latitude: number | null;
  dc_longitude: number | null;
  dc_sog: number | null;
  dc_cog: number | null;
};

// O WebPilot manda hora local de Fortaleza sem indicar fuso
// ("2026-09-10T10:41:09.250"). Fortaleza é UTC-3 o ano inteiro — não tem
// horário de verão —, então marcar o offset explicitamente é o que faz o
// Postgres guardar o instante certo, em vez de rotular hora local como UTC.
function paraUtc(bruto: string): string | null {
  const s = (bruto ?? "").trim();
  if (!s) return null;
  // Se um dia passar a vir com fuso, respeita o que veio.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  // Corta a fração de segundo. O export histórico do WebPilot vem só até o
  // segundo, e sem este corte a MESMA leitura entraria duas vezes: uma pelo
  // backfill ("09:46:32") e outra pelo sync ("09:46:32.953"). Medido nos dois
  // lados: truncar não funde leitura nenhuma — 2.369 registros continuam
  // 2.369 chaves distintas, e o histórico de 707 mil linhas idem.
  const semFracao = s.replace(/\.\d+$/, "");
  return `${semFracao}-03:00`;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Buscar dados do WebPilot
    const resp = await fetch(WEBPILOT_URL, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`WebPilot retornou HTTP ${resp.status}`);

    const posicoes: WpAis[] = await resp.json();
    // Array vazio é resposta válida ("nenhuma posição na janela"): não é erro.
    if (!Array.isArray(posicoes))
      throw new Error("Resposta do WebPilot inválida (não é uma lista)");

    // 2. Normalizar. Sem lancha ou sem instante o registro não é rastreável
    //    nem deduplicável, então é descartado e contado.
    const records: RegistroAis[] = [];
    let descartados = 0;

    for (const p of posicoes) {
      const cd = num(p.CD_LANCHA);
      const dh = paraUtc(p.DH_POSICAO);
      if (cd === null || dh === null) {
        descartados++;
        continue;
      }
      records.push({
        cd_lancha:    cd,
        ds_lancha:    p.DS_LANCHA ?? "",
        nr_mmsi:      num(p.NR_MMSI),
        dh_posicao:   dh,
        dc_latitude:  num(p.DC_LATITUDE),
        dc_longitude: num(p.DC_LONGITUDE),
        dc_sog:       num(p.DC_SOG),
        dc_cog:       num(p.DC_COG),
      });
    }

    const comPosicao = records.filter(
      (r) => r.dc_latitude !== null && r.dc_longitude !== null,
    ).length;

    // 3. Gravar em lotes, ignorando o que já existe.
    //
    //    A chave inclui `tem_posicao`, coluna gerada, porque
    //    (cd_lancha, dh_posicao) NÃO é único: cerca de 39% dos registros vêm
    //    sem coordenada — são um segundo fluxo de mensagens do AIS — e às
    //    vezes carregam o mesmo instante de um registro posicionado. Sem
    //    `tem_posicao` um dos dois seria descartado em silêncio.
    for (let i = 0; i < records.length; i += LOTE) {
      const { error } = await supabase
        .from("posicoes_ais")
        .upsert(records.slice(i, i + LOTE), {
          onConflict: "cd_lancha,dh_posicao,tem_posicao",
          ignoreDuplicates: true,
        });
      if (error) throw new Error(`Erro ao inserir posições AIS: ${error.message}`);
    }

    // 4. Registrar no log.
    //    O prefixo "AIS:" é como `v_analytics_sync_health` identifica que a
    //    linha é desta função — `sync_log` não tem coluna de origem, a view
    //    infere pelo texto. NÃO altere o prefixo sem alterar a view junto.
    const detalhe =
      `AIS: ${records.length} recebidas, ${comPosicao} com posição, ` +
      `${records.length - comPosicao} sem posição` +
      (descartados > 0 ? `, ${descartados} descartadas` : "");

    await supabase.from("sync_log").insert({
      status: "sucesso",
      lanchas_atualizadas: 0,
      eventos_importados: records.length,
      detalhe,
    });

    return new Response(
      JSON.stringify({
        sucesso: true,
        registros_recebidos: records.length,
        com_posicao: comPosicao,
        sem_posicao: records.length - comPosicao,
        descartados,
        detalhe,
      }),
      { headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    // A falha também leva o prefixo. Sem isso ela cairia em
    // 'nao_identificado' na view de saúde, que filtra essas linhas fora — e o
    // erro ficaria invisível. É o ponto cego que os outros 8 syncs têm hoje.
    await supabase.from("sync_log").insert({
      status: "erro",
      lanchas_atualizadas: 0,
      eventos_importados: 0,
      detalhe: `AIS: ERRO - ${mensagem}`,
    });
    return new Response(
      JSON.stringify({ sucesso: false, erro: mensagem }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
