-- ============================================================================
-- Horas operadas passam a vir do horímetro, não da soma de dc_dif_be.
--
-- CAUSA: `dc_dif_be` significa "horas desde o evento anterior na sequência do
-- WebPilot", não "horas atribuíveis a esta linha". Quando dois eventos caem no
-- mesmo momento — uma faina e uma mudança de local, por exemplo — os dois
-- carregam o mesmo valor. Somar a coluna conta o mesmo intervalo duas vezes.
--
-- Verificado em 03/09/2026: em 72 de 77 leituras pós-13/06 vale
-- `dc_dif_be = horímetro atual − horímetro da leitura anterior`. As 5 exceções
-- referenciam um evento ainda mais antigo, porque a numeração do WebPilot não
-- segue a ordem cronológica (o Abastecimento 3330 tem timestamp anterior ao
-- 3340). O campo está certo; o uso é que estava errado.
--
-- EFEITO MEDIDO nos 12 meses até ago/2026: soma = 5.247 h, real = 4.773 h.
-- Inflação de 474 h (10%), chegando a +70% em meses isolados. Zero antes de
-- maio/2026, porque até então havia um evento por momento.
--
-- MÉTODO: o horímetro é estimado por interpolação linear na virada de cada mês,
-- e as horas do mês são a diferença entre as duas viradas. Escolhido depois de
-- descartar dois outros:
--   · SUM(dc_dif_be)     — errado por construção
--   · soma dos passos    — não determinístico: com duas leituras no mesmo
--                          instante e horímetros diferentes, o LAG depende da
--                          ordem de desempate (dava 122 ou 128 h na Fortim
--                          em maio conforme a ordem)
--
-- VALIDAÇÃO: comparado contra `abastecimentos_combustivel`, que carrega
-- horímetro próprio e é série independente. Os totais de fev a ago/2026 fecham
-- exatos na Flexeiras (1.143 h nas duas) e batem a menos da defasagem conhecida
-- por casco na Fortim (−6 h) e na Taíba (+3 h). Mês a mês, 23 de 24 dentro de
-- 5 h. O método da soma dava 8 de 22 dentro de 2 h.
--
-- A view foi executada sobre os dados reais antes desta migration ser escrita:
-- 21 de 21 valores conferidos, 268 chaves (cd_lancha, ano_mes) sem duplicidade,
-- nenhuma hora negativa, nenhuma acima de 400 h/mês.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_analytics_horas_mes AS
WITH leituras AS (
  -- Um ponto por (lancha, instante). Quando há mais de uma leitura no mesmo
  -- instante — eventos distintos do WebPilot — fica o maior horímetro.
  SELECT cd_lancha,
         max(ds_lancha)       AS ds_lancha,
         dh_leitura           AS t,
         max(dc_horimetro_bb) AS h
    FROM public.indicadores_ativos
   WHERE dc_horimetro_bb IS NOT NULL
     AND dh_leitura     IS NOT NULL
   GROUP BY cd_lancha, dh_leitura
),
limites AS (
  SELECT cd_lancha, max(ds_lancha) AS ds_lancha, min(t) AS t0, max(t) AS t1
    FROM leituras
   GROUP BY cd_lancha
),
bordas AS (
  SELECT l.cd_lancha, l.ds_lancha, b.borda
    FROM limites l
    CROSS JOIN LATERAL generate_series(
      date_trunc('month', l.t0),
      date_trunc('month', l.t1) + interval '1 month',
      interval '1 month'
    ) AS b(borda)
),
estim AS (
  SELECT b.cd_lancha, b.ds_lancha, b.borda,
         ant.t AS t0, ant.h AS h0,
         pos.t AS t1, pos.h AS h1
    FROM bordas b
    LEFT JOIN LATERAL (
      SELECT x.t, x.h FROM leituras x
       WHERE x.cd_lancha = b.cd_lancha AND x.t <= b.borda
       ORDER BY x.t DESC LIMIT 1
    ) ant ON true
    LEFT JOIN LATERAL (
      SELECT x.t, x.h FROM leituras x
       WHERE x.cd_lancha = b.cd_lancha AND x.t > b.borda
       ORDER BY x.t ASC LIMIT 1
    ) pos ON true
),
h_borda AS (
  SELECT cd_lancha, ds_lancha, borda,
         CASE
           WHEN h0 IS NULL THEN NULL          -- antes da primeira leitura
           WHEN h1 IS NULL THEN h0            -- depois da última
           WHEN t1 = t0    THEN h0
           ELSE h0 + (h1 - h0)
                * (EXTRACT(epoch FROM (borda - t0)) / EXTRACT(epoch FROM (t1 - t0)))
         END AS h_est
    FROM estim
),
janela AS (
  SELECT cd_lancha, ds_lancha, borda, h_est,
         lead(h_est) OVER (PARTITION BY cd_lancha ORDER BY borda) AS h_prox
    FROM h_borda
)
SELECT j.cd_lancha,
       j.ds_lancha,
       to_char(j.borda, 'YYYY-MM')                       AS ano_mes,
       round(CAST(j.h_prox - j.h_est AS numeric), 1)      AS horas_operadas,
       (SELECT count(*) FROM public.indicadores_ativos i
         WHERE i.cd_lancha = j.cd_lancha
           AND to_char(i.dh_leitura, 'YYYY-MM') = to_char(j.borda, 'YYYY-MM'))
                                                         AS n_leituras
  FROM janela j
 WHERE j.h_prox IS NOT NULL;

