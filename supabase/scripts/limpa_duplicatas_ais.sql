-- ─────────────────────────────────────────────────────────────────────────────
-- Remove a duplicacao de leituras AIS na janela de sobreposicao
--
-- CAUSA: residuo de execucao. A Edge Function rodou uma vez ANTES de receber a
-- correcao de truncamento, gravando com milissegundo, enquanto o backfill SQL
-- gravou truncado ao segundo. A MESMA leitura ficou em duas linhas:
--
--   2026-09-10T12:46:32+00:00      lat -3.525037   <- backfill
--   2026-09-10T12:46:32.953+00:00  lat -3.525037   <- execucao antiga da funcao
--
-- [VERIFICADO 11/09/2026] A funcao publicada JA E a corrigida: as linhas da
-- execucao do cron das 09:40 UTC de hoje estao todas truncadas. Ou seja, isto
-- aqui e limpeza de passado, nao ha nada a republicar antes — e a duplicacao
-- nao volta a acontecer.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 0 — dimensionar antes de mexer ─────────────────────────────────────
SELECT count(*) FILTER (WHERE dh_posicao <> date_trunc('second', dh_posicao)) AS com_fracao,
       count(*)                                                               AS total
  FROM public.posicoes_ais;

-- ── PASSO 1 — apagar as fracionarias que TEM gemea truncada ──────────────────
-- Sao as duplicatas reais: a leitura ja existe, vinda do backfill.
DELETE FROM public.posicoes_ais a
 WHERE a.dh_posicao <> date_trunc('second', a.dh_posicao)
   AND EXISTS (
     SELECT 1 FROM public.posicoes_ais b
      WHERE b.cd_lancha   = a.cd_lancha
        AND b.dh_posicao  = date_trunc('second', a.dh_posicao)
        AND b.tem_posicao = a.tem_posicao
   );

-- ── PASSO 2 — colisoes entre fracionarias do mesmo segundo ───────────────────
-- Raro, mas se existirem o PASSO 3 falharia na chave unica. Mantem a de menor id.
DELETE FROM public.posicoes_ais a
 USING public.posicoes_ais b
 WHERE a.dh_posicao <> date_trunc('second', a.dh_posicao)
   AND b.dh_posicao <> date_trunc('second', b.dh_posicao)
   AND a.cd_lancha   = b.cd_lancha
   AND a.tem_posicao = b.tem_posicao
   AND date_trunc('second', a.dh_posicao) = date_trunc('second', b.dh_posicao)
   AND a.id > b.id;

-- ── PASSO 3 — truncar o que sobrou ───────────────────────────────────────────
-- Leituras que so a funcao viu (posteriores ao corte do backfill). Truncar aqui
-- faz elas casarem com as proximas execucoes ja corrigidas.
UPDATE public.posicoes_ais
   SET dh_posicao = date_trunc('second', dh_posicao)
 WHERE dh_posicao <> date_trunc('second', dh_posicao);

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
-- Tem que voltar zero:
--   select count(*) from public.posicoes_ais
--    where dh_posicao <> date_trunc('second', dh_posicao);
--
-- E a leitura do exemplo tem que existir UMA vez so:
--   select dh_posicao, dc_latitude from public.posicoes_ais
--    where cd_lancha = 121
--      and dh_posicao between '2026-09-10T12:46:00Z' and '2026-09-10T12:47:00Z';
--
-- Depois, rode a funcao duas vezes seguidas: a contagem nao pode mudar.
