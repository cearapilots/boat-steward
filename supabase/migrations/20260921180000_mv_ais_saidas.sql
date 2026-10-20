-- ⚠️ SUPERADA EM 21/09/2026 por 20260921200000_ais_buffer_base_50m.sql, que
--    recria esta view com raio de tolerancia de 50 m nas cercas de base. A
--    definicao abaixo classifica a lancha amarrada como "fora" toda vez que o
--    GPS oscila. Mantida so para historico — nao rode isoladamente.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_saidas — uma linha por SAIDA da base, em vez de uma por dia
--
-- Terceira e ultima camada da serie AIS:
--   mv_ais_cobertura_dia → quanto do dia o AIS enxergou
--   mv_ais_base_dia      → onde a lancha estava no tempo enxergado
--   mv_ais_saidas        → cada ida e volta, como evento individual
--
-- E a camada que a gestao pediu sem saber o nome: noites consecutivas fora,
-- retorno curto entre saidas, e o cruzamento "saiu mas nao ha manobra
-- registrada". Nenhuma dessas perguntas se responde com media diaria.
--
-- MATERIALIZADA, E NAO VIEW SIMPLES. Eu tinha chamado de `v_ais_saidas`. Uma
-- view comum refaria a classificacao espacial das 709 mil posicoes a cada
-- consulta e estouraria o timeout de 8 s do PostgREST antes da primeira linha.
-- O nome mudou junto com a decisao.
--
-- ─── DEFINICAO DE SAIDA ──────────────────────────────────────────────────────
--
-- Mesma convencao da diaria (o intervalo pertence ao estado da posicao
-- anterior), levada ao grao de evento:
--
--     ... base, base, FORA, fora, fora, base, base ...
--                     ^inicio              ^fim
--
-- A saida COMECA na primeira posicao fora e TERMINA na primeira posicao de base
-- seguinte. Isso nao e escolha estetica: e o que faz a soma das duracoes bater
-- com `horas_fora` da diaria. Se comecasse na ultima posicao de base, cada saida
-- ganharia ate 3 minutos que a diaria contou como base, e as duas camadas
-- passariam a discordar. Ver verificacao 3.
--
-- ─── O PROBLEMA DO RUIDO, que a diaria escondia ──────────────────────────────
--
-- A cerca do Mucuripe tem ~1.152 m² — algo como 34 x 34 m. A precisao tipica do
-- AIS e da ordem de 10 m. Uma lancha ATRACADA pode, sozinha, piscar para fora da
-- cerca e voltar na posicao seguinte.
--
-- Na diaria isso custava minutos diluidos em 744 horas e nao mudava conclusao
-- nenhuma. Aqui cada pisca vira UMA SAIDA. Se ninguem filtrar, a contagem pode
-- vir varias vezes maior que a realidade — e contagem de saidas e exatamente o
-- numero que vai para a gestao.
--
-- Por isso a coluna `provavel_ruido`, com regra explicita e conservadora:
--
--     afastamento_max_km < 0,15  E  duracao_h < 0,25
--     (nunca passou de 150 m da base E durou menos de 15 min)
--
-- Uma lancha que realmente sai do berco cruza esses dois limites em minutos.
-- A regra esta em COLUNA, nao em WHERE, de proposito: quem consome decide, e da
-- para auditar quantos eventos ela descarta (verificacao 4) em vez de descobrir
-- um dia que a view vinha escondendo saidas de verdade.
--
-- ⚠️ REGRA DE USO: para CONTAR saidas, filtre `NOT provavel_ruido`. Para SOMAR
--    horas, NAO filtre — as horas de ruido ja estao na diaria, e retira-las aqui
--    quebraria a conciliacao entre as duas camadas.
--
-- ─── SAIDA COM BURACO DENTRO ─────────────────────────────────────────────────
--
-- Se o AIS silencia por mais de 30 min no meio de uma saida, a lancha pode ter
-- voltado e saido de novo sem que se veja. Eu NAO parto o episodio em dois:
-- isso inventaria uma volta a base que ninguem observou. Mantenho um episodio e
-- declaro o buraco em `horas_nao_resolvidas` e `cobertura_pct`. Uma saida com
-- cobertura de 60% e uma saida com uma pergunta em aberto, nao um fato.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_saidas;