-- ⚠️ O MÊS MAIS RECENTE É PROVISÓRIO.
-- As horas do mês M são h_est(início de M+1) − h_est(início de M). Enquanto não
-- existir nenhuma leitura em M+1, a borda de M+1 cai no caso degenerate e devolve
-- o último horímetro conhecido — o que SUBESTIMA o mês M.
--
-- Caso real: em 03/09/2026 às 19h a Fortim recebeu a primeira leitura de setembro.
-- Antes dela, agosto marcava 182,0 h; depois, 206,2 h. Diferença de 13%.
--
-- Ao reportar o mês corrente ou o imediatamente anterior, confira se já há leitura
-- no mês seguinte. Se não houver, diga que o número é provisório.

COMMENT ON VIEW public.v_analytics_horas_mes IS
  'Horas operadas por lancha e mês, do horímetro. Substitui SUM(dc_dif_be), que '
  'conta o mesmo intervalo duas vezes quando dois eventos caem no mesmo momento. '
  'Meses sem leitura recebem valor por interpolação — confira n_leituras antes '
  'de tratar como medição. O mês mais recente é PROVISÓRIO enquanto não houver '
  'leitura no mês seguinte: a borda cai no último valor conhecido e subestima.';

-- ── Conferência ─────────────────────────────────────────────────────────────
-- SELECT ano_mes, ds_lancha, horas_operadas, n_leituras
--   FROM v_analytics_horas_mes
--  WHERE ano_mes BETWEEN '2026-02' AND '2026-08' ORDER BY 1,2;
--
-- Esperado (conferido contra os dados reais em 04/09/2026):
--   2026-02  FLEXEIRAS 146   FORTIM 185   TAÍBA III 18
--   2026-03  FLEXEIRAS 183   FORTIM 202   TAÍBA III 15
--   2026-04  FLEXEIRAS 155   FORTIM 201   TAÍBA III 27
--   2026-05  FLEXEIRAS 169   FORTIM 135   TAÍBA III 53
--   2026-06  FLEXEIRAS 163   FORTIM 173   TAÍBA III 20   <- antes 233/192/0
--   2026-07  FLEXEIRAS 155   FORTIM 180   TAÍBA III 40
--   2026-08  FLEXEIRAS 189   FORTIM 182   TAÍBA III 15   <- antes 267/183/8


