-- ─────────────────────────────────────────────────────────────────────────────
-- Materializa as duas views de 20260923140000 que varrem a base inteira
--
-- `v_ais_falhas_transmissao` e `v_ais_velocidade` percorriam as 719 mil
-- posicoes classificadas a cada consulta e estouravam o timeout de 8 s do
-- PostgREST (erro 500). As outras duas daquela migration (iate clube e
-- manutencao) leem tabelas pequenas e continuam como view comum.
--
-- Conteudo identico, com uma correcao: o EXISTS contra fainas_deslocamentos era
-- avaliado DUAS vezes por buraco — uma para a coluna `dentro_de_faina` e outra
-- dentro do CASE. Agora e calculado uma vez, no LEFT JOIN LATERAL.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_ais_falhas_transmissao;
DROP VIEW IF EXISTS public.v_ais_velocidade;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_falhas_transmissao;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_velocidade;

-- ═══ Falhas de transmissão ════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW public.mv_ais_falhas_transmissao AS
WITH par AS (
  SELECT 30 AS limiar_min
),
pos AS (
  SELECT c.cd_lancha, c.ds_lancha, c.dh_posicao, c.prox_t, c.na_base,
         lead(c.na_base) OVER (PARTITION BY c.cd_lancha ORDER BY c.dh_posicao) AS base_depois
    FROM public.mv_ais_pos_classificada c
),
buracos AS (
  SELECT p.cd_lancha, p.ds_lancha,
         p.dh_posicao AS inicio,
         p.prox_t     AS fim,
         p.na_base    AS base_antes,
         p.base_depois,
         EXTRACT(epoch FROM (p.prox_t - p.dh_posicao)) / 3600.0 AS h
    FROM pos p
   WHERE p.prox_t IS NOT NULL
     AND (p.prox_t - p.dh_posicao) > (SELECT limiar_min FROM par) * interval '1 minute'
)
SELECT
  b.ds_lancha,
  b.cd_lancha,
  b.inicio,
  b.fim,
  (b.inicio AT TIME ZONE 'America/Fortaleza')::date AS dia,
  round(b.h::numeric, 2) AS duracao_h,
  b.base_antes,
  b.base_depois,
  fa.tem AS dentro_de_faina,
  CASE
    -- Travessia registrada cobrindo o buraco: queda esperada. O §1b da lista da
    -- gestao ja avisava que acontece com frequencia no caminho entre os portos.
    WHEN fa.tem THEN 'queda_em_travessia'
    -- Atracada antes E depois: a lancha nao saiu do lugar e mesmo assim sumiu.
    -- E o caso que interessa — transponder com problema.
    WHEN b.base_antes AND COALESCE(b.base_depois, false) THEN 'ais_com_defeito'
    ELSE 'indeterminado'
  END AS classe,
  (b.h >= 6) AS acima_do_alerta
FROM buracos b
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.fainas_deslocamentos f
     WHERE f.cd_lancha = b.cd_lancha
       AND f.dh_fim IS NOT NULL
       AND f.dh_inicio <= b.fim
       AND f.dh_fim    >= b.inicio
  ) AS tem
) fa ON true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_falhas_pk
  ON public.mv_ais_falhas_transmissao (cd_lancha, inicio);
CREATE INDEX IF NOT EXISTS idx_mv_falhas_dia
  ON public.mv_ais_falhas_transmissao (dia, classe);

COMMENT ON MATERIALIZED VIEW public.mv_ais_falhas_transmissao IS
  'Cada intervalo acima de 30 min sem posicao AIS, classificado: queda_em_travessia (ha faina registrada no periodo — esperado), ais_com_defeito (lancha atracada antes e depois, nao saiu do lugar e sumiu) ou indeterminado. Atende ao §1b da lista da gestao. Para alerta operacional o que vale e `ais_com_defeito`.';

GRANT SELECT ON public.mv_ais_falhas_transmissao TO anon, authenticated;


-- ═══ Perfil de velocidade ═════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW public.mv_ais_velocidade AS
WITH ctx AS (
  SELECT c.cd_lancha, c.ds_lancha, c.sog_efetivo,
         to_char((c.dh_posicao AT TIME ZONE 'America/Fortaleza')::date, 'YYYY-MM') AS ano_mes,
         CASE WHEN c.na_base THEN 'no_berco'
              WHEN c.dist_base_m >= 5000 THEN 'travessia_ou_longe'
              ELSE 'proximo_a_base'
         END AS contexto
    FROM public.mv_ais_pos_classificada c
   WHERE c.sog_efetivo IS NOT NULL
     AND c.sog_efetivo >= 1.0            -- só navegando; parada não tem perfil
     AND c.sog_efetivo <= 40.0           -- descarta leitura absurda do transponder
)
SELECT
  ctx.ano_mes,
  ctx.ds_lancha,
  ctx.cd_lancha,
  ctx.contexto,
  count(*) AS n_posicoes,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY ctx.sog_efetivo)::numeric, 1) AS sog_mediano,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY ctx.sog_efetivo)::numeric, 1) AS sog_p90,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY ctx.sog_efetivo)::numeric, 1) AS sog_p99,
  round(max(ctx.sog_efetivo)::numeric, 1) AS sog_max
FROM ctx
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_velocidade_pk
  ON public.mv_ais_velocidade (ano_mes, cd_lancha, contexto);

COMMENT ON MATERIALIZED VIEW public.mv_ais_velocidade IS
  'Perfil de velocidade por mes, lancha e contexto (no_berco, proximo_a_base, travessia_ou_longe). Use MEDIANA e percentis: o dc_sog tem picos espurios isolados que a media absorve — ha leitura de 18,9 kn com a lancha amarrada. Acima de 40 kn e descartado como erro de transponder.';

GRANT SELECT ON public.mv_ais_velocidade TO anon, authenticated;


-- ═══ Refresh: depois da classificada, de quem as duas dependem ════════════════
SELECT cron.unschedule('refresh-ais-falhas')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-falhas');
SELECT cron.schedule('refresh-ais-falhas', '30 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_falhas_transmissao$$);

SELECT cron.unschedule('refresh-ais-velocidade')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-velocidade');
SELECT cron.schedule('refresh-ais-velocidade', '35 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_velocidade$$);
