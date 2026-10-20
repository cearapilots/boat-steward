-- ─────────────────────────────────────────────────────────────────────────────
-- Pendências do FleetIQ Hub nos briefings de 13/10 e 20/10/2026
--
--   1. Quatro periódicas de ar-condicionado que eram serviço elétrico
--   2. A troca de óleo do Motor 9 da Fortim gravada duas vezes em 08/10
--   3. O espelho da tela Histórico com as mesmas duplicatas — inclusive as três
--      que eu removi de `manutencoes` em 29/09 e esqueci de remover daqui
--   4. Três tentativas erradas do overhaul do Motor 6 da Fortim
--   5. A trava no banco que impede a troca de óleo de entrar duas vezes
--
-- ⚠️ A ORDEM DE PUBLICAÇÃO IMPORTA. As Edge Functions `sync-ocorrencias` e
--    `sync-trocas-oleo` foram publicadas ANTES desta migration, em 20/10/2026.
--    Se esta rodasse antes, o sync da manhã recriava as periódicas apagadas.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ 1. AS PERIÓDICAS DE AR-CONDICIONADO QUE ERAM SERVIÇO ELÉTRICO ═══════════
--
-- O briefing atribuiu à classificação no WebPilot. Não era. As quatro
-- ocorrências estão CORRETAS lá, como "Manutenção elétrica (Corretiva)". Quem
-- as transformou em limpeza de A/C foi a regra de TEXTO da `sync-ocorrencias`:
-- se o tipo não batia com periódica nenhuma, ela procurava "ar condicionado"
-- na descrição — e todo problema elétrico desses barcos cita o A/C, porque ele
-- é a maior carga.
--
--     13/08 Flexeiras   cd 7008   Multiplus desarmando o A/C
--     14/08 Flexeiras             Multiplus desarmando o A/C, de novo
--     08/09 Fortim      cd 7130   inversor não segura o A/C
--     30/09 Flexeiras   cd 7249   fuga de corrente no 220 V
--
-- O último é o que importa hoje: reiniciou a periódica de A/C da Flexeiras e
-- empurrou o vencimento de 15/11 para 29/11, sem limpeza nenhuma feita. Com ele
-- fora, a última realização volta a ser a de 16/09 — a troca do aparelho por um
-- inverter — e o vencimento volta para 15/11.
--
-- Em toda a série, a regra de texto do A/C nunca produziu um acerto. A regra
-- foi restrita a tipos genéricos ("Outros") na mesma data.
--
-- Trava: só apaga se NÃO existir, no mesmo dia e na mesma lancha, ocorrência de
-- tipo ar-condicionado. Se existisse, a periódica seria legítima.

DELETE FROM public.manutencoes_periodicas mp
 WHERE mp.tipo_id = '6e892c99-3082-41c8-ab70-4530c54eb6f9'      -- Limpeza/manutenção ar-condicionado
   AND mp.origem  = 'webpilot_sync'
   AND (mp.lancha_id, mp.data_realizada) IN (
         ('a0000000-0000-0000-0000-000000000001'::uuid, DATE '2026-08-13'),
         ('a0000000-0000-0000-0000-000000000001'::uuid, DATE '2026-08-14'),
         ('a0000000-0000-0000-0000-000000000002'::uuid, DATE '2026-09-08'),
         ('a0000000-0000-0000-0000-000000000001'::uuid, DATE '2026-09-30'))
   AND NOT EXISTS (
         SELECT 1 FROM public.ocorrencias_webpilot o
          WHERE o.lancha_id = mp.lancha_id
            AND (o.data_inicio AT TIME ZONE 'UTC')::date = mp.data_realizada
            AND o.tipo_ocorrencia IN ('Ar Condicionado (Preventiva)',
                                      'Ar Condicionado (Corretiva)'));


