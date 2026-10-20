-- ─────────────────────────────────────────────────────────────────────────────
-- O overhaul do Gerador 2: 09/05/2024, com 9.212 h — e não 18/03/2022 com 4.920
--
-- ─── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- A `v_situacao_atual` mostrava o Gerador 2 da Taíba com overhaul "vencido há
-- 2.299 h", em vermelho: referência de 4.920 h em 18/03/2022 + intervalo de
-- 3.000 = 7.920 h, contra 10.219 h no horímetro. Os briefings chamaram de
-- "artefato da troca de escala de 19/05/2026" e pediram a referência real.
--
-- ─── A CAUSA: NÃO FOI TROCA DE ESCALA, FOI TROCA DE GERADOR ──────────────────
--
-- A planilha de controle que a gestão usava antes do FleetIQ registra os
-- geradores circulando entre as lanchas. O FleetIQ modelou "o gerador da Taíba"
-- como um equipamento só e herdou o histórico de dois:
--
--   GERADOR 1 — estava na Taíba em 2022–2024
--     21/10/2022 → 04/07/2024   trocas de óleo de 5.280 a 6.075 h na Taíba
--     06/06/2024   "Gerador 1 remanejado da Taíba para a Flexeiras" — 5.974 h
--     26/07/2024   "Gerador 1 remanejado da Taíba para a Fortim"    — 6.079 h
--                  (depois revisão geral de 2.000 h em 04/2025; removido na
--                   conversão da Fortim para lítio — hoje `ativo = false`)
--
--   GERADOR 2 — estava na Fortim até 07/2024, e é o que está na Taíba hoje
--     09/05/2024   "Revisão geral do gerador, com desmontagem"      9.212 h  ← ESTE
--     26/07/2024   "Gerador 2 retirado de bordo para manutenção"    9.637 h
--     29/10/2024   "Gerador 2 reinstalado [na Taíba] após período de revisão e
--                   substituição do anel coletor do porta escovas"  9.637 h
--     12/08/2025   troca de óleo na Taíba                           9.966 h
--     07/04/2026   troca de óleo na Taíba                          10.165 h
--
-- A observação de 29/10/2024 é a mesma que está hoje nos agregados do WebPilot
-- para o Gerador 2 ("horímetro do equipamento: 9.637h") — confere a identidade.
-- A série do horímetro na Fortim é contínua de 8.591 h (26/01/2024) a 9.637 h
-- (26/07/2024), passando pelos 9.212 h do overhaul: é o mesmo equipamento.
--
-- Os 4.920 h de 18/03/2022 estão na escala do GERADOR 1 (que tinha 5.280 h em
-- 10/2022). A planilha não registra overhaul de gerador nessa data; o dia é o
-- de uma troca de MOTOR da Taíba. Era referência emprestada de outro equipamento.
--
-- ─── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--
-- Registra o overhaul de 09/05/2024 como evento em `manutencoes`, com a lancha
-- onde ele aconteceu (Fortim) e a fonte na observação. O gatilho
-- `atualizar_ativo_apos_manutencao` leva os 9.212 h e a data para `ativos`, que
-- é de onde a `v_situacao_atual` lê. Resultado: 10.219 − 9.212 = 1.007 h desde o
-- overhaul; restam 1.993 h no intervalo de 3.000 — verde.
--
-- ⚠️ O que NÃO foi feito, de propósito: reatribuir as trocas de óleo antigas
--    entre Gerador 1 e Gerador 2. O critério de calendário do óleo
--    (`v_horimetro_parado.mediana_dias_entre_trocas`) mede o ritmo de USO DA
--    LANCHA. Levar para o Gerador 2 o histórico dele na Fortim, onde trocava
--    óleo a cada um ou dois meses, faria a reserva aparecer como atrasadíssima.
--    O overhaul é outra coisa: conta horas do equipamento físico, e por isso
--    acompanha o gerador.
--
-- ⚠️ As leituras de horímetro de gerador da Taíba de 01 a 05/2026 (1.187 a 1.302 h)
--    continuam sem explicação e inutilizáveis — não batem com nenhum dos dois
--    geradores. A partir de 19/05/2026 a série volta à escala do Gerador 2.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.manutencoes
  (ativo_id, lancha_id, tipo, data_manutencao,
   horimetro_lancha, horimetro_equipamento, observacao, origem)
SELECT 'b0000000-0000-0000-0000-000000000042',          -- Gerador 2
       'a0000000-0000-0000-0000-000000000002',          -- Fortim: onde estava no overhaul
       'overhaul',
       TIMESTAMPTZ '2024-05-09 00:00:00-03',
       9212, 9212,
       'Revisão geral do gerador, com desmontagem. Fonte: planilha de controle da '
         || 'gestão anterior ao FleetIQ. O Gerador 2 estava na Fortim; foi '
         || 'reinstalado na Taíba em 29/10/2024 com 9.637 h. Registrado em 20/10/2026.',
       'manual'
 WHERE NOT EXISTS (
         SELECT 1 FROM public.manutencoes
          WHERE ativo_id = 'b0000000-0000-0000-0000-000000000042'
            AND tipo = 'overhaul'
            AND horimetro_equipamento = 9212);

-- Espelho na tela Histórico, como os outros overhauls manuais.
INSERT INTO public.historico
  (ativo_id, lancha_id, tipo_evento, data_evento, descricao, origem, dados_extras)
SELECT 'b0000000-0000-0000-0000-000000000042',
       'a0000000-0000-0000-0000-000000000002',
       'overhaul',
       TIMESTAMPTZ '2024-05-09 00:00:00-03',
       'Revisão geral do gerador, com desmontagem (Gerador 2, então na Fortim)',
       'manual',
       jsonb_build_object('horimetro_lancha', 9212, 'horimetro_equipamento', 9212,
                          'fonte', 'planilha de controle anterior ao FleetIQ')
 WHERE NOT EXISTS (
         SELECT 1 FROM public.historico
          WHERE ativo_id = 'b0000000-0000-0000-0000-000000000042'
            AND tipo_evento = 'overhaul'
            AND (data_evento AT TIME ZONE 'America/Fortaleza')::date = DATE '2024-05-09');

-- Explícito, para não depender só do gatilho: a referência certa em `ativos`.
-- Só corrige se ainda estiver na referência emprestada do Gerador 1.
UPDATE public.ativos
   SET horimetro_overhaul = 9212,
       data_overhaul      = DATE '2024-05-09',
       updated_at         = now()
 WHERE id = 'b0000000-0000-0000-0000-000000000042'
   AND horimetro_overhaul = 4920;      -- se o gatilho já corrigiu, não faz nada

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
-- SELECT lancha_nome, ativo_nome, data_overhaul, horimetro_overhaul,
--        proximo_overhaul_horimetro, horas_restantes_overhaul, status_overhaul
--   FROM public.v_situacao_atual WHERE ativo_nome = 'Gerador 2';
--    ESPERADO: 2024-05-09, 9.212 h, próximo 12.212 h, restam 1.993 h, verde.
