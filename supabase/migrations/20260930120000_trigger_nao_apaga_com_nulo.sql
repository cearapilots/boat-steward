-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: sobrescrever sim, apagar com nulo não
--
-- ─── O PROBLEMA, EM DOIS LADOS ───────────────────────────────────────────────
--
-- Os syncs foram todos escritos com `ignoreDuplicates: true`. O efeito e sempre
-- o mesmo: uma vez inserida, a linha nunca mais e atualizada, entao correcao
-- feita no WebPilot NAO chega ao FleetIQ. Ja aconteceu quatro vezes —
-- abastecimentos (16/09), ocorrencias (22/09), indicadores (29/09) e fainas
-- (30/09). Ver Apendice C.8 do Context Pack.
--
-- A correcao obvia e sobrescrever no conflito. Mas ela cria um perigo pior, e
-- nao e hipotetico:
--
-- ⚠️ EM 29/09/2026 O WEBPILOT REESCREVEU O ENDPOINT DE MANOBRAS E O CAMPO
--    `DS_PORTO` SUMIU DO PAYLOAD. Se a `sync-manobras` estivesse sobrescrevendo,
--    o sync das 09:25 de 30/09 teria gravado NULO em `ds_porto` nas 16.115
--    linhas da tabela. Sem erro, sem alerta — a coluna simplesmente esvaziava,
--    e com ela a analise Pecem x Mucuripe inteira.
--
--    Foi o defeito que nos salvou do defeito. So a manobra nova do dia entrou
--    sem porto.
--
-- ─── A SOLUCAO ───────────────────────────────────────────────────────────────
--
-- Sobrescrever, MAS NUNCA gravar nulo por cima de valor preenchido. Campo a
-- campo, se o novo e nulo e o antigo nao e, mantem o antigo.
--
-- Por que trigger e nao logica em cada Edge Function:
--
--   · e UM codigo para todas as tabelas, em vez de nove
--   · fica INERTE enquanto o sync ainda ignora duplicata — da para instalar
--     hoje e virar as chaves depois, uma por vez
--   · NAO DA PARA ESQUECER num sync novo, que e exatamente como este defeito
--     se espalhou por nove funcoes
--   · o `.upsert()` do supabase-js nao consegue expressar COALESCE
--
-- ⚠️ CUSTO ACEITO: se a origem um dia LEGITIMAMENTE esvaziar um campo, nao
--    acompanhamos. E barato perto de perder uma coluna inteira. Se algum campo
--    precisar aceitar nulo vindo da origem, trate no sync daquele endpoint, com
--    UPDATE explicito — nao afrouxe este trigger.
--
-- ⚠️ NAO USAR EM `posicoes_ais`. Posicao num instante e fato imutavel: a origem
--    nunca "corrige" a posicao das 14:32. O `ignoreDuplicates` ali esta certo, e
--    rodar trigger em 728 mil linhas por dia custaria caro para ganhar nada.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nao_apaga_com_nulo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  novo   jsonb := to_jsonb(NEW);
  antigo jsonb := to_jsonb(OLD);
  campo  text;
BEGIN
  -- Linha corrigida a mão não é tocada pelo sync. Só vale onde a tabela tem a
  -- coluna `origem`; hoje é o caso de `manutencoes`.
  IF antigo ? 'origem' AND antigo ->> 'origem' = 'manual' THEN
    RETURN OLD;
  END IF;

  FOR campo IN SELECT jsonb_object_keys(antigo) LOOP
    -- jsonb representa NULL do SQL como 'null'::jsonb
    IF  (novo   -> campo) = 'null'::jsonb
    AND (antigo -> campo) <> 'null'::jsonb THEN
      novo := jsonb_set(novo, ARRAY[campo], antigo -> campo);
    END IF;
  END LOOP;

  RETURN jsonb_populate_record(NEW, novo);
END;
$$;

