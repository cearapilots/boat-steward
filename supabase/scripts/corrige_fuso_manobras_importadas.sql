-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige o fuso de 15.147 manobras importadas em 09/06/2026
--
-- ⚠️ ESTE ARQUIVO JA FOI RODADO UMA VEZ COM O SINAL INVERTIDO, em 22/09/2026.
--    A versao abaixo detecta esse estado e conserta. Pode rodar sem medo, em
--    qualquer um dos tres estados possiveis do banco — ver PASSO 2.
--
-- ─── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- A importacao em massa de 09/06/2026 (15.147 manobras, de 2019-11 a 2026-06)
-- leu horarios LOCAIS de Fortaleza e os gravou como se fossem UTC, sem
-- converter. Resultado: `dh_manobra` ficou 3 horas ATRASADO. A correcao e
-- SOMAR 3 horas.
--
-- E o mesmo passo que o script de carga do AIS faz de proposito, com
-- `("DH_POSICAO" || '-03:00')::timestamptz`, e que a importacao de manobras
-- pulou. Tudo que entrou pelo sync diario esta correto.
--
-- Exemplo, manobra 43549 (FORTIM, Pecem):
--     importada como  2026-04-01 08:30 UTC  =  05:30 local   ← errado
--     deveria ser     2026-04-01 11:30 UTC  =  08:30 local
--
-- ─── COMO SE SABE QUE SAO AS MANOBRAS, E NAO O AIS ───────────────────────────
--
-- Comparar AIS com manobras so diz que os dois discordam, nunca qual esta
-- certo. Foi preciso uma TERCEIRA fonte.
--
-- 1. FAINAS DE DESLOCAMENTO (itFainas, endpoint distinto do de manobras). Cada
--    faina tem inicio e fim de uma travessia Mucuripe <-> Pecem. Contra as
--    travessias que o AIS detecta sozinho:
--
--       ate 2026-05-03   93 fainas   +0h =  98%   +3h = 32%
--       de 2026-05-04    28 fainas   +0h = 100%   +3h = 11%
--
--    O AIS concorda com as fainas nas DUAS epocas. Logo o AIS esta certo.
--
-- 2. O `created_at` das manobras separa os lotes, e o veredito acompanha o
--    LOTE, nao a data da manobra:
--
--       importacao de 2026-06-09   15.147 registros   +0h = 38%   +3h = 95%
--       syncs diarios                 852 registros   +0h = 99%   +3h = 48%
--
--    Aberto mes a mes, todo mes do lote de 09/06 da deslocado. Nenhum outro.
--
-- 3. Em agosto/2026 — coberto so por sync diario — as 91 manobras da Flexeiras
--    e as 105 da Fortim ja casavam com as saidas do AIS sem deslocamento algum.
--
-- ─── O DEFEITO E SO NOSSO. O WEBPILOT ESTA CERTO ─────────────────────────────
--
-- Verificado em 22/09/2026 direto no endpoint itManobras, depois de uma
-- afirmacao ERRADA de que "os registros seguem errados no WebPilot":
--
--   · O endpoint devolve UTC EXPLICITO, com sufixo Z:
--         {"CD_MANOBRA": 44550, "DH_MANOBRA": "2026-08-23T18:30:00Z", ...}
--     Nao ha ambiguidade nenhuma no que eles entregam.
--
--   · `sync-manobras` grava o valor verbatim: `dh_manobra: m.DH_MANOBRA`.
--     Nao existe conversao de fuso em lugar nenhum do caminho ao vivo.
--
--   · Endpoint e banco batem caractere por caractere nos registros vindos do
--     sync diario.
--
-- Logo o desvio nasceu DENTRO da importacao de 09/06/2026 — que nao e nenhuma
-- das Edge Functions deste repositorio — e nada aqui autoriza qualquer
-- conclusao sobre o que o WebPilot armazena ou exibe.
--
-- ⚠️ A LICAO: "a nossa importacao estava torta" e uma frase sobre o NOSSO
--    pipeline. Dela nao se deduz nada sobre o sistema de origem. Afirmar
--    defeito em sistema de terceiro exige olhar o sistema de terceiro.
--
-- ─── ERRO DE SINAL, E COMO EVITA-LO ──────────────────────────────────────────
--
-- Na primeira tentativa este script rodou com `- interval '3 hours'`. O teste
-- dizia que `dh_manobra + 3h` casava com a janela do AIS — ou seja, o valor
-- GRAVADO esta atrasado e precisa CRESCER. Subtrair afastou mais 3 horas: o
-- pico de casamento saiu de +3h e foi para +6h.
--
-- A regra, para a proxima vez: se o teste casa somando X ao campo, a correcao
-- e SOMAR X ao campo. Nao inverter "porque o dado esta adiantado" — ele nao
-- estava. E a verificacao 1 la embaixo existe para pegar isso: se a taxa de
-- `sem_registro` nao cair, a direcao esta errada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 — onde o banco esta agora ────────────────────────────────────────
SELECT cd_manobra, ds_lancha, dh_manobra,
       (dh_manobra AT TIME ZONE 'America/Fortaleza') AS hora_local
  FROM public.manobras_lanchas
 WHERE cd_manobra = 43549;
