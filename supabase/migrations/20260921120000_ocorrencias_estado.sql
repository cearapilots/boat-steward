-- ─────────────────────────────────────────────────────────────────────────────
-- Estado da ocorrencia no WebPilot + remocao das canceladas
--
-- CONTEXTO: ocorrencias canceladas continuavam chegando pelo endpoint sem
-- nenhum indicativo, e ficavam no FleetIQ como se estivessem abertas. A 7135
-- (Fortim, 09/09) aparecia no dashboard com data_fim nula.
--
-- Pedimos ao WebPilot que sinalizasse o cancelamento em vez de parar de mandar
-- o registro — porque o sync so age sobre o que recebe: se a ocorrencia
-- simplesmente sumisse do endpoint, a copia daqui ficaria para sempre. Em
-- 21/09/2026 os campos CD_ESTADO e DS_ESTADO passaram a vir:
--
--   134  Em Aberto
--   280  Ciente
--   135  Finalizada
--   174  Finalizada Automaticamente
--   133  Cancelada
--
-- DECISAO: cancelada e apagada, nao marcada. Cancelada significa que o evento
-- nao aconteceu — mante-la exigiria filtro em cada consumidor (views
-- analiticas, dashboard, Historico, a Skill), e bastaria esquecer um para o
-- numero sair errado. Os demais estados ficam gravados, porque distinguem
-- coisas uteis: "Ciente" nao e "Em Aberto", e "Finalizada Automaticamente"
-- merece leitura mais cautelosa que "Finalizada".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 — colunas de estado ──────────────────────────────────────────────
ALTER TABLE public.ocorrencias_webpilot
  ADD COLUMN IF NOT EXISTS cd_estado integer,
  ADD COLUMN IF NOT EXISTS ds_estado text;

COMMENT ON COLUMN public.ocorrencias_webpilot.cd_estado IS
  'Estado no WebPilot: 134 Em Aberto, 280 Ciente, 135 Finalizada, 174 Finalizada Automaticamente. 133 (Cancelada) nao e gravado — o sync apaga a linha.';

-- ── PASSO 2 — apagar a cancelada que ja estava no banco ──────────────────────
-- A trava de origem existe para nunca alcancar registro lancado a mao.
DELETE FROM public.ocorrencias_webpilot
 WHERE cd_ocorrencia = 7135
   AND origem = 'webpilot_sync';

-- ⚠️ LIMITE CONHECIDO: o endpoint devolve ~30 dias. Ocorrencia cancelada antes
-- disso esta no banco sem nenhuma forma de detectar — os campos de estado sao
-- novos e nao valem para tras. Daqui para frente o sync resolve sozinho; o
-- passivo anterior, se houver, so sai a mao.

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.ocorrencias_webpilot WHERE cd_ocorrencia = 7135;
--   -- esperado: 0
--
-- Depois do proximo sync, os estados devem aparecer:
--   SELECT ds_estado, count(*) FROM public.ocorrencias_webpilot
--    WHERE data_inicio >= now() - interval '30 days'
--    GROUP BY 1 ORDER BY 2 DESC;
