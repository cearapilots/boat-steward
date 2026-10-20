-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_cobertura_dia — quanto de cada dia foi realmente observado pelo AIS
--
-- POR QUE EXISTE: tudo que envolve tempo — tempo na base, tempo fora, exposicao
-- da tripulacao — precisa separar o que foi OBSERVADO do que e BURACO. Sem isso
-- um buraco de AIS vira "fora da base" em silencio, e a metrica de fadiga infla
-- justamente para a lancha com o transponder pior.
--
-- LIMIAR: 30 minutos, decidido em 21/09/2026 e GRAVADO NA PROPRIA LINHA
-- (`limiar_min`), porque e parametro declarado, nao medida. Medido em agosto:
--
--   limiar      Flexeiras   Fortim
--   15 min        88,9 %    86,4 %
--   30 min        91,3 %    89,5 %
--   60 min        95,1 %    94,7 %
--
-- Seis pontos entre os extremos, com o mesmo dado. 30 min porque a mediana
-- entre posicoes e de 2 a 3 minutos — dez vezes o normal ja e buraco — e porque
-- 60 min contaria uma hora inteira de silencio como observada.
--
-- ⚠️ Trocar o limiar reescreve todo o historico. Se mudar, mude tambem a
--    constante do PASSO 1 e refaca a materializacao inteira, e diga a data.
--
-- TRES DECISOES DE DESENHO
--
--  1. DIA LOCAL de Fortaleza, nao UTC. E o grao que casa com a `daily_summary`
--     do VRM, que tambem e por dia local. Ver references/cercas_ais.md §1.
--
--  2. INTERVALOS CORTADOS NA VIRADA DO DIA. Um buraco de 6 h que comeca as 22h
--     rende 2 h no dia que comeca e 4 h no seguinte. Sem esse corte, o dia
--     seguinte apareceria completo — exatamente o caso que a tabela existe para
--     mostrar. A classificacao usa a duracao TOTAL do buraco, nao a do pedaco:
--     metade de um buraco de 6 h continua sendo buraco.
--
--  3. ESPINHA DE DIAS. Dia sem nenhuma posicao nao some da tabela: entra com
--     n_posicoes = 0 e 24 h nao resolvidas. Sem isso os piores dias — os que
--     caem dentro de uma queda longa — ficariam invisiveis.
--
-- ⚠️ A TAIBA NAO APARECE. Ela nao tem MMSI e nunca transmitiu, entao nao tem
--    linha em `posicoes_ais` e a espinha nao a gera. Ausencia aqui nao e falha
--    de cobertura dela — e ausencia de AIS. Nao reporte como lancha sem sinal.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_cobertura_dia;

CREATE MATERIALIZED VIEW public.mv_ais_cobertura_dia AS
WITH par AS (
  SELECT 30 AS limiar_min
),
-- Cada posicao com a seguinte da mesma lancha. Só posicionadas: as mensagens
-- sem coordenada sao outro fluxo e nao dizem nada sobre cobertura espacial.
pares AS (
  SELECT p.cd_lancha,
         p.ds_lancha,
         p.dh_posicao AS t1,
         lead(p.dh_posicao) OVER (PARTITION BY p.cd_lancha ORDER BY p.dh_posicao) AS t2
    FROM public.posicoes_ais p
   WHERE p.tem_posicao
),
-- Cada par vira um ou mais segmentos, um por dia local que ele atravessa.
segmentos AS (
  SELECT pr.cd_lancha,
         pr.ds_lancha,
         d::date AS dia,
         GREATEST(pr.t1, (d::timestamp AT TIME ZONE 'America/Fortaleza'))                    AS ini,
         LEAST(pr.t2, ((d::timestamp + interval '1 day') AT TIME ZONE 'America/Fortaleza'))  AS fim,
         (pr.t2 - pr.t1) AS buraco_total
    FROM pares pr
    CROSS JOIN LATERAL generate_series(
           (pr.t1 AT TIME ZONE 'America/Fortaleza')::date,
           (pr.t2 AT TIME ZONE 'America/Fortaleza')::date,
           interval '1 day') AS d
   WHERE pr.t2 IS NOT NULL
),
-- Soma por dia, classificando pelo tamanho TOTAL do buraco.
horas AS (
  SELECT s.cd_lancha,
         s.dia,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.buraco_total <= (SELECT limiar_min FROM par) * interval '1 minute') AS seg_obs,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.buraco_total >  (SELECT limiar_min FROM par) * interval '1 minute') AS seg_nao,
         max(EXTRACT(epoch FROM s.buraco_total)) AS seg_maior
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
-- Espinha: todo dia entre a primeira e a ultima posicao de cada lancha.
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
  COALESCE(c.n_posicoes, 0)                                   AS n_posicoes,
  round((COALESCE(h.seg_obs, 0) / 3600.0)::numeric, 2)        AS horas_observadas,
  -- Dia sem posicao nenhuma e 24 h nao resolvidas, nao zero.
  CASE WHEN COALESCE(c.n_posicoes, 0) = 0
       THEN 24.00
       ELSE round((COALESCE(h.seg_nao, 0) / 3600.0)::numeric, 2)
  END                                                          AS horas_nao_resolvidas,
  CASE WHEN COALESCE(c.n_posicoes, 0) = 0
       THEN 0.0
       ELSE round((100.0 * COALESCE(h.seg_obs, 0)
                   / NULLIF(COALESCE(h.seg_obs, 0) + COALESCE(h.seg_nao, 0), 0))::numeric, 1)
  END                                                          AS cobertura_pct,
  CASE WHEN COALESCE(c.n_posicoes, 0) = 0
       THEN 24.00
       ELSE round((COALESCE(h.seg_maior, 0) / 3600.0)::numeric, 2)
  END                                                          AS maior_buraco_h,
  (SELECT limiar_min FROM par)                                 AS limiar_min