-- ============================================================================
-- PARTE 2 — v_analytics_frota_mes passa a consumir a view acima.
--
-- Sem isto ficariam duas fontes de verdade para a mesma métrica: a view nova
-- com o número certo e a frota_mes com o inflado, que é justamente o que a
-- Skill lê. Convivência pior que a troca.
--
-- Só o CTE `horas_op` muda; o resto da definição é idêntico ao da migration
-- 20260826120000. Verificado que a substituição é compatível com o join:
-- mesmas colunas e tipos, 268 chaves (cd_lancha, ano_mes) contra 260 do
-- anterior, ZERO chaves perdidas, 8 ganhas (meses sem leitura), ZERO chave
-- duplicada.
--
-- O tipo se preserva: o SELECT externo faz round(COALESCE(ho.horas_operadas,0),1),
-- e round(x,1) no Postgres só existe para numeric — o CTE novo devolve numeric.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_analytics_frota_mes AS
WITH calendario AS (
  SELECT l.id AS lancha_id, l.nome AS lancha, l.id_webpilot::integer AS cd_lancha, m.ano_mes
  FROM lanchas l
  CROSS JOIN (SELECT DISTINCT to_char(dh_manobra, 'YYYY-MM') AS ano_mes
              FROM manobras_lanchas WHERE dh_manobra IS NOT NULL) m
  WHERE l.id_webpilot IS NOT NULL
),
manobras AS (
  SELECT cd_lancha, to_char(dh_manobra, 'YYYY-MM') AS ano_mes,
         count(*) AS manobras,
         count(*) FILTER (WHERE ds_porto::text = 'Mucuripe') AS man_mucuripe,
         count(*) FILTER (WHERE ds_porto::text ILIKE 'pec%')  AS man_pecem
  FROM manobras_lanchas WHERE dh_manobra IS NOT NULL
  GROUP BY cd_lancha, to_char(dh_manobra, 'YYYY-MM')
),
-- Horas vêm do horímetro, não de SUM(dc_dif_be), que contava o mesmo intervalo
-- duas vezes quando dois eventos caíam no mesmo momento. Causa, método e
-- validação estão no cabeçalho desta migration.
horas_op AS (
  SELECT cd_lancha, ano_mes, horas_operadas, n_leituras
  FROM public.v_analytics_horas_mes
),
combustivel AS (
  SELECT cd_lancha, ano_mes,
         sum(dc_litros) AS litros, sum(vl_total) AS custo_combustivel_wp,
         avg(vl_unitario) AS preco_medio_litro, count(*) AS n_abastecimentos
  FROM abastecimentos_combustivel WHERE cd_lancha IS NOT NULL
  GROUP BY cd_lancha, ano_mes
),
custos AS (
  SELECT
    CASE centro_resultado WHEN 'Flexeiras' THEN 121 WHEN 'Fortim' THEN 1003
                          WHEN 'Taíba' THEN 117 ELSE NULL::integer END AS cd_lancha,
    ano_mes,
    sum(valor) AS custo_total,
    sum(valor) FILTER (WHERE tipo_despesa ILIKE '%manuten%'
                          OR tipo_despesa ILIKE '%repar%')   AS custo_manutencao,
    sum(valor) FILTER (WHERE tipo_despesa ILIKE '%combust%') AS custo_combustivel_contabil
  FROM despesas
  WHERE centro_resultado = ANY (ARRAY['Flexeiras','Fortim','Taíba'])
  GROUP BY 1, ano_mes
),
ocorrencias AS (
  SELECT lancha_id, ano_mes,
    sum(horas_no_mes) FILTER (WHERE conta_manutencao)          AS h_manutencao,
    sum(horas_no_mes) FILTER (WHERE conta_downtime)            AS h_inoperante,
    -- CORREÇÃO 1: numerador próprio do índice de intervenção
    sum(horas_no_mes) FILTER (WHERE conta_indice_intervencao)  AS h_indice_intervencao,
    sum(horas_no_mes) FILTER (WHERE conta_downtime_tecnico)    AS h_corretiva_inop,
    sum(horas_no_mes) FILTER (WHERE classe = 'corretiva'  AND conta_manutencao) AS h_corretiva,
    sum(horas_no_mes) FILTER (WHERE classe = 'preventiva' AND conta_manutencao) AS h_preventiva,
    sum(horas_no_mes) FILTER (WHERE classe = 'projeto')     AS h_projeto_excluida,
    sum(horas_no_mes) FILTER (WHERE classe = 'treinamento') AS h_treinamento_excluida,
    count(DISTINCT cd_ocorrencia) FILTER (WHERE conta_downtime_tecnico) AS n_corretivas_inop,
    count(DISTINCT cd_ocorrencia) FILTER (WHERE classe IN ('corretiva','preventiva')) AS n_intervencoes
  FROM v_analytics_ocorrencias_mes
  GROUP BY lancha_id, ano_mes
)
SELECT
  c.lancha_id, c.lancha, c.cd_lancha, c.ano_mes,
  substring(c.ano_mes, 1, 4) || '-T'
    || (((substring(c.ano_mes, 6, 2)::integer - 1) / 3) + 1)::text AS trimestre,
  COALESCE(mn.manobras, 0)     AS manobras,
  COALESCE(mn.man_mucuripe, 0) AS man_mucuripe,
  COALESCE(mn.man_pecem, 0)    AS man_pecem,
  round(COALESCE(ho.horas_operadas, 0), 1) AS horas_operadas,
  COALESCE(ho.n_leituras, 0)               AS n_leituras_horimetro,
  round(COALESCE(oc.h_manutencao, 0), 1)           AS h_manutencao,
  round(COALESCE(oc.h_corretiva, 0), 1)            AS h_corretiva,
  round(COALESCE(oc.h_preventiva, 0), 1)           AS h_preventiva,
  round(COALESCE(oc.h_inoperante, 0), 1)           AS h_inoperante_sem_merge,
  round(COALESCE(oc.h_indice_intervencao, 0), 1)   AS h_indice_intervencao,
  round(COALESCE(oc.h_corretiva_inop, 0), 1)       AS h_corretiva_inop_sem_merge,
  round(COALESCE(oc.h_projeto_excluida, 0), 1)     AS h_projeto_excluida,
  round(COALESCE(oc.h_treinamento_excluida, 0), 1) AS h_treinamento_excluida,
  COALESCE(oc.n_corretivas_inop, 0) AS n_corretivas_inop,
  COALESCE(oc.n_intervencoes, 0)    AS n_intervencoes,
  round(COALESCE(cb.litros, 0), 0)             AS litros,
  round(COALESCE(cb.preco_medio_litro, 0), 3)  AS preco_medio_litro,
  COALESCE(cb.n_abastecimentos, 0)             AS n_abastecimentos,
  round(COALESCE(ct.custo_total, 0), 2)                 AS custo_total,
  round(COALESCE(ct.custo_manutencao, 0), 2)            AS custo_manutencao,
  round(COALESCE(ct.custo_combustivel_contabil, 0), 2)  AS custo_combustivel_contabil,
  round(COALESCE(cb.custo_combustivel_wp, 0), 2)        AS custo_combustivel_webpilot,
  CASE WHEN COALESCE(mn.manobras, 0) > 0
       THEN round(COALESCE(oc.n_corretivas_inop, 0)::numeric / mn.manobras::numeric * 100, 2)
  END AS corretivas_por_100_manobras,
  CASE WHEN COALESCE(mn.manobras, 0) > 0
       THEN round(COALESCE(oc.n_intervencoes, 0)::numeric / mn.manobras::numeric * 100, 2)
  END AS intervencoes_por_100_manobras,
  CASE WHEN COALESCE(mn.manobras, 0) > 0
       THEN round(COALESCE(oc.h_manutencao, 0) / mn.manobras::numeric, 2)
  END AS h_manutencao_por_manobra,
  -- CORREÇÃO 1: usa o numerador que exclui projeto/treinamento, conforme doc §5.3
  CASE WHEN COALESCE(ho.horas_operadas, 0) >= 20
       THEN round(COALESCE(oc.h_indice_intervencao, 0) / ho.horas_operadas * 100, 1)
  END AS indice_intervencao_pct,
  CASE WHEN COALESCE(mn.manobras, 0) > 0
       THEN round(COALESCE(cb.litros, 0) / mn.manobras::numeric, 1)
  END AS litros_por_manobra,
  CASE WHEN COALESCE(ho.horas_operadas, 0) >= 20
       THEN round(COALESCE(cb.litros, 0) / ho.horas_operadas, 1)
  END AS litros_por_hora_operada,
  CASE WHEN COALESCE(mn.manobras, 0) > 0
       THEN round(COALESCE(ct.custo_manutencao, 0) / mn.manobras::numeric * 100, 2)
  END AS custo_manutencao_por_100_manobras,
  (COALESCE(ho.horas_operadas, 0) < 20) AS exposicao_baixa,
  (COALESCE(ho.n_leituras, 0) < 3)      AS cobertura_horimetro_ruim,
  (c.ano_mes = to_char(CURRENT_DATE::timestamptz, 'YYYY-MM')) AS mes_em_curso