COMMENT ON FUNCTION public.nao_apaga_com_nulo() IS
  'BEFORE UPDATE generico: impede que um sync grave NULL por cima de valor ja '
  'preenchido, e ignora linhas com origem = manual. Existe porque em 29/09/2026 '
  'o campo DS_PORTO sumiu do endpoint de manobras — com sobrescrita simples, o '
  'sync teria esvaziado a coluna nas 16 mil linhas. NAO aplicar em posicoes_ais.';


-- ═══ Aplicado nas tabelas que os syncs sobrescrevem ═════════════════════════
-- `manobras_lanchas` entra agora de proposito, ANTES de virar a chave dela:
-- assim, quando o DS_PORTO voltar e o sync passar a sobrescrever, a protecao ja
-- esta de pe.

DROP TRIGGER IF EXISTS trg_nao_apaga_com_nulo ON public.abastecimentos_combustivel;
CREATE TRIGGER trg_nao_apaga_com_nulo
  BEFORE UPDATE ON public.abastecimentos_combustivel
  FOR EACH ROW EXECUTE FUNCTION public.nao_apaga_com_nulo();

DROP TRIGGER IF EXISTS trg_nao_apaga_com_nulo ON public.indicadores_ativos;
CREATE TRIGGER trg_nao_apaga_com_nulo
  BEFORE UPDATE ON public.indicadores_ativos
  FOR EACH ROW EXECUTE FUNCTION public.nao_apaga_com_nulo();

DROP TRIGGER IF EXISTS trg_nao_apaga_com_nulo ON public.manobras_lanchas;
CREATE TRIGGER trg_nao_apaga_com_nulo
  BEFORE UPDATE ON public.manobras_lanchas
  FOR EACH ROW EXECUTE FUNCTION public.nao_apaga_com_nulo();

DROP TRIGGER IF EXISTS trg_nao_apaga_com_nulo ON public.fainas_deslocamentos;
CREATE TRIGGER trg_nao_apaga_com_nulo
  BEFORE UPDATE ON public.fainas_deslocamentos
  FOR EACH ROW EXECUTE FUNCTION public.nao_apaga_com_nulo();

DROP TRIGGER IF EXISTS trg_nao_apaga_com_nulo ON public.manutencoes;
CREATE TRIGGER trg_nao_apaga_com_nulo
  BEFORE UPDATE ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.nao_apaga_com_nulo();

DROP TRIGGER IF EXISTS trg_nao_apaga_com_nulo ON public.vencimentos;
CREATE TRIGGER trg_nao_apaga_com_nulo
  BEFORE UPDATE ON public.vencimentos
  FOR EACH ROW EXECUTE FUNCTION public.nao_apaga_com_nulo();


-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────
--
-- 1) Onde o trigger esta instalado (esperado: as 6 tabelas acima, e NENHUMA
--    linha para posicoes_ais):
--
-- SELECT c.relname AS tabela, t.tgname
--   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--  WHERE t.tgname = 'trg_nao_apaga_com_nulo' ORDER BY 1;
--
-- 2) A protecao funciona. Roda em transacao e desfaz — nao altera nada:
--
-- BEGIN;
--   UPDATE public.manobras_lanchas SET ds_porto = NULL WHERE cd_manobra = 44811;
--   SELECT cd_manobra, ds_porto FROM public.manobras_lanchas WHERE cd_manobra = 44811;
--   -- ESPERADO: ds_porto continua 'Mucuripe'. O nulo foi recusado.
-- ROLLBACK;
--
-- 3) E sobrescrita com valor de verdade continua passando:
--
-- BEGIN;
--   UPDATE public.manobras_lanchas SET ds_porto = 'TESTE' WHERE cd_manobra = 44811;
--   SELECT cd_manobra, ds_porto FROM public.manobras_lanchas WHERE cd_manobra = 44811;
--   -- ESPERADO: 'TESTE'. O trigger so barra nulo, nao congela a linha.
-- ROLLBACK;
