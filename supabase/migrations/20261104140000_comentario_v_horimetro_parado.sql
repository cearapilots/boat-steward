-- ─────────────────────────────────────────────────────────────────────────────
-- 04/11/2026 — o Dashboard voltou a mostrar a troca de óleo do ativo congelado
--              em horas, como antes
--
-- A 20261104100000 levou para o Dashboard o calendário da troca de óleo do ativo
-- com horímetro congelado (o Gerador 2 da Taíba aparecia com "23 d", amarelo) e
-- escreveu isso no comentário desta view. Foi desfeito no mesmo dia, a pedido do
-- Arthur: a coluna Troca óleo voltou às horas de v_situacao_atual. O Dashboard
-- segue lendo a view só para a data da última leitura de cada lancha.
--
-- Esta migration só acerta o comentário. `ativo_id` fica na view sem uso na
-- tela; não atrapalha, e tirar coluna de view exigiria DROP.
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON VIEW public.v_horimetro_parado IS
  'Ativos cujo horimetro de origem parou de andar, deixando o semaforo de troca '
  'de oleo congelado num valor que nunca muda. Quando horimetro_congelado = true, '
  'horas_restantes_troca de v_situacao_atual e ficcao e o criterio que vale e '
  'dias_desde_troca contra mediana_dias_entre_trocas. Caso vivo em 29/09/2026: '
  'Taiba Gerador 2, parado em 10.219 h desde 21/05/2026. Desde 04/11/2026 o '
  'Dashboard le ultima_leitura desta view para mostrar no cartao da lancha a '
  'data da ultima leitura de horimetro.';
