-- ─────────────────────────────────────────────────────────────────────────────
-- Detector de AIS fora do ar
--
-- Pedido da gestao em 11/09/2026: nao alertar a cada queda — o AIS oscila por
-- natureza —, mas avisar quando uma lancha passar um tempo controlado sem
-- transmitir, dizendo DESDE QUANDO.
--
-- Motivador: o AIS da Flexeiras ficou intermitente a partir de 09/09/2026 e
-- ninguem percebeu por tres dias. Ela caiu de ~500 posicoes/dia para 15 em tres
-- dias, sem nenhuma ocorrencia aberta.
--
-- DESENHO: a view entrega HORAS, nao veredito. O limiar vive em
-- `configuracoes`, como os demais semaforos do sistema, e quem consome compara.
-- E o padrao ja usado nas periodicas — a view nao le configuracoes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 — limiar configuravel ────────────────────────────────────────────
INSERT INTO public.configuracoes (chave, valor, descricao)
VALUES ('ais_horas_sem_transmitir_alerta', '6',
        'Horas sem posicao AIS a partir das quais a lancha entra como alerta')
ON CONFLICT (chave) DO NOTHING;

-- ── PASSO 2 — a view ─────────────────────────────────────────────────────────
-- Janela de 30 dias no LATERAL: limita a varredura (a tabela passa de 700 mil
-- linhas e cresce ~1.200/dia) e ainda cobre folgadamente qualquer ausencia que
-- valha alertar.
CREATE OR REPLACE VIEW public.v_ais_status_transmissao AS
SELECT
  d.lancha_nome,
  d.cd_lancha,
  u.ultima_posicao,
  round(EXTRACT(epoch FROM (now() - u.ultima_posicao)) / 3600, 1) AS horas_sem_transmitir,
  COALESCE(u.posicoes_24h, 0) AS posicoes_24h,
  COALESCE(u.posicoes_7d,  0) AS posicoes_7d,
  COALESCE(u.posicoes_30d, 0) AS posicoes_30d,
  -- Mediana diaria das ultimas 4 semanas serve de base de comparacao: uma
  -- lancha que faz 500/dia e cai para 15 nao esta "fora do ar", esta doente,
  -- e a contagem de 24h sozinha nao mostraria isso.
  round(COALESCE(u.posicoes_30d, 0) / 30.0, 0) AS media_diaria_30d
FROM public.v_lancha_dim d
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
  'Frescor do AIS por lancha. horas_sem_transmitir NULO = nenhuma posicao em 30 dias. A Taiba aparece assim SEMPRE, por nao ter MMSI cadastrado — nao e falha.';

GRANT SELECT ON public.v_ais_status_transmissao TO anon, authenticated;

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
--   select * from public.v_ais_status_transmissao order by lancha_nome;
--
-- Em 11/09/2026 o esperado era: Fortim com horas_sem_transmitir baixo e
-- media ~1.200/dia; Flexeiras com media alta mas posicoes_24h no chao — que e
-- exatamente o padrao que este detector existe para pegar; Taiba tudo nulo.
