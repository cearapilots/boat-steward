-- ⚠️ SUPERADA EM 21/09/2026 por 20260921200000_ais_buffer_base_50m.sql, que
--    recria esta view com raio de tolerancia de 50 m nas cercas de base. A
--    definicao abaixo classifica a lancha amarrada como "fora" toda vez que o
--    GPS oscila. Mantida so para historico — nao rode isoladamente.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_base_dia — quanto de cada dia a lancha passou na base, fora, ou sem AIS
--
-- Sequencia da `mv_ais_cobertura_dia`: aquela diz quanto do dia foi observado,
-- esta diz ONDE a lancha estava no tempo observado. As duas fecham em 24 h.
--
--   horas_base + horas_fora + horas_nao_resolvidas = 24 h
--
-- ⚠️ `horas_nao_resolvidas` NAO e zero disfarcado. E a parte do dia em que o AIS
--    nao permite afirmar nada. Publicar "tempo fora da base" sem esta coluna ao
--    lado infla a exposicao justamente da lancha com o transponder pior — foi o
--    motivo de a cobertura vir primeiro. Sempre mostre as duas.
--
-- DUAS DECISOES, tomadas em 21/09/2026
--
--  1. TRANSICAO PERTENCE AO ESTADO ANTERIOR. Quando uma posicao esta na base e a
--     seguinte esta fora, o intervalo entre as duas conta como base. Com
--     posicoes a cada 2 a 3 minutos, o erro maximo por transicao e de 3 minutos;
--     dividir no meio ganharia segundos e custaria complexidade.
--
--  2. IATE CLUBE CONTA COMO FORA. Ele nao e base — o documento da gestao e
--     explicito que e area de evento, nao estadia. Operacionalmente a lancha
--     esta longe do berco. Fica exposto em coluna propria, SUBCONJUNTO de
--     `horas_fora`, porque a gestao quer estatisticas de embarque pelo clube
--     depois. Espere numero baixissimo: medido em 19–25/08/2026, foram 24
--     travessias, 15 delas de 1 minuto ou menos. Ver cercas_ais.md §2.
--
-- BORDAS DA SERIE: o primeiro e o ultimo dia de cada lancha nao fecham em 24 h.
-- Antes da primeira posicao e depois da ultima nao existe par para medir, e eu
-- prefiro a linha curta a inventar 24 h de nada. Herdado da cobertura, de
-- proposito. Nao use esses dois dias em comparacao — todo o periodo de interesse
-- (2025-01 em diante) e interior a serie.
--
-- DESEMPENHO: a junção com as cercas e escrita CERCA-PRIMEIRO de proposito. O
-- indice GiST vive em `posicoes_ais.geom`, entao percorrer as 3 cercas e deixar
-- o indice achar os pontos de cada uma e ordens de grandeza mais barato que
-- perguntar, ponto a ponto, em qual cerca ele cai. Nao inverta.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_base_dia;

