-- ============================================================================
-- Remove 17 leituras duplicadas em indicadores_ativos.
--
-- CAUSA: em 16/06/2026 foi feita uma carga histórica completa (1.911 linhas,
-- leituras de 2019-01-03 a 2026-06-13, todas com created_at de 16/06). Em
-- 17/06 o sync diário começou, e a janela dele alcançava 18/05 para trás. As
-- duplicatas são exatamente a sobreposição entre as duas.
--
-- O dedup do sync-indicadores usa `onConflict: cd_ativo_indicador`, o ID do
-- WebPilot. A origem emitiu IDs diferentes para a mesma leitura física — 1892
-- e 3055 para o mesmo instante, por exemplo — então a chave não colidiu.
--
-- Evento único: a carga histórica terminou em 13/06 e não há duplicata com
-- data de leitura posterior. Não pode recorrer por essa causa.
--
-- EFEITO: dc_dif_be vem duplicado junto, então SUM(dc_dif_be) contava horas em
-- dobro. 281 h no total, concentradas em maio e junho de 2026:
--   2026-05  Flexeiras +61  Fortim +66  Taíba +41
--   2026-06  Flexeiras +31  Fortim +82
--
-- Isso afeta a v_analytics_frota_mes.horas_operadas E cinco pontos do
-- frontend que somam dc_dif_be diretamente: AnaliseTrimestral.tsx:161,
-- ManutencaoPage.tsx:337 e :440, OperacoesPage.tsx:267 e :411.
--
-- QUAL LINHA FICA: a de maior cd_ativo_indicador, que é a do sync diário.
-- Verificado contra abastecimentos_combustivel, fonte independente que também
-- registra horímetro: nas 10 leituras em que as duas séries divergem, o sync
-- bate com o abastecimento nas 10. A carga histórica erra por constante de
-- casco (Fortim +6 h, Taíba −3 h). Nas outras 5 os valores são idênticos.
-- ============================================================================

-- ── PASSO 0 — PREVIEW. Rode sozinho antes. ─────────────────────────────────
-- SELECT ds_lancha, dh_leitura, ds_origem, count(*) AS linhas,
--        array_agg(cd_ativo_indicador ORDER BY cd_ativo_indicador) AS cds,
--        array_agg(dc_horimetro_bb   ORDER BY cd_ativo_indicador) AS horimetros,
--        array_agg(dc_dif_be         ORDER BY cd_ativo_indicador) AS deltas
--   FROM indicadores_ativos
--  GROUP BY 1, 2, 3 HAVING count(*) > 1
--  ORDER BY dh_leitura;
-- Esperado: 17 grupos, todos com dh_leitura entre 2026-02-03 e 2026-06-13.

BEGIN;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY cd_lancha, dh_leitura, ds_origem
           ORDER BY cd_ativo_indicador DESC
         ) AS rn
    FROM indicadores_ativos
)
DELETE FROM indicadores_ativos i
 USING ranked r
 WHERE i.id = r.id
   AND r.rn > 1;

COMMIT;

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Esperado: 17 linhas apagadas, zero grupos duplicados restantes, e as horas
-- de junho caindo para ~192 h na Fortim e ~233 h na Flexeiras.
--
-- SELECT lancha, ano_mes, horas_operadas, n_leituras_horimetro
--   FROM v_analytics_frota_mes
--  WHERE ano_mes IN ('2026-05','2026-06') ORDER BY ano_mes, lancha;

-- ── NÃO INCLUÍDO AQUI: a trava contra recorrência ───────────────────────────
-- Uma UNIQUE (cd_lancha, dh_leitura, ds_origem) impediria o caso de repetir
-- mesmo com IDs diferentes. Não está nesta migration porque muda o
-- comportamento do sync: hoje ele usa `onConflict: cd_ativo_indicador`, e uma
-- segunda constraint faria a função **falhar** em vez de ignorar. Aplicar isso
-- exige ajustar o onConflict junto. Decisão para quando houver folga — o risco
-- de recorrência é baixo, já que a causa foi uma carga histórica única.
