-- ─────────────────────────────────────────────────────────────────────────────
-- 05/11/2026 — a renovação da agulha da Fortim, que o sync não registrou
--
-- A agulha da Fortim vencia em 07/11/2026 e foi renovada antes disso: o WebPilot
-- passou a devolver 03/11/2027. O `sync-vencimentos` só gravava a renovação em
-- `vencimentos_historico` quando a data antiga JÁ tinha passado, então não
-- gravou nada. Sem a linha, o calendário de 2026 perdeu a agulha de novembro em
-- vez de mostrá-la com o verde de "feito", como a balsa da Flexeiras em setembro.
-- A função foi corrigida no mesmo dia para registrar também a renovação feita
-- perto de vencer.
--
-- `dt_detectado`: em 04/11 às 11:30 UTC o banco ainda tinha 07/11/2026; o sync
-- seguinte que a viu mudada rodou em 04/11 (13:55 ou 17:23 UTC) ou em 05/11
-- (09:35 UTC). O log não diz qual. Fica 04/11, o primeiro dia possível.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.vencimentos_historico
  (cd_lancha, ds_lancha, tipo, tipo_label, dt_vencimento, dt_detectado)
SELECT 1003, 'FORTIM', 'agulha', 'Agulha', DATE '2026-11-07', DATE '2026-11-04'
 WHERE NOT EXISTS (
         SELECT 1 FROM public.vencimentos_historico
          WHERE cd_lancha = 1003
            AND tipo = 'agulha'
            AND dt_vencimento = DATE '2026-11-07');

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
-- SELECT ds_lancha, tipo_label, dt_vencimento, dt_detectado
--   FROM public.vencimentos_historico ORDER BY dt_vencimento;
--    ESPERADO: 5 linhas, a última FORTIM Agulha 2026-11-07 / 2026-11-04.
