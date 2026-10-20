-- ─────────────────────────────────────────────────────────────────────────────
-- Remove três trocas de óleo gravadas em duplicidade
--
-- Apontado pelo briefing de 29/09/2026: a troca dos Motores 4 e 5 da Flexeiras
-- em 16/09 tem quatro linhas em `manutencoes` para dois motores.
--
-- ─── A CAUSA: duas funções, duas chaves de deduplicação ──────────────────────
--
-- `sync-ocorrencias` e `sync-trocas-oleo` gravam troca de óleo na MESMA tabela,
-- com convenções de horário diferentes:
--
--     sync-ocorrencias   data_manutencao = so a DATA    → 2026-09-16T00:00
--                        deduplica pelo INTERVALO do dia → enxerga a outra
--
--     sync-trocas-oleo   data_manutencao = o TIMESTAMP  → 2026-09-16T12:01
--                        deduplicava por IGUALDADE EXATA → nunca enxergava
--
-- Quem duplicava era a `sync-trocas-oleo`. Corrigida e publicada em 29/09/2026:
-- passou a deduplicar pelo intervalo do dia, igual à outra.
--
-- ⚠️ O defeito e ANTIGO, nao veio do deploy de 22/09. A extra do Gerador 3 foi
--    criada em 03/09, bem antes. As duas dos Motores 4 e 5 sairam em 22/09 as
--    14:06, quando o sync foi disparado pela tela.
--
-- ─── O QUE FICA E O QUE SAI ──────────────────────────────────────────────────
--
-- Mantém-se a linha com o TIMESTAMP CHEIO — é a mais precisa, e é a que o
-- cálculo de horas restantes já usava por ser a mais recente. Sai a de
-- meia-noite. Os horímetros são idênticos nos pares, então nada muda no
-- semáforo nem na previsão.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ANTES ────────────────────────────────────────────────────────────────────
SELECT a.nome, m.data_manutencao, m.horimetro_equipamento, m.created_at, m.id
  FROM public.manutencoes m
  JOIN public.ativos a ON a.id = m.ativo_id
 WHERE m.id IN ('100d5611-54e4-4cb3-b364-f4856ea5bf76',
                'ce63233e-8e46-4568-8e68-88954796b985',
                '66e5bbb8-3281-4ed9-a6e9-f0690fb24b10')
 ORDER BY m.data_manutencao;
-- esperado: 3 linhas — Gerador 3 em 26/08 00:00, Motores 5 e 4 em 16/09 00:00

-- ── A REMOÇÃO ────────────────────────────────────────────────────────────────
-- Travas de hora e origem: se alguém já tiver corrigido à mão, nada é apagado.
DELETE FROM public.manutencoes
 WHERE id IN ('100d5611-54e4-4cb3-b364-f4856ea5bf76',
              'ce63233e-8e46-4568-8e68-88954796b985',
              '66e5bbb8-3281-4ed9-a6e9-f0690fb24b10')
   AND origem = 'webpilot_sync'
   AND tipo   = 'troca_oleo'
   AND EXTRACT(hour FROM data_manutencao) = 0
   AND EXTRACT(minute FROM data_manutencao) = 0;

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) Nao sobrou par duplicado. ZERO linhas.
--
-- SELECT a.nome, m.tipo, m.data_manutencao::date AS dia,
--        m.horimetro_equipamento, count(*)
--   FROM public.manutencoes m
--   JOIN public.ativos a ON a.id = m.ativo_id
--  GROUP BY 1, 2, 3, 4
-- HAVING count(*) > 1;

-- 2) O semaforo dos tres ativos nao mudou.
--
-- SELECT lancha_nome, ativo_nome, ultima_troca_data, ultima_troca_horimetro,
--        horas_restantes_troca, status_semaforo
--   FROM public.v_situacao_atual
--  WHERE ativo_nome IN ('Motor 4', 'Motor 5', 'Gerador 3')
--  ORDER BY lancha_nome, ativo_nome;
--    ESPERADO: Motores 4 e 5 da Flexeiras com ultima_troca em 16/09; Gerador 3
--    em 26/08 e 61 h restantes.
