-- =====================================================================
-- Dois itens do §17.2 do Context Pack que ainda estavam abertos.
--
-- 1. v_lancha_dim  (§8.3 item 1 — "a mais importante" das views propostas)
--    Hoje a ponte UUID <-> cd_lancha é um mapa literal repetido em vários
--    arquivos do frontend E precisa ser recarregado na Skill. Uma view
--    resolve para os dois consumidores.
--
-- 2. ocorrencias_webpilot.updated_at  (§17.2 item 6)
--    Permite sync incremental e auditoria de quando o WebPilot fechou um
--    evento. Hoje só existe created_at, então não há como saber se uma
--    ocorrência foi alterada depois de inserida — e o sync-ocorrencias
--    faz UPDATE parcial (data_fim, duracao_horas, efeito) em conflito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. v_lancha_dim — dimensão de identidade
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_lancha_dim AS
SELECT
  l.id                     AS lancha_uuid,
  l.nome                   AS lancha_nome,
  l.id_webpilot::integer   AS cd_lancha,
  l.id_webpilot            AS id_webpilot_texto,
  l.horimetro,
  l.horimetro_gerador,
  l.ultima_atualizacao
FROM lanchas l
WHERE l.id_webpilot IS NOT NULL;

COMMENT ON VIEW public.v_lancha_dim IS
  'Ponte de identidade entre os dois mundos: lancha_uuid (tabelas próprias do '
  'FleetIQ) e cd_lancha (tabelas espelhadas do WebPilot). Não existe FK entre '
  'eles; use esta view em vez de replicar o mapa em código.';

GRANT SELECT ON public.v_lancha_dim TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. updated_at em ocorrencias_webpilot
-- ---------------------------------------------------------------------
ALTER TABLE public.ocorrencias_webpilot
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill: linhas existentes nunca foram alteradas até onde se sabe,
-- então updated_at = created_at é a leitura honesta. NÃO usar now(),
-- que faria parecer que tudo foi tocado hoje.
UPDATE public.ocorrencias_webpilot
   SET updated_at = created_at
 WHERE updated_at IS NULL;

ALTER TABLE public.ocorrencias_webpilot
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ocorrencias_updated_at ON public.ocorrencias_webpilot;
CREATE TRIGGER trg_ocorrencias_updated_at
  BEFORE UPDATE ON public.ocorrencias_webpilot
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.ocorrencias_webpilot.updated_at IS
  'Atualizado por trigger a cada UPDATE. Linhas anteriores a 27/08/2026 '
  'receberam created_at no backfill — updated_at > created_at só a partir daí.';

-- ---------------------------------------------------------------------
-- 3. Colunas mortas de historico — NÃO EXECUTADO, deliberadamente
-- ---------------------------------------------------------------------
-- Medição em 27/08/2026 (195 linhas):
--     data_fim                  0/195   morta
--     duracao_horas             0/195   morta
--     efeito                    0/195   morta
--     tipo_ocorrencia_webpilot  0/195   morta
--     data_inicio             186/195   VIVA — lida em HistoricoDetalheModal.tsx:181
--
-- As 4 mortas poderiam ser removidas, mas DROP COLUMN é irreversível e o
-- ganho é apenas cosmético. Se alguma rotina ainda escreve nelas, o INSERT
-- quebra. Fica registrado, não aplicado:
--
--   ALTER TABLE public.historico
--     DROP COLUMN data_fim,
--     DROP COLUMN duracao_horas,
--     DROP COLUMN efeito,
--     DROP COLUMN tipo_ocorrencia_webpilot;
--
-- ATENÇÃO: NÃO remover data_inicio. O Context Pack §2.8 afirma que ela não
-- é lida por nenhum código — está errado.
