-- =====================================================================
-- Camada analítica do FleetIQ — 4 views consumidas pela Skill FleetIQ Analytics
--
-- Versiona as views criadas manualmente no SQL Editor em 25-26/08/2026.
-- Base: pg_views do projeto ejmlhoxhiupdobdlzjnh, com DUAS correções marcadas
-- com "CORREÇÃO" abaixo.
--
-- CORREÇÃO 1 — conta_downtime excluía a classe 'projeto'.
--   A regra do gestor (itens 22/29) exclui projeto da CARGA DE MANUTENÇÃO,
--   não da DISPONIBILIDADE. Uma lancha parada para modificação está parada.
--   Doc §5.3: "Filtro: ocorrencias.efeito = 'Inoperante' (qualquer tipo)".
--   Efeito medido: disponibilidade operacional 1,5 pp alta demais na Flexeiras
--   (93,4% na view contra 91,9% na tela de Operações), Jan/25–Jul/26.
--   Como o índice de intervenção REALMENTE exclui projeto/treinamento, a flag
--   foi desdobrada em duas: conta_downtime e conta_indice_intervencao.
--
-- CORREÇÃO 2 — make_interval(hours => duracao_horas::integer) arredondava a
--   duração de eventos sem data_fim, e zerava eventos com menos de 0,5 h
--   (fim = ini faz o evento cair no filtro fim > ini). Hoje há ZERO eventos
--   nessa condição, então o bug é latente, não ativo.
-- =====================================================================

DROP VIEW IF EXISTS public.v_analytics_frota_mes;
DROP VIEW IF EXISTS public.v_analytics_disponibilidade_mes;
DROP VIEW IF EXISTS public.v_analytics_ocorrencias_mes;
DROP VIEW IF EXISTS public.v_analytics_sync_health;

-- ---------------------------------------------------------------------
-- 1. v_analytics_ocorrencias_mes — ocorrência x mês, horas já recortadas
-- ---------------------------------------------------------------------
CREATE VIEW public.v_analytics_ocorrencias_mes AS
WITH bounded AS (
  SELECT
    o.cd_ocorrencia, o.lancha_id, o.tipo_ocorrencia, o.efeito, o.descricao,
    o.data_inicio AS ini,
    -- CORREÇÃO 2: preserva a fração de hora
    COALESCE(o.data_fim, o.data_inicio + (interval '1 hour' * o.duracao_horas::double precision)) AS fim,
    o.duracao_horas AS duracao_total_h,
    CASE
      WHEN o.tipo_ocorrencia ILIKE '%projeto%'
        OR o.tipo_ocorrencia ILIKE '%melhoria%'
        OR o.tipo_ocorrencia ILIKE '%modifica%'    THEN 'projeto'
      WHEN o.tipo_ocorrencia ILIKE '%treinamento%' THEN 'treinamento'
      WHEN o.tipo_ocorrencia ILIKE '%corretiva%'   THEN 'corretiva'
      WHEN o.tipo_ocorrencia ILIKE '%preventiva%'  THEN 'preventiva'
      ELSE 'outros'
    END AS classe,
    btrim(regexp_replace(COALESCE(o.tipo_ocorrencia, '')::text,
                         '\s*\((Corretiva|Preventiva)\)', '', 'gi')) AS faina
  FROM ocorrencias_webpilot o
  WHERE o.data_inicio IS NOT NULL
    AND (o.data_fim IS NOT NULL OR o.duracao_horas IS NOT NULL)
),
expanded AS (
  SELECT b.*, gs.mes
  FROM bounded b
  CROSS JOIN LATERAL generate_series(date_trunc('month', b.ini),
                                     date_trunc('month', b.fim),
                                     interval '1 month') gs(mes)
  WHERE b.fim > b.ini
)
SELECT
  e.cd_ocorrencia,
  e.lancha_id,
  l.nome AS lancha_nome,
  l.id_webpilot::integer AS cd_lancha,
  to_char(e.mes, 'YYYY-MM') AS ano_mes,
  e.mes::date AS mes_inicio,
  e.classe,
  e.faina,
  e.efeito,
  e.tipo_ocorrencia,
  e.descricao,
  e.ini AS evento_inicio,
  e.fim AS evento_fim,
  round(e.duracao_total_h, 2) AS duracao_total_h,
  round((EXTRACT(epoch FROM (LEAST(e.fim, e.mes + interval '1 month')
                           - GREATEST(e.ini, e.mes))) / 3600.0), 2) AS horas_no_mes,
  -- carga de manutenção: exclui projeto e treinamento (regra do gestor)
  (e.classe IN ('corretiva','preventiva','outros')) AS conta_manutencao,
  -- CORREÇÃO 1: indisponibilidade independe da classe
  (e.efeito::text = 'Inoperante') AS conta_downtime,
  -- CORREÇÃO 1: numerador do índice de intervenção, que SIM exclui projeto/treinamento
  (e.efeito::text = 'Inoperante'
   AND e.classe IN ('corretiva','preventiva','outros')) AS conta_indice_intervencao,
  (e.efeito::text = 'Inoperante' AND e.classe = 'corretiva') AS conta_downtime_tecnico,
  (date_trunc('month', e.ini) <> date_trunc('month', e.fim)) AS cruza_meses
