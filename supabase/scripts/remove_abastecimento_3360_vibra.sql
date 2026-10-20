-- ─────────────────────────────────────────────────────────────────────────────
-- Remove o lancamento 3360 — 40 L da Vibra a R$ 22,45, que nao e combustivel
--
-- Apontado pelo briefing de 22/09/2026 e confirmado com o WebPilot: o
-- lancamento do Raimundo foi corrigido la. Aqui ele precisa sair para o numero
-- de setembro fechar.
--
-- ─── POR QUE NAO E COMBUSTIVEL ───────────────────────────────────────────────
--
-- Todo o resto de setembro/2026 esta em R$ 5,67 ou R$ 7,29 por litro:
--
--     16/09  FLEXEIRAS  BR DISTRIBUIDORA   770 L  x R$  5,67  = R$ 4.365,90
--     16/09  FLEXEIRAS  VIBRA ENERGIA       40 L  x R$ 22,45  = R$   898,00  ←
--     17/09  TAIBA III  BR DISTRIBUIDORA   200 L  x R$  5,67  = R$ 1.134,00
--
-- Quatro vezes o preco do diesel, em volume de 40 L, no mesmo dia em que a
-- lancha ja abasteceu 770 L. O horimetro do lancamento (19.238) bate com a
-- leitura da Flexeiras em 16/09 as 12:01, entao o evento existiu — o que estava
-- errado era a categoria.
--
-- Sem esta remocao, setembro sai com 40 L e R$ 898 a mais em combustivel, o que
-- contamina litros_por_hora_operada, litros_por_manobra, preco_medio_litro e
-- custo_combustivel_webpilot em v_analytics_frota_mes.
--
-- ⚠️ DEPOIS DE APAGAR, RODE O sync-abastecimentos. O endpoint nao tem janela de
--    data, entao a versao corrigida volta na proxima sincronizacao. Se voltar
--    com os mesmos R$ 22,45, a correcao no WebPilot nao pegou — chame o
--    Raimundo antes de apagar de novo.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ANTES: confira que e o registro certo ────────────────────────────────────
SELECT cd_abastecimento, ds_lancha, dh_abastecimento, ds_posto,
       dc_litros, vl_unitario, vl_total, dc_horimetro_bb
  FROM public.abastecimentos_combustivel
 WHERE cd_abastecimento = 3360;
-- esperado: 1 linha, FLEXEIRAS, 2026-09-16, VIBRA ENERGIA, 40 L, 22.45, 898.00

-- ── A REMOCAO ────────────────────────────────────────────────────────────────
-- As travas de valor existem para que, se o sync ja tiver trazido a versao
-- corrigida antes de voce rodar isto, o DELETE nao alcance nada.
DELETE FROM public.abastecimentos_combustivel
 WHERE cd_abastecimento = 3360
   AND vl_unitario = 22.45
   AND dc_litros   = 40;

-- ── DEPOIS: setembro sem o registro ──────────────────────────────────────────
SELECT ds_lancha,
       count(*)              AS abastecimentos,
       sum(dc_litros)        AS litros,
       round(sum(vl_total)::numeric, 2) AS total_rs,
       round((sum(vl_total) / nullif(sum(dc_litros), 0))::numeric, 2) AS preco_medio
  FROM public.abastecimentos_combustivel
 WHERE dh_abastecimento >= '2026-09-01' AND dh_abastecimento < '2026-10-01'
 GROUP BY 1 ORDER BY 1;
-- O preco medio da Flexeiras tem que cair para perto de R$ 5,67.

-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ O PROBLEMA DE FUNDO, que este script NAO resolve
--
-- `sync-abastecimentos` faz upsert com `ignoreDuplicates: true` sobre
-- cd_abastecimento. Em portugues: uma vez que o registro entrou, NENHUMA
-- correcao feita no WebPilot chega ao FleetIQ. Foi exatamente isso que obrigou
-- a apagar a mao em vez de simplesmente sincronizar.
--
-- E o mesmo defeito que a ocorrencia 7135 expos do outro lado, e que ja foi
-- corrigido em sync-ocorrencias (falta publicar).
--
-- A correcao aqui NAO e obvia e por isso nao foi feita: trocar para
-- sobrescrever passaria por cima dos 1.271 registros na proxima execucao, e
-- `abastecimentos_combustivel` NAO tem coluna `origem` — nao da para proteger o
-- que foi ajustado a mao no banco, como se faz em ocorrencias_webpilot com
-- `AND origem = 'webpilot_sync'`. Decidir isso exige saber se existe ajuste
-- manual nessa tabela. Enquanto nao se sabe, correcao no WebPilot continua
-- exigindo remocao a mao.
-- ─────────────────────────────────────────────────────────────────────────────