-- ═══ 2. A TROCA DE ÓLEO DO MOTOR 9 GRAVADA DUAS VEZES ════════════════════════
--
-- Mesma troca, duas linhas criadas com 0,77 s de diferença em 08/10 às 12:27 —
-- uma às 12:20 (`sync-trocas-oleo`, pelo carimbo) e outra à meia-noite
-- (`sync-ocorrencias`, pela data).
--
-- O briefing achou que o defeito de 29/09 tinha voltado. Não voltou — é outro.
-- A correção de 29/09 fez as duas funções procurarem pelo DIA, e elas procuram.
-- O que aconteceu foi uma CORRIDA: o botão Atualizar dispara as funções em
-- paralelo, as duas perguntaram "já existe troca neste dia?" no mesmo instante,
-- as duas ouviram "não", e as duas gravaram. Checagem-e-depois-gravação não
-- resolve corrida; só uma trava no banco resolve — é o passo 5.
--
-- Regra genérica, e não por ID: apaga a linha de meia-noite quando existe, para
-- o mesmo equipamento e o mesmo dia, uma gêmea com carimbo. Fica a de carimbo,
-- que é a mais precisa — mesma escolha da limpeza de 29/09.

DELETE FROM public.manutencoes m
 WHERE m.tipo   = 'troca_oleo'
   AND m.origem = 'webpilot_sync'
   AND m.data_manutencao = date_trunc('day', m.data_manutencao AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
   AND EXISTS (
         SELECT 1 FROM public.manutencoes g
          WHERE g.ativo_id = m.ativo_id
            AND g.id <> m.id
            AND g.tipo   = 'troca_oleo'
            AND g.origem = 'webpilot_sync'
            AND (g.data_manutencao AT TIME ZONE 'UTC')::date
              = (m.data_manutencao AT TIME ZONE 'UTC')::date
            AND g.data_manutencao <> m.data_manutencao);
-- esperado: 1 linha (Motor 9, 08/10, 00:00)


-- ═══ 3. O ESPELHO DA TELA HISTÓRICO ══════════════════════════════════════════
--
-- ⚠️ ERRO MEU, DE 29/09. Naquele dia removi três trocas duplicadas de
--    `manutencoes` (Motores 4 e 5 da Flexeiras em 16/09, Gerador 3 em 26/08) e
--    não removi o espelho em `historico`, que é o que a tela Histórico lê. As
--    três aparecem em dobro desde então. Mais a do Motor 9 de 08/10: quatro.
--
-- Mesma regra do passo 2. `ativo_id IS NOT NULL` de propósito: o par de
-- 24/07/2024 tem os dois sem ativo e NÃO é duplicata — um é a troca dos
-- motores e o outro a dos reversores, vindos da planilha sem vínculo.

DELETE FROM public.historico h
 WHERE h.tipo_evento = 'troca_oleo'
   AND h.origem      = 'webpilot_sync'
   AND h.ativo_id IS NOT NULL
   AND h.data_evento = date_trunc('day', h.data_evento AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
   AND EXISTS (
         SELECT 1 FROM public.historico g
          WHERE g.ativo_id    = h.ativo_id
            AND g.id <> h.id
            AND g.tipo_evento = 'troca_oleo'
            AND g.origem      = 'webpilot_sync'
            AND (g.data_evento AT TIME ZONE 'UTC')::date
              = (h.data_evento AT TIME ZONE 'UTC')::date
            AND g.data_evento <> h.data_evento);
-- esperado: 4 linhas


-- ═══ 4. AS TRÊS TENTATIVAS ERRADAS DO OVERHAUL DO MOTOR 6 ════════════════════
--
-- O briefing viu duas linhas; são quatro, todas manuais, todas do mesmo evento:
-- a ocorrência 6811 de 01/07, "Substituição do motor 8 pelo motor 6 (posição
-- de boreste)". O WebPilot não registra overhaul nenhum em junho.
--
--   bcb1d7a5  01/06  16.899 h   mês errado. Carrega 13.187 h de casco, que é a
--                                leitura de 01/07 — em 01/06 a Fortim estava
--                                em ~13.000 (12.996 em 28/05, 13.023 em 03/06)
--   6ad5f19f  01/07   9.189 h   casco SOMADO ao offset (−3.998), sinal trocado
--   9b693255  03/07   9.189 h   o mesmo, com a data em que foi digitado
--   8fe6d6d8  01/07  17.185 h   ← A CERTA: 13.187 − (−3.998). É a que a
--                                `v_situacao_atual` usa e a única no Histórico
--
-- Trava: só apaga se a certa existir.

DELETE FROM public.manutencoes
 WHERE id IN ('bcb1d7a5-bb7f-44dd-8757-ad95debad63f',
              '6ad5f19f-53d9-4223-8c27-1803cc2f33c4',
              '9b693255-fb83-4e4c-bc72-9eadbb93d3e0')
   AND ativo_id = 'b0000000-0000-0000-0000-000000000006'          -- Motor 6
   AND tipo     = 'overhaul'
   AND origem   = 'manual'
   AND horimetro_equipamento IN (16899, 9189)
   AND EXISTS (SELECT 1 FROM public.manutencoes
                WHERE id = '8fe6d6d8-b8ec-426d-b14f-555c2c359e22'
                  AND horimetro_equipamento = 17185);


-- ═══ 5. A TRAVA ══════════════════════════════════════════════════════════════
--
-- Uma troca de óleo por equipamento por dia, para o que vem do sync. Quem
-- perder a corrida recebe 23505 — e as duas funções já tratam isso como "já
-- existe", sem abortar e sem gravar o espelho.
--
-- `origem <> 'manual'` de propósito: lançamento à mão é decisão de alguém, e o
-- fluxo manual não passa por esta corrida.
--
-- ⚠️ Limite conhecido: o dia é o de UTC. Uma troca registrada depois das 21h
--    em Fortaleza cai no dia seguinte em UTC. Se a ocorrência abrir antes das
--    21h e o abastecimento for depois, as duas gravações caem em dias
--    diferentes e a trava não pega. É raro — troca de óleo de madrugada —, e a
--    checagem por dia das duas funções também não pegaria.

CREATE UNIQUE INDEX IF NOT EXISTS ux_manutencoes_troca_oleo_dia
  ON public.manutencoes (ativo_id, ((data_manutencao AT TIME ZONE 'UTC')::date))
  WHERE tipo = 'troca_oleo' AND origem <> 'manual';

COMMENT ON INDEX public.ux_manutencoes_troca_oleo_dia IS
  'Uma troca de oleo por equipamento por dia (UTC), para o que vem do sync. '
  'Existe porque sync-ocorrencias e sync-trocas-oleo gravam o mesmo evento e, '
  'disparadas juntas pelo botao Atualizar, as duas checavam "ja existe?" ao '
  'mesmo tempo e as duas gravavam. Corrida nao se resolve com checagem; so com '
  'trava no banco. Caso real: Motor 9 da Fortim, 08/10/2026, 0,77 s de diferenca.';


-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--
-- 1) A periódica de A/C da Flexeiras volta a vencer em 15/11:
-- SELECT lancha_nome, ultima_realizada, proxima_data, dias_restantes
--   FROM public.v_manutencoes_periodicas_status
--  WHERE tipo_nome LIKE 'Limpeza/manuten%';
--
-- 2) Zero grupos duplicados de troca de óleo, nas duas tabelas:
-- SELECT ativo_id, (data_manutencao AT TIME ZONE 'UTC')::date, count(*)
--   FROM public.manutencoes WHERE tipo = 'troca_oleo' AND origem <> 'manual'
--  GROUP BY 1, 2 HAVING count(*) > 1;
--
-- 3) O overhaul do Motor 6 tem uma linha só, a de 17.185 h.