FROM expanded e
LEFT JOIN lanchas l ON l.id = e.lancha_id
WHERE LEAST(e.fim, e.mes + interval '1 month') > GREATEST(e.ini, e.mes);

COMMENT ON VIEW public.v_analytics_ocorrencias_mes IS
  'Ocorrência x mês com horas recortadas (equivale a horasNoMes() do frontend). '
  'conta_downtime = indisponibilidade (qualquer classe). '
  'conta_indice_intervencao = numerador do índice, exclui projeto/treinamento.';

-- ---------------------------------------------------------------------
-- 2. v_analytics_frota_mes — painel lancha x mês, 5 fontes cruzadas
-- ---------------------------------------------------------------------
CREATE VIEW public.v_analytics_frota_mes AS
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
horas_op AS (
  SELECT cd_lancha, to_char(dh_leitura, 'YYYY-MM') AS ano_mes,
         sum(dc_dif_be) AS horas_operadas, count(*) AS n_leituras
  FROM indicadores_ativos
  WHERE dc_dif_be IS NOT NULL AND dh_leitura IS NOT NULL
  GROUP BY cd_lancha, to_char(dh_leitura, 'YYYY-MM')
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

COMMENT ON COLUMN public.v_analytics_frota_mes.h_inoperante_sem_merge IS
  'ARMADILHA: soma bruta de horas Inoperante, SEM fundir eventos sobrepostos — '
  'superestima o downtime. NÃO use para disponibilidade: use '
  'v_analytics_disponibilidade_mes.downtime_operacional_h, que aplica o merge. '
  'Aqui serve só para tendência.';
COMMENT ON COLUMN public.v_analytics_frota_mes.h_indice_intervencao IS
  'Numerador de indice_intervencao_pct: horas Inoperante excluindo projeto e treinamento.';

-- ---------------------------------------------------------------------
-- 3. v_analytics_disponibilidade_mes — disponibilidade com merge de
--    intervalos sobrepostos (gaps and islands = mergeIntervals() do frontend)
--    Lógica inalterada; passa a ficar correta porque conta_downtime foi corrigida.
-- ---------------------------------------------------------------------
CREATE VIEW public.v_analytics_disponibilidade_mes AS
WITH eventos AS (
  SELECT DISTINCT o.cd_ocorrencia, o.lancha_id,
         o.evento_inicio AS ini, o.evento_fim AS fim,
         o.conta_downtime         AS eh_operacional,
         o.conta_downtime_tecnico AS eh_tecnico
  FROM v_analytics_ocorrencias_mes o
  WHERE (o.conta_downtime OR o.conta_downtime_tecnico)
    AND o.evento_fim > o.evento_inicio
),
eventos_op AS (
  SELECT lancha_id, ini, fim,
         max(fim) OVER (PARTITION BY lancha_id ORDER BY ini
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS max_fim_ant
  FROM eventos WHERE eh_operacional
),
ilhas_op AS (
  SELECT lancha_id, ini, fim,
         sum(CASE WHEN max_fim_ant IS NULL OR ini > max_fim_ant THEN 1 ELSE 0 END)
           OVER (PARTITION BY lancha_id ORDER BY ini
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ilha
  FROM eventos_op
),
merged_op AS (
  SELECT lancha_id, min(ini) AS ini, max(fim) AS fim, count(*) AS eventos_fundidos
  FROM ilhas_op GROUP BY lancha_id, ilha
),
eventos_tec AS (
  SELECT lancha_id, ini, fim,
         max(fim) OVER (PARTITION BY lancha_id ORDER BY ini
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS max_fim_ant
  FROM eventos WHERE eh_tecnico
),
ilhas_tec AS (
  SELECT lancha_id, ini, fim,
         sum(CASE WHEN max_fim_ant IS NULL OR ini > max_fim_ant THEN 1 ELSE 0 END)
           OVER (PARTITION BY lancha_id ORDER BY ini
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ilha
  FROM eventos_tec
),
merged_tec AS (
  SELECT lancha_id, min(ini) AS ini, max(fim) AS fim, count(*) AS eventos_fundidos
  FROM ilhas_tec GROUP BY lancha_id, ilha
),
downtime_op AS (
  SELECT m.lancha_id, to_char(gs.mes, 'YYYY-MM') AS ano_mes,
         sum(EXTRACT(epoch FROM (LEAST(m.fim, gs.mes + interval '1 month')
                               - GREATEST(m.ini, gs.mes))) / 3600.0) AS horas,
         sum(m.eventos_fundidos)     AS eventos,
         sum(m.eventos_fundidos - 1) AS sobreposicoes
  FROM merged_op m
  CROSS JOIN LATERAL generate_series(date_trunc('month', m.ini),
                                     date_trunc('month', m.fim),
                                     interval '1 month') gs(mes)
  WHERE LEAST(m.fim, gs.mes + interval '1 month') > GREATEST(m.ini, gs.mes)
  GROUP BY m.lancha_id, to_char(gs.mes, 'YYYY-MM')
),
downtime_tec AS (
  SELECT m.lancha_id, to_char(gs.mes, 'YYYY-MM') AS ano_mes,
         sum(EXTRACT(epoch FROM (LEAST(m.fim, gs.mes + interval '1 month')
                               - GREATEST(m.ini, gs.mes))) / 3600.0) AS horas,
         sum(m.eventos_fundidos) AS eventos
  FROM merged_tec m
  CROSS JOIN LATERAL generate_series(date_trunc('month', m.ini),
                                     date_trunc('month', m.fim),
                                     interval '1 month') gs(mes)
  WHERE LEAST(m.fim, gs.mes + interval '1 month') > GREATEST(m.ini, gs.mes)
  GROUP BY m.lancha_id, to_char(gs.mes, 'YYYY-MM')
),
calendario AS (
  SELECT l.id AS lancha_id, l.nome AS lancha, l.id_webpilot::integer AS cd_lancha,
         m.ano_mes,
         EXTRACT(day FROM (date_trunc('month', to_date(m.ano_mes, 'YYYY-MM')::timestamptz)
                           + interval '1 month' - interval '1 day'))::integer * 24 AS horas_no_mes
  FROM lanchas l
  CROSS JOIN (SELECT DISTINCT to_char(dh_manobra, 'YYYY-MM') AS ano_mes
              FROM manobras_lanchas WHERE dh_manobra IS NOT NULL) m
  WHERE l.id_webpilot IS NOT NULL
)
SELECT
  c.lancha_id, c.lancha, c.cd_lancha, c.ano_mes, c.horas_no_mes,
  round(COALESCE(dop.horas, 0), 1) AS downtime_operacional_h,
  round(COALESCE(dtc.horas, 0), 1) AS downtime_tecnico_h,
  round(GREATEST(0, LEAST(100,
    (c.horas_no_mes::numeric - COALESCE(dop.horas, 0)) / c.horas_no_mes::numeric * 100)), 1)
    AS disponibilidade_operacional_pct,
  round(GREATEST(0, LEAST(100,
    (c.horas_no_mes::numeric - COALESCE(dtc.horas, 0)) / c.horas_no_mes::numeric * 100)), 1)
    AS disponibilidade_tecnica_pct,
  COALESCE(dop.eventos, 0)       AS eventos_operacional,
  COALESCE(dtc.eventos, 0)       AS eventos_tecnico,
  COALESCE(dop.sobreposicoes, 0) AS sobreposicoes_resolvidas,
  (COALESCE(dop.horas, 0) / c.horas_no_mes::numeric <= 0.15) AS meta_operacional_atingida,
  (COALESCE(dtc.horas, 0) / c.horas_no_mes::numeric <= 0.05) AS meta_tecnica_atingida,
  (c.ano_mes = to_char(CURRENT_DATE::timestamptz, 'YYYY-MM')) AS mes_em_curso
FROM calendario c
LEFT JOIN downtime_op  dop ON dop.lancha_id = c.lancha_id AND dop.ano_mes = c.ano_mes
LEFT JOIN downtime_tec dtc ON dtc.lancha_id = c.lancha_id AND dtc.ano_mes = c.ano_mes;

COMMENT ON VIEW public.v_analytics_disponibilidade_mes IS
  'Fonte oficial de disponibilidade. Funde intervalos sobrepostos antes de recortar '
  'por mês, evitando dupla contagem. Metas: 85% operacional, 95% técnica.';
COMMENT ON COLUMN public.v_analytics_disponibilidade_mes.eventos_operacional IS
  'Contagem por mês: um evento que cruza N meses é contado em cada um deles.';

-- ---------------------------------------------------------------------
-- 4. v_analytics_sync_health — frescor dos 8 syncs, sem expor o log cru
--    Resolve o Apêndice D do Context Pack: a chave anon não lê sync_log
--    (RLS sem policy de SELECT), mas pode ler esta view agregada.
--    A função de origem é inferida do texto de `detalhe` porque sync_log
--    não tem coluna identificando quem gravou a linha.
-- ---------------------------------------------------------------------
CREATE VIEW public.v_analytics_sync_health AS
WITH classificado AS (
  SELECT executado_em, status, eventos_importados, lanchas_atualizadas, detalhe,
    CASE
      WHEN detalhe ILIKE '%Periódicas%'
        OR detalhe ILIKE '%Periodicas%'          THEN 'sync-ocorrencias'
      WHEN detalhe ILIKE '%Indicadores%'         THEN 'sync-indicadores'
      WHEN detalhe ILIKE '%Manobras processadas%'
        OR detalhe ILIKE '%Manobras:%'           THEN 'sync-manobras'
      WHEN detalhe ILIKE '%Fainas processadas%'
        OR detalhe ILIKE '%Fainas:%'             THEN 'sync-fainas'
      WHEN detalhe ILIKE '%Abastecimento%'       THEN 'sync-abastecimentos'
      WHEN detalhe ILIKE '%vencimento%'          THEN 'sync-vencimentos'
      WHEN detalhe ILIKE '%SKIP cd=%'
        OR detalhe ILIKE '%troca%óleo%'
        OR detalhe ILIKE '%troca%oleo%'
        OR detalhe ILIKE '%Trocas registradas%'
        OR detalhe ILIKE '%Nenhuma troca%'       THEN 'sync-trocas-oleo'
      WHEN detalhe ILIKE '%Gerador:%'
        OR (detalhe LIKE '%→%' AND detalhe ILIKE '%h %') THEN 'sync-horimetros'
      ELSE 'nao_identificado'
    END AS funcao
  FROM sync_log
  WHERE executado_em > now() - interval '30 days'
),
agregado AS (
  SELECT funcao,
    max(executado_em) AS ultima_execucao,
    max(executado_em) FILTER (WHERE status::text = 'sucesso') AS ultimo_sucesso,
    -- 'parcial' é execução saudável: sync-trocas-oleo grava parcial quando
    -- não há troca nova, o que é o caso na maioria dos dias.
    max(executado_em) FILTER (WHERE status::text IN ('sucesso','parcial')) AS ultima_execucao_ok,
    (array_agg(status            ORDER BY executado_em DESC))[1] AS status_ultima,
    (array_agg(eventos_importados ORDER BY executado_em DESC))[1] AS eventos_ultima,
    (array_agg(left(detalhe, 150) ORDER BY executado_em DESC))[1] AS detalhe_ultima,
    count(*)                                            AS execucoes_30d,
    count(*) FILTER (WHERE status::text = 'sucesso')    AS sucessos_30d,
    count(*) FILTER (WHERE status::text = 'parcial')    AS parciais_30d,
    count(*) FILTER (WHERE status::text = 'erro')       AS erros_30d,
    count(*) FILTER (WHERE status::text = 'erro'
                       AND executado_em > now() - interval '7 days') AS erros_7d,
    sum(eventos_importados) FILTER (WHERE executado_em > now() - interval '7 days') AS eventos_7d
  FROM classificado
  WHERE funcao <> 'nao_identificado'
  GROUP BY funcao
)
SELECT funcao, ultima_execucao, ultimo_sucesso, ultima_execucao_ok,
  status_ultima, eventos_ultima, detalhe_ultima,
  execucoes_30d, sucessos_30d, parciais_30d, erros_30d, erros_7d,
  COALESCE(eventos_7d, 0) AS eventos_7d,
  round(EXTRACT(epoch FROM (now() - ultima_execucao))    / 3600, 1) AS horas_desde_ultima,
  round(EXTRACT(epoch FROM (now() - ultima_execucao_ok)) / 3600, 1) AS horas_desde_ok,
  CASE
    WHEN ultima_execucao_ok IS NULL                      THEN 'critico'
    WHEN now() - ultima_execucao_ok > interval '48 hours' THEN 'critico'
    WHEN now() - ultima_execucao_ok > interval '26 hours' THEN 'atencao'
    WHEN erros_7d >= 3                                    THEN 'atencao'
    WHEN status_ultima::text = 'erro'                     THEN 'atencao'
    ELSE 'ok'
  END AS saude,
  CASE
    WHEN ultima_execucao_ok IS NULL
      THEN 'Nenhuma execução bem-sucedida em 30 dias'
    WHEN now() - ultima_execucao_ok > interval '48 hours'
      THEN 'Sem execução OK há mais de 48h — dados desta fonte estão defasados'
    WHEN now() - ultima_execucao_ok > interval '26 hours'
      THEN 'Sem execução OK há mais de 26h — verificar antes de analisar'
    WHEN erros_7d >= 3                THEN 'Múltiplas falhas na última semana'
    WHEN status_ultima::text = 'erro' THEN 'Última execução falhou (anteriores OK)'
    WHEN sucessos_30d = 0 AND parciais_30d > 0
      THEN 'Sincronizando normalmente — sem novidades no período'
    ELSE 'Sincronizando normalmente'
  END AS diagnostico
FROM agregado
ORDER BY
  CASE WHEN ultima_execucao_ok IS NULL                      THEN 0
       WHEN now() - ultima_execucao_ok > interval '48 hours' THEN 1
       WHEN now() - ultima_execucao_ok > interval '26 hours' THEN 2
       ELSE 3 END,
  funcao;

-- ---------------------------------------------------------------------
-- Permissões (mesmo padrão das demais views do projeto)
-- ---------------------------------------------------------------------
GRANT SELECT ON public.v_analytics_ocorrencias_mes     TO anon, authenticated;
GRANT SELECT ON public.v_analytics_frota_mes           TO anon, authenticated;
GRANT SELECT ON public.v_analytics_disponibilidade_mes TO anon, authenticated;
GRANT SELECT ON public.v_analytics_sync_health         TO anon, authenticated;