FROM espinha e
LEFT JOIN contagem c ON c.cd_lancha = e.cd_lancha AND c.dia = e.dia
LEFT JOIN horas    h ON h.cd_lancha = e.cd_lancha AND h.dia = e.dia;

-- UNIQUE e pre-requisito de REFRESH CONCURRENTLY, que nao bloqueia leitura.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_cobertura_pk
  ON public.mv_ais_cobertura_dia (cd_lancha, dia);
CREATE INDEX IF NOT EXISTS idx_mv_ais_cobertura_dia
  ON public.mv_ais_cobertura_dia (dia);

COMMENT ON MATERIALIZED VIEW public.mv_ais_cobertura_dia IS
  'Cobertura diaria do AIS por lancha, dia local de Fortaleza. Buraco = intervalo acima de limiar_min (30) entre posicoes consecutivas. Atualizada 1x/dia apos o sync-ais. A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_cobertura_dia TO anon, authenticated;

-- ── AGENDAMENTO DO REFRESH ───────────────────────────────────────────────────
-- 09:50 UTC = 06:50 em Fortaleza, dez minutos depois do sync-ais das 09:40.
-- Diferente dos outros jobs, este nao chama Edge Function: roda SQL direto,
-- entao nao precisa de pg_net nem de chave.
--
-- CONCURRENTLY nao bloqueia leitura enquanto atualiza — por isso o indice
-- UNIQUE acima e obrigatorio.
create extension if not exists pg_cron;

select cron.schedule(
  'refresh-ais-cobertura-diario',
  '50 9 * * *',
  $cmd$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_cobertura_dia;$cmd$
);

-- Nao ha REFRESH aqui de proposito: `CREATE MATERIALIZED VIEW` ja popula a view
-- na criacao. Um REFRESH em seguida recomputaria as 709 mil linhas pela segunda
-- vez, dobrando o tempo do script sem mudar nada.

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
-- 1. Visao geral. Esperado em 21/09/2026: duas lanchas, serie comecando em
--    01/01/2025, e a Taiba ausente.
--
--   SELECT ds_lancha, count(*) AS dias, min(dia), max(dia),
--          round(avg(cobertura_pct), 1) AS cobertura_media
--     FROM public.mv_ais_cobertura_dia GROUP BY 1 ORDER BY 1;
--
-- 2. Agosto/2026 tem que reproduzir o que foi medido fora do banco:
--    Flexeiras ~91,3 % e Fortim ~89,5 %.
--
--   SELECT ds_lancha,
--          round(sum(horas_observadas), 0)     AS observado_h,
--          round(sum(horas_nao_resolvidas), 0) AS buraco_h,
--          round(100.0 * sum(horas_observadas)
--                / NULLIF(sum(horas_observadas + horas_nao_resolvidas), 0), 1) AS cobertura_pct
--     FROM public.mv_ais_cobertura_dia
--    WHERE dia >= '2026-08-01' AND dia < '2026-09-01'
--    GROUP BY 1 ORDER BY 1;
--
-- 3. Os piores dias devem incluir a queda da Flexeiras de 09 a 11/09/2026 e a
--    longa de maio a julho de 2025:
--
--   SELECT ds_lancha, dia, n_posicoes, cobertura_pct, maior_buraco_h
--     FROM public.mv_ais_cobertura_dia
--    ORDER BY cobertura_pct, maior_buraco_h DESC LIMIT 15;
--
-- 4. Sanidade: observado + nao resolvido deve dar ~24 h em dia completo. Dias
--    fora da faixa merecem olhada — o primeiro e o ultimo dia de cada serie sao
--    parciais por natureza e podem aparecer aqui.
--
--   SELECT ds_lancha, dia, horas_observadas + horas_nao_resolvidas AS total_h
--     FROM public.mv_ais_cobertura_dia
--    WHERE horas_observadas + horas_nao_resolvidas NOT BETWEEN 23.5 AND 24.5
--    ORDER BY dia;
--
-- 5. O job ficou agendado?
--
--   SELECT jobname, schedule, active FROM cron.job ORDER BY schedule;
