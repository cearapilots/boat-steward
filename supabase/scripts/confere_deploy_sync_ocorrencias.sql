-- ─────────────────────────────────────────────────────────────────────────────
-- Confere se a sync-ocorrencias publicada e a versao nova
--
-- Rode DEPOIS de publicar a funcao E de executar o sync uma vez.
--
-- Este teste existe porque o sintoma de "nao publicada" e silencioso: a versao
-- antiga tambem roda, tambem atualiza `updated_at`, e tambem nao da erro. Em
-- 22/09/2026 a funcao foi dada como publicada e nao estava — so uma consulta ao
-- proprio WebPilot resolveu a duvida.
--
-- Os dois numeros abaixo NAO podem ser forjados pela versao antiga: ela nao
-- conhece as colunas de estado e preserva a descricao em conflito.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── TESTE 1 — as colunas de estado sao escritas ──────────────────────────────
-- O endpoint devolve ~21 ocorrencias (janela de ~30 dias), 20 'Finalizada'
-- (CD_ESTADO 135) e a cancelada. Depois do sync novo, as finalizadas da janela
-- tem que aparecer aqui.
--
-- ESPERADO: pelo menos 20 linhas com cd_estado = 135.
-- SE VIER 0: a funcao publicada ainda e a antiga.
SELECT ds_estado, cd_estado, count(*) AS ocorrencias
  FROM public.ocorrencias_webpilot
 WHERE cd_estado IS NOT NULL
 GROUP BY 1, 2
 ORDER BY 3 DESC;

-- ── TESTE 2 — a cancelada saiu ───────────────────────────────────────────────
-- ESPERADO: 0 linhas.
-- A 7135 (FORTIM, "Limpeza no sistema de ar condicionado", aberta 09/09) chega
-- do WebPilot com CD_ESTADO 133 / DS_ESTADO 'Cancelada'. A versao nova apaga;
-- a antiga reinsere todo dia as 09:10.
SELECT cd_ocorrencia, tipo_ocorrencia, data_inicio, data_fim, cd_estado, ds_estado
  FROM public.ocorrencias_webpilot
 WHERE cd_ocorrencia = 7135;

-- ── TESTE 3 — a descricao passou a ser sobrescrita ───────────────────────────
-- A 7130 tem 1.513 caracteres no WebPilot e 107 no banco enquanto a versao
-- antiga estiver no ar (ela preserva a descricao em conflito, de proposito, e
-- foi isso que mudou em 11/09).
--
-- ESPERADO: 1513 (ou mais, se a gestao seguir enriquecendo o relato).
-- SE VIER 107: a funcao publicada ainda e a antiga.
SELECT cd_ocorrencia,
       length(descricao) AS tamanho_descricao,
       updated_at
  FROM public.ocorrencias_webpilot
 WHERE cd_ocorrencia = 7130;

-- ─────────────────────────────────────────────────────────────────────────────
-- SE OS TRES TESTES PASSAREM, o assunto esta encerrado: a cancelada nao volta,
-- porque o sync passa a apaga-la a cada rodada em vez de reinseri-la.
--
-- ⚠️ LIMITE CONHECIDO, que nenhum deploy resolve: o endpoint so devolve ~30
--    dias. Ocorrencia cancelada no WebPilot ANTES dessa janela esta no banco
--    sem nenhuma forma de detectar — os campos de estado sao novos e nao valem
--    para tras. Se aparecer outra ocorrencia velha sem data de fim na tela de
--    operacionais, o caminho e conferir a mao no WebPilot, nao esperar o sync.
-- ─────────────────────────────────────────────────────────────────────────────
