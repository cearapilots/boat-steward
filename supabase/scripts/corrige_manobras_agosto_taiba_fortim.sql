-- ─────────────────────────────────────────────────────────────────────────────
-- Reatribui 16 manobras de agosto/2026 da Taiba para a Fortim
--
-- SUSPEITA DA GESTAO (11/09/2026): entre 19 e 25/08 a Fortim estava baseada em
-- Mucuripe e nao registrou manobra nenhuma, enquanto a Taiba registrou 18 ali.
-- Hipotese: a Taiba ficou marcada como titular e as contagens foram para ela.
--
-- CONFIRMADO PELO AIS. Para cada uma das 18 manobras foi verificado, numa
-- janela de +-1 h, o que a Fortim estava fazendo:
--
--   · saiu da base (posicoes fora de qualquer cerca)
--   · em regime de manobra (SOG maximo entre 12,3 e 18,5 nos)
--   · afastamento maximo de Mucuripe entre 2,5 e 10,9 km
--
-- CALIBRACAO, para o criterio nao ser palpite: nas 30 manobras da Flexeiras no
-- mesmo periodo — casos que ninguem contesta — a lancha esteve no maximo a
-- 6,1 km da base do porto declarado, mediana 0,9 km. O envelope das 16 abaixo
-- e compativel; nenhuma passa de 11 km.
--
-- DUAS FORAM EXCLUIDAS de proposito:
--   44540 (25/08 13:30) e 44563 (25/08 14:30) — a Fortim estava a 42 km de
--   Mucuripe, na travessia para o Pecem (faina 520, 12:35 as 14:11 UTC).
--   Essas duas NAO sao dela.
--
-- FUSO: manobras, fainas e AIS estao todos em UTC e alinham direto. Verificado
-- na faina 519: declara inicio 14:21 e o AIS marca o primeiro SOG>=10 no as
-- 14:21:33. Nao ha defasagem — nao aplique deslocamento.
--
-- O sync NAO desfaz isto: `sync-manobras` usa ignoreDuplicates, entao em
-- conflito de cd_manobra ele pula em vez de sobrescrever. A correcao e estavel.
-- ⚠️ Pelo mesmo motivo, corrigir no WebPilot NAO chegaria ao FleetIQ sozinho.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 0 — ver o estado atual (nao altera nada) ───────────────────────────
SELECT cd_manobra, ds_lancha, dh_manobra, ds_porto
  FROM public.manobras_lanchas
 WHERE cd_manobra IN (44499,44520,44523,44526,44533,44534,44539,44542,
                      44543,44544,44546,44551,44555,44559,44561,44562)
 ORDER BY dh_manobra;
-- Esperado: 16 linhas, todas TAIBA III / Mucuripe.

-- ── PASSO 1 — reatribuir ─────────────────────────────────────────────────────
UPDATE public.manobras_lanchas
   SET cd_lancha = 1003,
       ds_lancha = 'FORTIM'
 WHERE cd_manobra IN (44499,44520,44523,44526,44533,44534,44539,44542,
                      44543,44544,44546,44551,44555,44559,44561,44562)
   AND cd_lancha = 117;   -- trava: so mexe no que ainda esta como Taiba

-- ── PASSO 2 — conferir ───────────────────────────────────────────────────────
-- Agosto/2026 por lancha. Antes: Flexeiras 90, Fortim 90, Taiba 20.
-- Depois:                        Flexeiras 90, Fortim 106, Taiba 4.
--
--   SELECT ds_lancha, count(*)
--     FROM public.manobras_lanchas
--    WHERE dh_manobra >= '2026-08-01' AND dh_manobra < '2026-09-01'
--    GROUP BY 1 ORDER BY 1;
--
-- E as duas que ficaram com a Taiba na janela devem ser 44540 e 44563:
--
--   SELECT cd_manobra, dh_manobra, ds_porto
--     FROM public.manobras_lanchas
--    WHERE cd_lancha = 117
--      AND dh_manobra >= '2026-08-19' AND dh_manobra < '2026-08-26'
--    ORDER BY dh_manobra;

-- ── EFEITO NO REPORT DE AGOSTO ───────────────────────────────────────────────
-- A participacao da Taiba cai de 10,0 % para 2,0 % — passa a ser o menor mes da
-- serie, nao o segundo maior. A da Fortim sobe de 45 % para 53 %. O paragrafo
-- sobre a reserva ter sido acionada deixa de valer e precisa ser reescrito.
