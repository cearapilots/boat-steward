-- ============================================================================
-- Restaura os três baselines que o PASSO 2 da migration 20260901190000
-- atropelou.
--
-- Causa: aquele UPDATE fazia `SET ultima_troca_horimetro = m.horimetro_lancha`
-- para TODOS os ativos, a partir da última troca em `manutencoes`. Registros
-- vindos de `import_excel` guardam o valor em `horimetro_equipamento` e deixam
-- `horimetro_lancha` NULO — então os dois geradores receberam NULL por cima de
-- um valor bom. O Motor 8 tinha baseline sem evento correspondente e foi
-- puxado para um registro mais antigo.
--
-- Agravante: na `v_situacao_atual` um baseline nulo produz `status_semaforo`
-- = 'verde', não '—'. Os dois geradores ficaram fora do monitoramento de troca
-- de óleo **parecendo saudáveis**.
--
-- Valores restaurados a partir de snapshot lido em 01/09/2026 antes da
-- migration.
-- ============================================================================

BEGIN;

UPDATE ativos SET ultima_troca_horimetro = 8257,  ultima_troca_data = '2025-11-05', updated_at = now()
 WHERE id = 'b0000000-0000-0000-0000-000000000041';   -- Gerador 1, Fortim

UPDATE ativos SET ultima_troca_horimetro = 10165, ultima_troca_data = '2026-04-07', updated_at = now()
 WHERE id = 'b0000000-0000-0000-0000-000000000042';   -- Gerador 2, Taíba

UPDATE ativos SET ultima_troca_horimetro = 13187, ultima_troca_data = '2026-07-01', updated_at = now()
 WHERE id = 'b0000000-0000-0000-0000-000000000008';   -- Motor 8, reserva

COMMIT;

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Esperado:
--   Gerador 1   8257  2025-11-05   próxima  8457
--   Gerador 2  10165  2026-04-07   próxima 10365
--   Motor 8    13187  2026-07-01   próxima 13437
--
-- SELECT nome, ultima_troca_horimetro, ultima_troca_data,
--        ultima_troca_horimetro + intervalo_manutencao AS proxima_troca
--   FROM ativos
--  WHERE id IN ('b0000000-0000-0000-0000-000000000041',
--               'b0000000-0000-0000-0000-000000000042',
--               'b0000000-0000-0000-0000-000000000008')
--  ORDER BY nome;