CREATE MATERIALIZED VIEW public.mv_ais_saidas AS
WITH par AS (
  SELECT 30 AS limiar_min
),
-- Cerca-primeiro: o indice GiST esta em posicoes_ais.geom. Nao inverta.
cerca_da_pos AS (
  SELECT p.id, cd.codigo, cd.papel
    FROM public.cercas_digitais cd
    JOIN public.posicoes_ais p
      ON ST_Covers(cd.geom, p.geom)
   WHERE cd.vigencia_fim IS NULL
     AND p.tem_posicao
),
pos AS (
  SELECT p.id,
         p.cd_lancha,
         p.ds_lancha,
         p.dh_posicao,
         p.dc_sog,
         cp.codigo AS cerca,
         -- papel NULO = fora de todas as cercas = fora. COALESCE explicito
         -- porque `NULL = 'base'` da NULL, nao falso, e NULL nao agrupa.
         COALESCE(cp.papel = 'base', false) AS na_base,
         -- Afastamento so interessa fora da base; dentro e zero por definicao.
         -- O CASE evita o ST_Distance nas centenas de milhares de posicoes
         -- atracadas, que sao a maioria absoluta da tabela.
         CASE WHEN COALESCE(cp.papel = 'base', false) THEN 0
              ELSE (SELECT min(ST_Distance(p.geom, b.geom))
                      FROM public.cercas_digitais b
                     WHERE b.vigencia_fim IS NULL AND b.papel = 'base')
         END AS dist_base_m
    FROM public.posicoes_ais p
    LEFT JOIN cerca_da_pos cp ON cp.id = p.id
   WHERE p.tem_posicao
),
marcado AS (
  SELECT po.*,
         lead(po.dh_posicao) OVER w AS prox_t,
         lag(po.na_base)     OVER w AS ant_base
    FROM pos po
  WINDOW w AS (PARTITION BY po.cd_lancha ORDER BY po.dh_posicao)
),
-- Ilhas: soma corrida que incrementa a cada transicao base → fora.
numerado AS (
  SELECT m.*,
         sum(CASE WHEN NOT m.na_base AND (m.ant_base IS NULL OR m.ant_base)
                  THEN 1 ELSE 0 END)
           OVER (PARTITION BY m.cd_lancha ORDER BY m.dh_posicao
                 ROWS UNBOUNDED PRECEDING) AS ep
    FROM marcado m
),
episodios AS (
  SELECT n.cd_lancha,
         max(n.ds_lancha) AS ds_lancha,
         n.ep,
         min(n.dh_posicao) AS inicio,
         -- prox_t da ultima posicao fora = primeira posicao de base seguinte.
         -- max() ignora NULL, entao num episodio em aberto isso devolveria a
         -- propria ultima posicao; `em_aberto` abaixo desarma esse caso.
         max(n.prox_t)             AS fim_bruto,
         bool_or(n.prox_t IS NULL) AS em_aberto,
         count(*)                  AS n_posicoes,
         max(n.dc_sog)             AS sog_max,
         max(n.dist_base_m)        AS afastamento_max_m,
         bool_or(n.cerca = 'iate_clube') AS passou_iate_clube,
         -- Buracos DENTRO do episodio, mesmo limiar da diaria.
         COALESCE(sum(EXTRACT(epoch FROM (n.prox_t - n.dh_posicao)))
                    FILTER (WHERE (n.prox_t - n.dh_posicao)
                                  > (SELECT limiar_min FROM par) * interval '1 minute'), 0)
           AS seg_nao_resolvidos
    FROM numerado n
   WHERE NOT n.na_base
     AND n.ep > 0
   GROUP BY n.cd_lancha, n.ep
)
SELECT
  e.ds_lancha,
  e.cd_lancha,
  e.ep AS nr_saida,
  e.inicio,
  CASE WHEN e.em_aberto THEN NULL ELSE e.fim_bruto END AS fim,
  e.em_aberto,
  (e.inicio AT TIME ZONE 'America/Fortaleza')::date AS dia_inicio,
  EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza'))::int AS hora_inicio,
  -- Noturna pelo HORARIO DE PARTIDA. Uma saida as 23h que volta as 2h conta
  -- como UMA noite, nao duas — a pergunta da gestao e sobre a escala de quem
  -- embarcou, e quem embarcou saiu as 23h.
  (EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza')) >= 18
   OR EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza')) < 6) AS noturna,
  CASE WHEN e.em_aberto THEN NULL
       ELSE round((EXTRACT(epoch FROM (e.fim_bruto - e.inicio)) / 3600.0)::numeric, 2)
  END AS duracao_h,
  round((e.seg_nao_resolvidos / 3600.0)::numeric, 2) AS horas_nao_resolvidas,
  CASE WHEN e.em_aberto OR e.fim_bruto <= e.inicio THEN NULL
       ELSE round((100.0 * (1 - e.seg_nao_resolvidos
                                / EXTRACT(epoch FROM (e.fim_bruto - e.inicio))))::numeric, 1)
  END AS cobertura_pct,
  e.n_posicoes,
  round(e.sog_max::numeric, 1)                      AS sog_max,
  round((e.afastamento_max_m / 1000.0)::numeric, 2) AS afastamento_max_km,
  e.passou_iate_clube,
  -- Ver o bloco "O PROBLEMA DO RUIDO" no cabecalho ANTES de usar esta coluna.
  (e.afastamento_max_m < 150
   AND NOT e.em_aberto
   AND (e.fim_bruto - e.inicio) < interval '15 minutes') AS provavel_ruido,
  (SELECT limiar_min FROM par) AS limiar_min
FROM episodios e;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_saidas_pk
  ON public.mv_ais_saidas (cd_lancha, nr_saida);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_inicio
  ON public.mv_ais_saidas (inicio);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_dia
  ON public.mv_ais_saidas (dia_inicio);

COMMENT ON MATERIALIZED VIEW public.mv_ais_saidas IS
  'Uma linha por saida da base. Para CONTAR saidas filtre NOT provavel_ruido; para SOMAR horas nao filtre (quebraria a conciliacao com mv_ais_base_dia). A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_saidas TO anon, authenticated;

-- ─── Refresh, ultimo elo da corrente diaria ──────────────────────────────────
-- sync-ais 09:40 → cobertura 09:50 → base 10:00 → saidas 10:10 (tudo UTC).
SELECT cron.unschedule('refresh-ais-saidas-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-saidas-diario');

SELECT cron.schedule(
  'refresh-ais-saidas-diario',
  '10 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_saidas$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACAO — rode depois; nada aqui altera dados.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) PANORAMA DE AGOSTO. Primeira leitura: quantas saidas sobram depois do
--    filtro de ruido, e quanto tempo elas representam.
--
-- SELECT ds_lancha,
--        count(*)                                   AS saidas_brutas,
--        count(*) FILTER (WHERE NOT provavel_ruido) AS saidas_reais,
--        count(*) FILTER (WHERE provavel_ruido)     AS descartadas_ruido,
--        round(sum(duracao_h) FILTER (WHERE NOT provavel_ruido), 1) AS horas_saidas_reais,
--        round(avg(duracao_h) FILTER (WHERE NOT provavel_ruido), 2) AS media_h,
--        round(max(duracao_h) FILTER (WHERE NOT provavel_ruido), 2) AS maior_h,
--        count(*) FILTER (WHERE noturna AND NOT provavel_ruido)     AS noturnas
--   FROM public.mv_ais_saidas
--  WHERE dia_inicio BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;

-- 2) O FILTRO DE RUIDO ESTA CERTO? Esta e a query que decide se a regra pode
--    ficar. Olhe as descartadas: se alguma tiver SOG alto, a regra esta
--    comendo saida de verdade e o limite precisa cair.
--    ESPERADO: sog_max baixo (< 3 kn) em praticamente todas.
--
-- SELECT ds_lancha, inicio, duracao_h, afastamento_max_km, sog_max, n_posicoes
--   FROM public.mv_ais_saidas
--  WHERE provavel_ruido
--  ORDER BY sog_max DESC NULLS LAST
--  LIMIT 25;

-- 3) CONCILIACAO COM A DIARIA. A soma de (duracao - nao_resolvido) sobre TODOS
--    os episodios fechados tem que reproduzir o total de horas_fora da diaria.
--    Nao e exato por dois motivos conhecidos e aceitos: o episodio ainda em
--    aberto no fim da serie, e as bordas da serie (ver cabecalho da
--    mv_ais_base_dia). Diferenca de poucas horas e esperada; diferenca de
--    dezenas significa que a definicao de inicio/fim saiu de sincronia.
--
-- SELECT
--   (SELECT round(sum(duracao_h - horas_nao_resolvidas), 1)
--      FROM public.mv_ais_saidas WHERE NOT em_aberto) AS pelas_saidas,
--   (SELECT round(sum(horas_fora), 1)
--      FROM public.mv_ais_base_dia)                   AS pela_diaria;