FROM calendario c
LEFT JOIN manobras    mn ON mn.cd_lancha = c.cd_lancha  AND mn.ano_mes = c.ano_mes
LEFT JOIN horas_op    ho ON ho.cd_lancha = c.cd_lancha  AND ho.ano_mes = c.ano_mes
LEFT JOIN combustivel cb ON cb.cd_lancha = c.cd_lancha  AND cb.ano_mes::text = c.ano_mes
LEFT JOIN custos      ct ON ct.cd_lancha = c.cd_lancha  AND ct.ano_mes::text = c.ano_mes
LEFT JOIN ocorrencias oc ON oc.lancha_id = c.lancha_id  AND oc.ano_mes = c.ano_mes;


-- ── Conferência da PARTE 2 ──────────────────────────────────────────────────
-- SELECT ano_mes, lancha, horas_operadas, n_leituras_horimetro,
--        cobertura_horimetro_ruim, exposicao_baixa
--   FROM v_analytics_frota_mes
--  WHERE ano_mes BETWEEN '2026-05' AND '2026-08' ORDER BY 1, 2;
--
-- Esperado — os mesmos números da PARTE 1:
--   2026-05  Flexeiras 169   Fortim 135   Taíba 53
--   2026-06  Flexeiras 163   Fortim 173   Taíba 20    <- antes 233 / 192 / 0
--   2026-07  Flexeiras 155   Fortim 180   Taíba 40
--   2026-08  Flexeiras 189   Fortim 182   Taíba 15    <- antes 267 / 183 / 8
--
-- ⚠️ indice_intervencao_pct e litros_por_hora_operada usam horas_operadas como
-- denominador. Os dois vão SUBIR, porque o denominador encolhe. Não é regressão
-- — os valores anteriores estavam otimistas por causa da inflação.
