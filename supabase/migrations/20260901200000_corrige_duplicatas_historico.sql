-- ============================================================================
-- Remove as duplicatas de troca de óleo em historico.
--
-- Complementa 20260901190000, que limpou manutencoes. A tabela historico tem o
-- mesmo evento gravado duas vezes pelo mesmo motivo: sync-ocorrencias grava
-- data_evento à meia-noite, sync-trocas-oleo grava com a hora real, e o dedup
-- do sync-trocas-oleo compara data_evento por igualdade exata — nunca casa com
-- a linha do outro.
--
-- Isto importa para a interface: useManutencoes() em src/hooks/useFleetData.ts
-- lê historico, não manutencoes, apesar do nome. É esta tabela que alimenta a
-- página Histórico de Manutenções.
--
-- Escopo restrito a origem = 'webpilot_sync'. As 71 linhas com ativo_id nulo
-- vindas de import_excel ficam intocadas, assim como qualquer lançamento
-- manual. Dias com dois serviços distintos (motores e reversores, por exemplo)
-- não são afetados: são ativo_id diferentes, logo partições diferentes.
-- ============================================================================

-- ── PASSO 0 — PREVIEW. Rode sozinho antes. ─────────────────────────────────
-- SELECT a.nome, (h.data_evento AT TIME ZONE 'UTC')::date AS dia,
--        count(*) AS linhas, array_agg(h.descricao) AS textos
--   FROM historico h
--   JOIN ativos a ON a.id = h.ativo_id
--  WHERE h.tipo_evento = 'troca_oleo' AND h.origem = 'webpilot_sync'
--  GROUP BY 1, 2 HAVING count(*) > 1
--  ORDER BY 2 DESC;

-- ── PASSO 1 — remover ───────────────────────────────────────────────────────
-- Mantém a linha com hora real, que é a do sync-trocas-oleo — mesma regra
-- aplicada em manutencoes, para as duas tabelas contarem a mesma história.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY ativo_id, tipo_evento, (data_evento AT TIME ZONE 'UTC')::date
           ORDER BY ((data_evento AT TIME ZONE 'UTC')::time <> '00:00:00') DESC,
                    created_at ASC
         ) AS rn
    FROM historico
   WHERE tipo_evento = 'troca_oleo'
     AND origem      = 'webpilot_sync'
     AND ativo_id IS NOT NULL
)
DELETE FROM historico h
 USING ranked r
 WHERE h.id = r.id
   AND r.rn > 1;

-- ── PASSO 2 — conferência ───────────────────────────────────────────────────
-- Esperado: 2 linhas para 20/08/2026, uma por motor, texto
-- "Troca de óleo e filtro dos Motores".
--
-- SELECT a.nome, h.data_evento, h.descricao
--   FROM historico h JOIN ativos a ON a.id = h.ativo_id
--  WHERE h.tipo_evento = 'troca_oleo'
--    AND h.data_evento >= '2026-08-19' AND h.data_evento < '2026-08-22'
--  ORDER BY a.nome;
