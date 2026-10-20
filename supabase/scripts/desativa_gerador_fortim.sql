-- ─────────────────────────────────────────────────────────────────────────────
-- Desativa o Gerador 1 (Fortim) — equipamento removido da lancha
--
-- O gerador foi retirado; o Victron passou a ser a fonte principal. Ver
-- references/vrm.md ("Gerador a bordo: removido") e contexto_da_gestao.md
-- ("na Fortim nao existe gerador para falhar"). Aprovado pela gestao em
-- 11/09/2026.
--
-- Efeito: o ativo sai de `v_situacao_atual` (os dois ramos da view filtram
-- `ativo = TRUE`) e das telas do FleetIQ (useAtivos, intervalos e contagem do
-- dashboard filtram o mesmo campo). Verificado antes de escrever — nada quebra.
--
-- Some tambem o semaforo de oleo que ficaria verde para sempre em 75/200 h,
-- porque o horimetro parou quando o equipamento saiu.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 — desativar o ativo ──────────────────────────────────────────────
UPDATE public.ativos
   SET ativo = false
 WHERE id = 'b0000000-0000-0000-0000-000000000041';   -- Gerador 1, Fortim

-- ── PASSO 2 — registrar a remocao no historico de posicoes ───────────────────
-- Sem isto `ativos` diz uma coisa e `posicoes` diz outra: a linha continuaria
-- como instalacao vigente.
--
-- ⚠️ A DATA E ESTIMADA. O horimetro rodou ~75 h depois da troca de oleo de
-- 05/11/2025 e, no ritmo historico de 4,1 h/dia, isso da duas a tres semanas.
-- Se a gestao souber a data real, use a dela.
UPDATE public.posicoes
   SET data_remocao = DATE '2025-12-01'
 WHERE ativo_id = 'b0000000-0000-0000-0000-000000000041'
   AND data_remocao IS NULL;

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
-- Deve voltar 2 linhas (Gerador 2 da Taiba e Gerador 3 da Flexeiras):
--   select ativo_nome, lancha_nome, status_semaforo
--     from public.v_situacao_atual where tipo = 'gerador' order by ativo_nome;
--
-- Se voltar 3, pare e avise.
--
-- E o dashboard passa de 21 para 20 ativos — esperado.