-- 4) DISTRIBUICAO DAS DURACOES. Confirma se a regra de ruido pegou o ponto
--    certo: espera-se um amontoado de episodios de poucos minutos (o pisca do
--    AIS no berco) e depois um vale, antes das saidas de verdade.
--
-- SELECT CASE WHEN duracao_h < 0.10 THEN 'a) < 6 min'
--             WHEN duracao_h < 0.25 THEN 'b) 6-15 min'
--             WHEN duracao_h < 0.50 THEN 'c) 15-30 min'
--             WHEN duracao_h < 1.00 THEN 'd) 30-60 min'
--             WHEN duracao_h < 3.00 THEN 'e) 1-3 h'
--             ELSE                       'f) > 3 h' END AS faixa,
--        count(*), round(avg(afastamento_max_km), 2) AS afast_medio_km,
--        round(avg(sog_max), 1) AS sog_medio
--   FROM public.mv_ais_saidas WHERE NOT em_aberto
--  GROUP BY 1 ORDER BY 1;

-- 5) AS ONZE SAIDAS DA FORTIM, 19 a 25/08 — a pergunta que abriu esta serie
--    toda. Agora com duracao, afastamento e cobertura de cada uma.
--
-- SELECT ds_lancha, inicio, fim, duracao_h, afastamento_max_km, sog_max,
--        cobertura_pct, passou_iate_clube, provavel_ruido
--   FROM public.mv_ais_saidas
--  WHERE dia_inicio BETWEEN '2026-08-19' AND '2026-08-25'
--  ORDER BY inicio;