--   08:30 UTC  -> nada foi aplicado ainda
--   05:30 UTC  -> a versao com sinal invertido foi aplicada
--   11:30 UTC  -> ja esta correto, nada a fazer

SELECT chave, valor, updated_at FROM public.configuracoes
 WHERE chave LIKE 'correcao_fuso_manobras%';

-- ── PASSO 2 — a correcao, cobrindo os tres estados ───────────────────────────
DO $$
DECLARE
  tem_v1   boolean;   -- a versao com sinal invertido ja rodou (-3h aplicadas)
  tem_v2   boolean;   -- a correcao definitiva ja rodou
  ajuste   interval;
  afetadas integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.configuracoes
                  WHERE chave = 'correcao_fuso_manobras_lote_20260609')
    INTO tem_v1;
  SELECT EXISTS (SELECT 1 FROM public.configuracoes
                  WHERE chave = 'correcao_fuso_manobras_lote_20260609_v2')
    INTO tem_v2;

  IF tem_v2 THEN
    RAISE NOTICE 'Correcao definitiva ja aplicada. Nada a fazer.';
    RETURN;
  ELSIF tem_v1 THEN
    -- Desfaz as 3 h subtraidas por engano E aplica as 3 h corretas.
    ajuste := interval '6 hours';
    RAISE NOTICE 'Estado: versao com sinal invertido detectada. Aplicando +6h.';
  ELSE
    ajuste := interval '3 hours';
    RAISE NOTICE 'Estado: nada aplicado ainda. Aplicando +3h.';
  END IF;

  UPDATE public.manobras_lanchas
     SET dh_manobra = dh_manobra + ajuste
   WHERE created_at >= '2026-06-09'
     AND created_at <  '2026-06-10';

  GET DIAGNOSTICS afetadas = ROW_COUNT;

  INSERT INTO public.configuracoes (chave, valor, descricao)
  VALUES ('correcao_fuso_manobras_lote_20260609_v2',
          afetadas::text,
          'Lote de manobras importado em 09/06/2026 teve o fuso corrigido em 22/09/2026 (ajuste de ' ||
          ajuste::text || '). A importacao gravou hora local como se fosse UTC. Confirmado contra ' ||
          'fainas_deslocamentos e contra as saidas do AIS. NAO rodar de novo.');

  RAISE NOTICE 'Ajustadas % manobras em %.', afetadas, ajuste;
END $$;

-- ── PASSO 3 — a sentinela tem que estar em 11:30 UTC / 08:30 local ───────────
SELECT cd_manobra, ds_lancha, dh_manobra,
       (dh_manobra AT TIME ZONE 'America/Fortaleza') AS hora_local
  FROM public.manobras_lanchas
 WHERE cd_manobra = 43549;

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) A PROVA. `sem_registro` era 51% do acumulado enquanto agosto/2026 — o
--    periodo que nunca esteve torto — mostrava 17% sozinho.
--    ESPERADO: o acumulado cair para perto de 17%.
--    SE NAO CAIR: a direcao esta errada de novo; pare e reavalie.
--
-- SELECT motivo, count(*) AS saidas
--   FROM public.v_ais_saida_motivo
--  WHERE NOT curta_e_perto
--  GROUP BY 1 ORDER BY 2 DESC;

-- 2) MES A MES. O historico tem que encostar no patamar do periodo recente.
--    Antes da correcao: 2025 e inicio de 2026 entre 35% e 71%; de maio/2026 em
--    diante entre 10% e 22%.
--
-- SELECT to_char(dia_inicio, 'YYYY-MM') AS mes,
--        count(*) AS saidas,
--        count(*) FILTER (WHERE motivo = 'sem_registro') AS sem_registro,
--        round(100.0 * count(*) FILTER (WHERE motivo = 'sem_registro') / count(*)) AS pct
--   FROM public.v_ais_saida_motivo
--  WHERE NOT curta_e_perto
--  GROUP BY 1 ORDER BY 1;

-- 3) AGOSTO/2026 NAO PODE TER MUDADO — aquele periodo veio por sync diario e
--    esta fora do lote. ESPERADO: FLEXEIRAS 91, FORTIM 105, TAIBA III 4.
--
-- SELECT ds_lancha, count(*) AS manobras
--   FROM public.manobras_lanchas
--  WHERE dh_manobra >= '2026-08-01T03:00:00Z'
--    AND dh_manobra <  '2026-09-01T03:00:00Z'
--  GROUP BY 1 ORDER BY 1;

-- 4) A TRAVA FUNCIONA? Rode o bloco DO de novo: tem que dizer "Correcao
--    definitiva ja aplicada" e nao tocar em nada.
