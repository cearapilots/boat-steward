-- ─────────────────────────────────────────────────────────────────────────────
-- Duas pendências apontadas pelo briefing de 29/09/2026
--
--   1. Leitura do gerador da Flexeiras em 21/09 ficou velha (o "recuo de 10 h")
--   2. `configuracoes` guarda dois registros contraditórios da mesma correção
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ 1. O gerador da Flexeiras não andou para trás ════════════════════════════
--
-- O briefing perguntou "qual das duas leituras do Gerador 3 é a boa?". Nenhuma
-- das duas está em disputa: a de 21/09 JA FOI CORRIGIDA no WebPilot, e a nossa
-- copia e que ficou velha.
--
--     WebPilot hoje    21/09 → 7505 (dif 1)    25/09 → 7508 (dif 3)
--     Nosso banco      21/09 → 7518 (dif 14)   25/09 → 7508 (dif 3)
--
-- Com 7505, a serie e monotonica: 7504 → 7505 → 7508. Com 7518, ela sobe 14 h
-- em cinco dias e depois recua 10 — impossivel para um horimetro.
--
-- O `dc_dif_gerador` da propria linha de 25/09 ja denunciava: diz 3, o que so
-- fecha partindo de 7505. Partindo de 7518 teria de dizer -10.
--
-- ⚠️ CAUSA, E ELA SE REPETE: `sync-indicadores` faz upsert com
--    `ignoreDuplicates: true` sobre `cd_ativo_indicador`. Uma vez inserida, a
--    linha nunca mais e atualizada — correcao feita no WebPilot nao chega aqui.
--    E o mesmo defeito que ja apareceu em `abastecimentos_combustivel` (o
--    lancamento de oleo da Vibra, 16/09) e em `ocorrencias_webpilot` (a
--    ocorrencia 7135 cancelada, resolvida em 22/09 trocando o upsert por
--    insert-ou-update).
--
--    Este script conserta UMA linha. O defeito de fundo continua: enquanto o
--    sync ignorar conflito, toda correcao no WebPilot exige remocao a mao.
--
-- A remocao e segura porque o endpoint ainda devolve o registro 3215 — ele esta
-- dentro da janela de ~30 dias. Apagar e ressincronizar traz a versao corrigida
-- com TODOS os campos, nao so o do gerador.

DELETE FROM public.indicadores_ativos
 WHERE cd_ativo_indicador = 3215
   AND dc_horimetro_gerador = 7518;   -- trava: se ja veio corrigida, nao apaga

-- Depois de rodar isto, execute o sync-indicadores para trazer a versao boa.


-- ═══ 2. Os dois registros da correção de fuso ═════════════════════════════════
--
-- O briefing apontou, com razao, que `configuracoes` guarda dois registros que
-- se contradizem sobre a mesma correcao:
--
--   correcao_fuso_manobras_lote_20260609     "3h recuadas"
--   correcao_fuso_manobras_lote_20260609_v2  "ajuste de 06:00:00"
--
-- Nao sao duas correcoes: sao duas TENTATIVAS. A primeira aplicou -3 h com o
-- sinal invertido; a segunda aplicou +6 h, desfazendo o engano e colocando as
-- +3 h corretas. O estado final esta certo (sentinela 43549 em 11:30 UTC), mas
-- quem lesse so o primeiro registro concluiria o oposto do que aconteceu.
--
-- Mantenho as duas chaves em vez de apagar a primeira: ela e o unico vestigio
-- de que houve um erro de sinal, e o script de correcao ainda a consulta para
-- decidir o ajuste. O que muda e a descricao, que passa a dizer o que de fato
-- foi essa linha.

UPDATE public.configuracoes
   SET valor = 'revertida',
       descricao = 'NAO E UMA CORRECAO VALIDA. Tentativa de 22/09/2026 que aplicou -3h '
                || 'nas manobras do lote de 09/06 com o SINAL INVERTIDO. Foi desfeita no '
                || 'mesmo dia pela chave _v2, que aplicou +6h (desfez as -3h e colocou as '
                || '+3h corretas). Mantida so como registro de que o erro existiu e como '
                || 'trava do script corrige_fuso_manobras_importadas.sql. '
                || 'O estado correto e o descrito em correcao_fuso_manobras_lote_20260609_v2.',
       updated_at = now()
 WHERE chave = 'correcao_fuso_manobras_lote_20260609';

UPDATE public.configuracoes
   SET descricao = 'CORRECAO VALIDA E DEFINITIVA. 15.147 manobras do lote importado em '
                || '09/06/2026 tiveram o fuso corrigido em 22/09/2026. A importacao gravou '
                || 'hora local de Fortaleza como se fosse UTC, deixando dh_manobra 3h '
                || 'atrasado. O ajuste aplicado foi de +6h porque desfez tambem as -3h de '
                || 'uma tentativa anterior com sinal invertido. Conferido contra '
                || 'fainas_deslocamentos e contra as saidas do AIS; sentinela cd_manobra '
                || '43549 deve estar em 2026-04-01 11:30 UTC. NAO rodar de novo.',
       updated_at = now()
 WHERE chave = 'correcao_fuso_manobras_lote_20260609_v2';


-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) A linha velha saiu (deve voltar pelo sync, ja corrigida):
-- SELECT cd_ativo_indicador, dh_leitura, dc_horimetro_gerador, dc_dif_gerador
--   FROM public.indicadores_ativos
--  WHERE ds_lancha = 'FLEXEIRAS' AND dh_leitura >= '2026-09-14'
--  ORDER BY dh_leitura;
--    ESPERADO depois do sync: 7499 → 7504 → 7504 → 7505 → 7508, sempre subindo.

-- 2) Os registros de configuracao nao se contradizem mais:
-- SELECT chave, valor, left(descricao, 80) FROM public.configuracoes
--  WHERE chave LIKE 'correcao_fuso_manobras%';
