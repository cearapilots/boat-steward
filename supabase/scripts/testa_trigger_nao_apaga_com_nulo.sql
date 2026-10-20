-- ─────────────────────────────────────────────────────────────────────────────
-- Teste do trigger `nao_apaga_com_nulo` — roda em transação e DESFAZ no fim.
-- Nada é alterado. Serve para conferir a proteção antes de virar a chave de
-- qualquer sync para sobrescrever.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Onde o trigger está instalado ─────────────────────────────────────────
SELECT c.relname AS tabela
  FROM pg_trigger t
  JOIN pg_class  c ON c.oid = t.tgrelid
 WHERE t.tgname = 'trg_nao_apaga_com_nulo'
 ORDER BY 1;
-- ESPERADO: abastecimentos_combustivel, fainas_deslocamentos, indicadores_ativos,
--           manobras_lanchas, manutencoes, vencimentos.  E NADA de posicoes_ais.


-- ── 2) O nulo é recusado, o valor de verdade passa ───────────────────────────
BEGIN;

  SELECT cd_manobra, ds_porto AS antes
    FROM public.manobras_lanchas WHERE cd_manobra = 44811;

  -- a) tentativa de apagar com nulo — tem que ser IGNORADA
  UPDATE public.manobras_lanchas SET ds_porto = NULL WHERE cd_manobra = 44811;
  SELECT cd_manobra, ds_porto AS depois_do_nulo
    FROM public.manobras_lanchas WHERE cd_manobra = 44811;
  -- ESPERADO: continua 'Mucuripe'

  -- b) sobrescrita com valor real — tem que PASSAR
  UPDATE public.manobras_lanchas SET ds_porto = 'TESTE' WHERE cd_manobra = 44811;
  SELECT cd_manobra, ds_porto AS depois_do_valor
    FROM public.manobras_lanchas WHERE cd_manobra = 44811;
  -- ESPERADO: 'TESTE' — o trigger barra nulo, não congela a linha

ROLLBACK;


-- ── 3) O mesmo no campo que já nos queimou: o horímetro ──────────────────────
BEGIN;

  UPDATE public.indicadores_ativos
     SET dc_horimetro_gerador = NULL WHERE cd_ativo_indicador = 3215;
  SELECT cd_ativo_indicador, dc_horimetro_gerador AS depois_do_nulo
    FROM public.indicadores_ativos WHERE cd_ativo_indicador = 3215;
  -- ESPERADO: continua 7505

  UPDATE public.indicadores_ativos
     SET dc_horimetro_gerador = 9999 WHERE cd_ativo_indicador = 3215;
  SELECT cd_ativo_indicador, dc_horimetro_gerador AS depois_do_valor
    FROM public.indicadores_ativos WHERE cd_ativo_indicador = 3215;
  -- ESPERADO: 9999 — correção da origem chega normalmente

ROLLBACK;


-- ── 4) Linha com origem = 'manual' não é tocada ──────────────────────────────
BEGIN;

  SELECT id, tipo, horimetro_equipamento AS antes
    FROM public.manutencoes WHERE origem = 'manual' LIMIT 1;

  UPDATE public.manutencoes
     SET horimetro_equipamento = 1
   WHERE id = (SELECT id FROM public.manutencoes WHERE origem = 'manual' LIMIT 1);

  SELECT id, tipo, horimetro_equipamento AS depois
    FROM public.manutencoes WHERE origem = 'manual' LIMIT 1;
  -- ESPERADO: inalterado. Conserto à mão não é desfeito por sync.

ROLLBACK;