CREATE MATERIALIZED VIEW public.mv_ais_base_dia AS
WITH par AS (
  SELECT 30 AS limiar_min
),
-- Cerca de cada posicao. Cerca-primeiro: ver nota de desempenho acima.
cerca_da_pos AS (
  SELECT p.id, cd.codigo, cd.papel
    FROM public.cercas_digitais cd
    JOIN public.posicoes_ais p
      ON ST_Covers(cd.geom, p.geom)
   WHERE cd.vigencia_fim IS NULL
     AND p.tem_posicao
),
pares AS (
  SELECT p.cd_lancha,
         p.ds_lancha,
         p.dh_posicao AS t1,
         lead(p.dh_posicao) OVER (PARTITION BY p.cd_lancha ORDER BY p.dh_posicao) AS t2,
         cp.codigo AS cerca,
         cp.papel  AS papel
    FROM public.posicoes_ais p
    LEFT JOIN cerca_da_pos cp ON cp.id = p.id
   WHERE p.tem_posicao
),
-- Um segmento por dia local atravessado, como na cobertura.
segmentos AS (
  SELECT pr.cd_lancha,
         pr.ds_lancha,
         d::date AS dia,
         GREATEST(pr.t1, (d::timestamp AT TIME ZONE 'America/Fortaleza'))                   AS ini,
         LEAST(pr.t2, ((d::timestamp + interval '1 day') AT TIME ZONE 'America/Fortaleza')) AS fim,
         -- `papel`, nao o codigo: se uma base nova for cadastrada amanha, ela
         -- entra em horas_base sozinha. Se eu tivesse fixado os codigos, ela
         -- cairia calada em "fora" e a metrica mentiria sem avisar.
         CASE
           WHEN (pr.t2 - pr.t1) > (SELECT limiar_min FROM par) * interval '1 minute'
                THEN 'nao_resolvido'
           WHEN pr.papel = 'base' THEN 'base'
           ELSE 'fora'
         END AS estado,
         pr.cerca
    FROM pares pr
    CROSS JOIN LATERAL generate_series(
           (pr.t1 AT TIME ZONE 'America/Fortaleza')::date,
           (pr.t2 AT TIME ZONE 'America/Fortaleza')::date,
           interval '1 day') AS d
   WHERE pr.t2 IS NOT NULL
),
horas AS (
  SELECT s.cd_lancha,
         s.dia,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'base')  AS s_base,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'fora')  AS s_fora,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'nao_resolvido') AS s_nao,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'base' AND s.cerca = 'mucuripe_base')           AS s_muc,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'base' AND s.cerca = 'pecem_base')              AS s_pec,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'fora' AND s.cerca = 'iate_clube')              AS s_iate
    FROM segmentos s
   WHERE s.fim > s.ini
   GROUP BY 1, 2
),
contagem AS (
  SELECT p.cd_lancha,
         (p.dh_posicao AT TIME ZONE 'America/Fortaleza')::date AS dia,
         count(*) AS n_posicoes
    FROM public.posicoes_ais p
   WHERE p.tem_posicao
   GROUP BY 1, 2
),
limites AS (
  SELECT p.cd_lancha,
         max(p.ds_lancha) AS ds_lancha,
         min((p.dh_posicao AT TIME ZONE 'America/Fortaleza')::date) AS d0,
         max((p.dh_posicao AT TIME ZONE 'America/Fortaleza')::date) AS d1
    FROM public.posicoes_ais p
   WHERE p.tem_posicao
   GROUP BY 1
),
espinha AS (
  SELECT l.cd_lancha, l.ds_lancha, d::date AS dia
    FROM limites l
    CROSS JOIN LATERAL generate_series(l.d0, l.d1, interval '1 day') AS d
)
SELECT
  e.ds_lancha,
  e.cd_lancha,
  e.dia,
  COALESCE(c.n_posicoes, 0) AS n_posicoes,
  round((COALESCE(h.s_base, 0) / 3600.0)::numeric, 2)                         AS horas_base,
  round((COALESCE(h.s_muc, 0)  / 3600.0)::numeric, 2)                         AS horas_mucuripe,
  round((COALESCE(h.s_pec, 0)  / 3600.0)::numeric, 2)                         AS horas_pecem,
  round((COALESCE(h.s_fora, 0) / 3600.0)::numeric, 2)                         AS horas_fora,
  round((COALESCE(h.s_iate, 0) / 3600.0)::numeric, 2)                         AS horas_iate_clube,
  -- Dia sem posicao nenhuma e 24 h nao resolvidas, nao zero.
  CASE WHEN COALESCE(c.n_posicoes, 0) = 0
       THEN 24.00
       ELSE round((COALESCE(h.s_nao, 0) / 3600.0)::numeric, 2)
  END AS horas_nao_resolvidas,
  (SELECT limiar_min FROM par) AS limiar_min
FROM espinha e
LEFT JOIN contagem c ON c.cd_lancha = e.cd_lancha AND c.dia = e.dia
LEFT JOIN horas    h ON h.cd_lancha = e.cd_lancha AND h.dia = e.dia;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_base_pk
  ON public.mv_ais_base_dia (cd_lancha, dia);
