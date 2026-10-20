-- ─────────────────────────────────────────────────────────────────────────────
-- v_ais_paradas_fora — onde as lanchas param fora de qualquer cerca
--
-- Existe para responder uma pergunta concreta da gestao: qual e, no mapa, a
-- area em que as lanchas ficam paradas sem estar em nenhuma base declarada.
--
-- ─── POR QUE ─────────────────────────────────────────────────────────────────
--
-- Em agosto/2026 a Fortim passou 178,8 h parada FORA da base contra 92,4 h da
-- Flexeiras, enquanto as duas se moveram praticamente o mesmo (103,7 e 102,2 h).
-- Quase toda essa diferenca esta num aglomerado ao norte do berco do Pecem que
-- nao tem cerca — provavelmente um ponto de espera de uso costumeiro.
--
-- Nao desenhamos o poligono por conta propria: o aglomerado se espalha por
-- ~600 m nos dois eixos e um palpite nosso entraria direto nos numeros. Esta
-- view agrega as posicoes em celulas para que a area possa ser vista no Google
-- Earth e delimitada por quem opera.
--
-- ─── COMO LER ────────────────────────────────────────────────────────────────
--
-- Uma linha por celula de ~11 m (4 casas decimais). `horas` e o tempo parado
-- acumulado ali, contando so intervalos de ate 30 min entre posicoes — acima
-- disso e buraco de AIS, nao permanencia observada.
--
-- Celula com muitas horas e mais de uma lancha e forte candidata a fazer parte
-- da area. Celula isolada com poucas horas pode ser so uma espera pontual.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ais_paradas_fora AS
SELECT
  round(c.dc_latitude::numeric,  4) AS lat,
  round(c.dc_longitude::numeric, 4) AS lon,
  count(*)                          AS n_posicoes,
  count(DISTINCT c.ds_lancha)       AS n_lanchas,
  string_agg(DISTINCT c.ds_lancha, ', ' ORDER BY c.ds_lancha) AS lanchas,
  round((sum(LEAST(EXTRACT(epoch FROM (c.prox_t - c.dh_posicao)), 1800)) / 3600.0)::numeric, 2) AS horas,
  min(c.dh_posicao)::date AS primeira,
  max(c.dh_posicao)::date AS ultima,
  -- Rotulo grosseiro de regiao, so para filtrar rapido.
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

COMMENT ON VIEW public.v_ais_paradas_fora IS
  'Celulas de ~11 m onde as lanchas ficam PARADAS (abaixo de 1 kn) fora de qualquer cerca declarada, com horas acumuladas. Base da discussao sobre cercar o ponto de espera do Pecem. Nao e uma cerca: e a evidencia para desenhar uma.';

GRANT SELECT ON public.v_ais_paradas_fora TO anon, authenticated;
