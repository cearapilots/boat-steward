-- ─────────────────────────────────────────────────────────────────────────────
-- Indices para o cruzamento de v_ais_saida_motivo
--
-- Sem eles a view devolve 500 (timeout) quando consultada inteira: sao 4.151
-- episodios, cada um disparando quatro subconsultas correlacionadas, e cada
-- subconsulta varrendo a tabela inteira. So contra manobras_lanchas isso da
-- 4.151 x 16.063 = 67 milhoes de comparacoes.
--
-- As quatro tabelas sao pequenas (16 mil, 1,3 mil, 924 e 184 linhas), entao
-- CONCURRENTLY e desnecessario — cada indice sai em menos de um segundo.
--
-- A ordem das colunas importa: primeiro a de igualdade (a lancha), depois a de
-- faixa (a data). O inverso nao serve para este padrao de consulta.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_manobras_lancha_dh
  ON public.manobras_lanchas (cd_lancha, dh_manobra);

CREATE INDEX IF NOT EXISTS idx_abastecimentos_lancha_dh
  ON public.abastecimentos_combustivel (cd_lancha, dh_abastecimento);

-- Ocorrencia e testada por SOBREPOSICAO de janela (data_inicio <= fim do
-- episodio AND data_fim >= inicio), entao o indice cobre as duas pontas.
CREATE INDEX IF NOT EXISTS idx_ocorrencias_lancha_periodo
  ON public.ocorrencias_webpilot (lancha_id, data_inicio, data_fim);

CREATE INDEX IF NOT EXISTS idx_provas_mar_lancha_data
  ON public.provas_mar (lancha_id, data);

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) A VIEW RESPONDE INTEIRA AGORA? Antes disto, esta consulta dava timeout.
--
-- SELECT motivo, count(*) FROM public.v_ais_saida_motivo GROUP BY 1 ORDER BY 2 DESC;

-- 2) O PLANO USA OS INDICES? Procure "Index Scan" nas subconsultas; se aparecer
--    "Seq Scan" sobre manobras_lanchas, algo esta errado.
--
-- EXPLAIN ANALYZE
-- SELECT count(*) FROM public.v_ais_saida_motivo WHERE motivo = 'sem_registro';