CREATE INDEX IF NOT EXISTS idx_mv_ais_base_dia
  ON public.mv_ais_base_dia (dia);

COMMENT ON MATERIALIZED VIEW public.mv_ais_base_dia IS
  'Horas por dia local na base, fora e nao resolvidas, por lancha. horas_iate_clube e SUBCONJUNTO de horas_fora. Nunca publique horas_fora sem horas_nao_resolvidas ao lado. A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_base_dia TO anon, authenticated;


-- ─── Refresh diario, 10 min depois da cobertura ──────────────────────────────
-- sync-ais 09:40 → refresh cobertura 09:50 → refresh base 10:00 (tudo UTC).
-- CONCURRENTLY exige o indice unico criado acima e nao roda dentro de
-- transacao — por isso vai pelo cron, e nao no corpo desta migration.
SELECT cron.unschedule('refresh-ais-base-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-base-diario');

SELECT cron.schedule(
  'refresh-ais-base-diario',
  '0 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_base_dia$$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACAO — rode depois; nada aqui altera dados.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) FECHAMENTO EM 24 h. base + fora + nao_resolvido tem que dar 744 h em
--    agosto (31 x 24) para cada lancha. Qualquer desvio acima de arredondamento
--    (centesimos) e erro de particao dos segmentos.
--
-- SELECT ds_lancha,
--        round(sum(horas_base), 1)            AS base_h,
--        round(sum(horas_fora), 1)            AS fora_h,
--        round(sum(horas_nao_resolvidas), 1)  AS nao_resolvido_h,
--        round(sum(horas_base + horas_fora + horas_nao_resolvidas), 1) AS total_h,
--        round(sum(horas_iate_clube), 2)      AS iate_h
--   FROM public.mv_ais_base_dia
--  WHERE dia BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;

-- 2) RECONCILIACAO COM A COBERTURA. As duas views leem a mesma tabela com o
--    mesmo limiar, entao tem que casar linha a linha: o tempo observado da
--    cobertura e exatamente base + fora, e o nao resolvido e identico.
--    Esta query deve retornar ZERO linhas.
--
-- SELECT b.ds_lancha, b.dia,
--        c.horas_observadas, (b.horas_base + b.horas_fora) AS base_mais_fora,
--        c.horas_nao_resolvidas AS cob_nao, b.horas_nao_resolvidas AS base_nao
--   FROM public.mv_ais_base_dia b
--   JOIN public.mv_ais_cobertura_dia c
--     ON c.cd_lancha = b.cd_lancha AND c.dia = b.dia
--  WHERE abs(c.horas_observadas     - (b.horas_base + b.horas_fora)) > 0.02
--     OR abs(c.horas_nao_resolvidas -  b.horas_nao_resolvidas)       > 0.02;

-- 3) O IATE CLUBE E SUBCONJUNTO DE FORA, nunca maior. Zero linhas.
--
-- SELECT * FROM public.mv_ais_base_dia WHERE horas_iate_clube > horas_fora + 0.01;

-- 4) LEITURA OPERACIONAL — agosto, dia a dia, so o que a gestao pediu.
--    Note a coluna de nao resolvido: ela e a margem de erro da linha.
--
-- SELECT dia, ds_lancha, horas_base, horas_fora, horas_nao_resolvidas
--   FROM public.mv_ais_base_dia
--  WHERE dia BETWEEN '2026-08-19' AND '2026-08-25'
--  ORDER BY dia, ds_lancha;

-- 5) BASE NOVA NAO DECLARADA. horas_base soma por `papel`, enquanto mucuripe e
--    pecem somam por codigo. Se um dia essas contas divergirem, existe uma
--    terceira cerca com papel 'base' no banco que ninguem colocou em coluna.
--    Nao e bug: e aviso. Zero linhas hoje.
--
-- SELECT dia, ds_lancha, horas_base, horas_mucuripe, horas_pecem
--   FROM public.mv_ais_base_dia
--  WHERE abs(horas_base - (horas_mucuripe + horas_pecem)) > 0.02;
