-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige `horas_sem_transmitir` em v_ais_status_transmissao
--
-- DEFEITO: a versao anterior calculava `now() - ultima_posicao`. Como o sync do
-- AIS roda 1x por dia, o dado mais fresco possivel ja nasce velho e envelhece o
-- dia inteiro — em 11/09/2026 as 18:08 UTC, com o sync das 09:40, o Fortim
-- aparecia com 8,5 h "sem transmitir" enquanto transmitia normalmente. Era a
-- idade do NOSSO DADO, nao o silencio da lancha. Com limiar de 6 h, as duas
-- lanchas disparariam todo dia a partir do meio da tarde.
--
-- CORRECAO: medir contra o instante do ultimo sync, nao contra agora.
--
-- ⚠️ A referencia e o `max(created_at)` GLOBAL, de qualquer lancha — nao o da
-- propria. Uma lancha muda nao ganha linhas novas, entao o `created_at` dela
-- envelheceria junto com a posicao e o resultado daria ~0 h justamente no caso
-- que o detector existe para pegar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ais_status_transmissao AS
WITH sync AS (
  -- Instante da ultima gravacao do sync. Janela curta para nao varrer a tabela.
  SELECT max(created_at) AS ultimo_sync
    FROM public.posicoes_ais
   WHERE dh_posicao >= now() - interval '3 days'
)
SELECT
  d.lancha_nome,
  d.cd_lancha,
  u.ultima_posicao,
  -- Quanto tempo a lancha estava sem transmitir NO MOMENTO do ultimo sync.
  round(EXTRACT(epoch FROM (s.ultimo_sync - u.ultima_posicao)) / 3600, 1) AS horas_sem_transmitir,
  COALESCE(u.posicoes_24h, 0) AS posicoes_24h,
  COALESCE(u.posicoes_7d,  0) AS posicoes_7d,
  COALESCE(u.posicoes_30d, 0) AS posicoes_30d,
  round(COALESCE(u.posicoes_30d, 0) / 30.0, 0) AS media_diaria_30d,
  s.ultimo_sync,
  -- Idade do proprio dado. Serve para saber se vale confiar na leitura acima:
  -- acima de ~26 h significa que o sync falhou, e ai o problema e outro.
  round(EXTRACT(epoch FROM (now() - s.ultimo_sync)) / 3600, 1) AS horas_desde_sync
FROM public.v_lancha_dim d
CROSS JOIN sync s
LEFT JOIN LATERAL (
  SELECT max(p.dh_posicao) AS ultima_posicao,
         count(*) FILTER (WHERE p.dh_posicao >= now() - interval '24 hours') AS posicoes_24h,
         count(*) FILTER (WHERE p.dh_posicao >= now() - interval '7 days')   AS posicoes_7d,
         count(*)                                                            AS posicoes_30d
    FROM public.posicoes_ais p
   WHERE p.cd_lancha = d.cd_lancha
     AND p.dh_posicao >= now() - interval '30 days'
) u ON true;

COMMENT ON VIEW public.v_ais_status_transmissao IS
  'Frescor do AIS por lancha. horas_sem_transmitir e medido contra o ultimo sync, nao contra now(): o sync roda 1x/dia e medir contra agora so mede a idade do dado. horas_sem_transmitir NULO = nenhuma posicao em 30 dias — a Taiba aparece assim SEMPRE, por nao ter MMSI, e isso nao e falha.';

GRANT SELECT ON public.v_ais_status_transmissao TO anon, authenticated;

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
--   select lancha_nome, horas_sem_transmitir, posicoes_24h, media_diaria_30d,
--          horas_desde_sync
--     from public.v_ais_status_transmissao order by lancha_nome;
--
-- Em 11/09/2026 o esperado passa a ser: Fortim com horas_sem_transmitir perto de
-- zero (transmitindo bem) e Flexeiras com volume no chao — que e a perna do
-- detector que realmente pega transponder intermitente.
