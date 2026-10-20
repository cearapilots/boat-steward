-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_paradas_fora — materializa a view de 20260923100000
--
-- Como view comum ela agregava 719 mil posicoes a cada consulta e estourava o
-- timeout de 8 s do PostgREST (erro 500). O resultado sao poucos milhares de
-- celulas, entao materializar custa quase nada e resolve.
--
-- Conteudo e proposito inalterados: uma linha por celula de ~11 m onde as
-- lanchas ficam PARADAS (abaixo de 1 kn) fora de qualquer cerca declarada, com
-- as horas acumuladas ali. E a evidencia para desenhar a cerca do ponto de
-- espera do Pecem — nao e uma cerca.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_ais_paradas_fora;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_paradas_fora;

CREATE MATERIALIZED VIEW public.mv_ais_paradas_fora AS
SELECT
  round(c.dc_latitude::numeric,  4) AS lat,
  round(c.dc_longitude::numeric, 4) AS lon,
  count(*)                          AS n_posicoes,
  count(DISTINCT c.ds_lancha)       AS n_lanchas,
  string_agg(DISTINCT c.ds_lancha, ', ') AS lanchas,
  -- So intervalos de ate 30 min contam como permanencia observada; acima disso
  -- e buraco de AIS, e buraco nao e presenca.
  round((sum(LEAST(EXTRACT(epoch FROM (c.prox_t - c.dh_posicao)), 1800)) / 3600.0)::numeric, 2) AS horas,
  min(c.dh_posicao)::date AS primeira,
  max(c.dh_posicao)::date AS ultima,
  CASE WHEN c.dc_latitude BETWEEN -3.55 AND -3.50
             AND c.dc_longitude BETWEEN -38.82 AND -38.77 THEN 'PECEM'
       WHEN c.dc_latitude BETWEEN -3.73 AND -3.69
             AND c.dc_longitude BETWEEN -38.51 AND -38.46 THEN 'MUCURIPE'
       ELSE 'OUTRA'
  END AS regiao
FROM public.mv_ais_pos_classificada c
WHERE NOT c.na_base
  AND COALESCE(c.sog_efetivo, 999) < 1.0
  AND c.prox_t IS NOT NULL
GROUP BY 1, 2, 9;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_paradas_pk
  ON public.mv_ais_paradas_fora (lat, lon);
CREATE INDEX IF NOT EXISTS idx_mv_paradas_regiao
  ON public.mv_ais_paradas_fora (regiao, horas DESC);

COMMENT ON MATERIALIZED VIEW public.mv_ais_paradas_fora IS
  'Celulas de ~11 m onde as lanchas ficam PARADAS (abaixo de 1 kn) fora de qualquer cerca declarada, com horas acumuladas. Evidencia para desenhar a cerca do ponto de espera do Pecem — nao e uma cerca. Refaca depois de cadastrar cerca nova, senao a area cercada continua aparecendo aqui.';

GRANT SELECT ON public.mv_ais_paradas_fora TO anon, authenticated;

-- Depois da classificada, que e de quem ela depende.
SELECT cron.unschedule('refresh-ais-paradas-fora')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-paradas-fora');

SELECT cron.schedule(
  'refresh-ais-paradas-fora',
  '25 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_paradas_fora$$
);
