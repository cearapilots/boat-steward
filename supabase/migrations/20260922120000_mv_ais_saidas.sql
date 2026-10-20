-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_saidas — uma linha por SAIDA da base, com rota e tempo util
--
-- ARQUIVO 3 DE 3. Rode os dois anteriores antes:
--   1. 20260922100000_mv_ais_pos_classificada.sql
--   2. 20260922110000_mv_ais_base_dia.sql
--   3. este
--
-- SUBSTITUI a versao de 20260921200000_ais_buffer_base_50m.sql. Nao toca
-- PostGIS: le a classificacao ja pronta da camada 1.
--
-- E a camada que a gestao pediu sem saber o nome: noites consecutivas fora,
-- retorno curto entre saidas, e "saiu mas nao ha manobra registrada". Nenhuma
-- dessas perguntas se responde com media diaria.
--
-- ─── DEFINICAO DE SAIDA ──────────────────────────────────────────────────────
--
--     ... base, base, FORA, fora, fora, base, base ...
--                     ^inicio              ^fim
--
-- Comeca na primeira posicao fora, termina na primeira posicao de base
-- seguinte. Nao e escolha estetica: e o que faz a soma das duracoes bater com
-- `horas_fora` da diaria. Comecando na ultima posicao de base, cada saida
-- ganharia ate 3 min que a diaria contou como base, e as camadas discordariam.
--
-- ─── TRES COLUNAS QUE MUDAM COMO A VIEW SE USA ───────────────────────────────
--
-- `horas_movimento` e `horas_parada` abrem a duracao. Em agosto/2026 a Fortim
-- ficou 182,5 h parada FORA da base contra 94,1 h da Flexeiras, quase tudo num
-- ponto de espera do Pecem que nao esta cercado. Sem essa abertura, espera
-- entra no numero como se fosse operacao.
--
--   ⚠️ Para medir OPERACAO ou ATIVIDADE DA TRIPULACAO use `horas_movimento`,
--      nunca `duracao_h`. A nota de fadiga da gestao define atividade como
--      movimento: "sempre que estao em movimento, quer dizer que a tripulacao
--      esta em atividade".
--
-- `base_origem` e `base_destino` dizem de onde saiu e onde voltou, e
-- `travessia` marca quando sao diferentes. Destrava a estatistica de
-- deslocamento entre portos por sentido — e os sentidos sao mesmo distintos:
-- pelas fainas registradas, Mucuripe → Pecem tem mediana de 99 min e
-- Pecem → Mucuripe, 117 min.
--
-- ─── SAIDA COM BURACO DENTRO ─────────────────────────────────────────────────
--
-- Se o AIS silencia por mais de 30 min no meio de uma saida, a lancha pode ter
-- voltado e saido de novo sem que se veja. O episodio NAO e partido em dois:
-- isso inventaria uma volta a base que ninguem observou. Fica um episodio, com
-- o buraco declarado em `horas_nao_resolvidas` e `cobertura_pct`. Uma saida com
-- cobertura de 60% e uma saida com uma pergunta em aberto, nao um fato.
--
-- ─── CONTAGEM DE SAIDAS ──────────────────────────────────────────────────────
--
-- ⚠️ Para CONTAR saidas, filtre `NOT curta_e_perto`. Para SOMAR horas, NAO
--    filtre — essas horas ja estao na diaria, e retira-las quebraria a
--    conciliacao entre as camadas.
--
-- Sobram 2,4% de pares de saidas consecutivas separados por menos de 2 min na
-- base (eram 12,2% antes do raio de tolerancia de 50 m). Daria para junta-los,
-- mas a gestao pediu justamente "retorno curto entre saidas" — um merge
-- silencioso apagaria o fenomeno que se quer medir. Ficam declarados aqui.
-- ─────────────────────────────────────────────────────────────────────────────

-- Esta view varre as 709 mil posicoes com quatro janelas. Sobe o teto de
-- tempo da sessao antes de comecar; o padrao do editor derruba a execucao no
-- meio. Se ainda assim estourar, rode pelo CLI do Supabase, que nao tem o
-- limite do editor web.
SET statement_timeout = '15min';

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_saidas;

CREATE MATERIALIZED VIEW public.mv_ais_saidas AS
WITH par AS (
  SELECT 30 AS limiar_min, 1.0::double precision AS limiar_parada_kn
),
-- So as colunas usadas daqui para baixo. `SELECT c.*` arrastaria latitude,
-- longitude, COG e buffer por dentro de quatro ordenacoes de 709 mil linhas
-- sem que nada leia essas colunas.
marcado AS (
  SELECT c.cd_lancha,
         c.ds_lancha,
         c.dh_posicao,
         c.prox_t,
         c.na_base,
         c.cerca,
         c.sog_efetivo,
         c.dist_base_m,
         lag(c.na_base) OVER w AS ant_base,
         -- Momento da ultima base ANTES: quadro que so cresce, entao o Postgres
         -- mantem o maximo corrente. Custo linear.
         max(CASE WHEN c.na_base THEN c.dh_posicao END)
           OVER (PARTITION BY c.cd_lancha ORDER BY c.dh_posicao
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS t_base_ant,
         -- Momento da primeira base DEPOIS. Escrito ao contrario de proposito:
         -- ordenando DESC com quadro crescente, o resultado e identico a
         -- `ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING` em ordem
         -- crescente, mas o custo cai de O(n²) para O(n log n).
         --
         -- ⚠️ NAO "simplifique" isto de volta para o quadro adiante. min() e
         --    max() nao tem funcao de transicao inversa: com o INICIO do quadro
         --    se movendo, o Postgres recomputa o agregado do zero a cada linha.
         --    Com 709 mil posicoes numa particao, foi o que estourou o tempo do
         --    editor na primeira tentativa.
         min(CASE WHEN c.na_base THEN c.dh_posicao END)
           OVER (PARTITION BY c.cd_lancha ORDER BY c.dh_posicao DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS t_base_prox
    FROM public.mv_ais_pos_classificada c
  WINDOW w AS (PARTITION BY c.cd_lancha ORDER BY c.dh_posicao)
),
-- Ilhas: soma corrida que incrementa a cada transicao base → fora.
numerado AS (
  SELECT m.cd_lancha, m.ds_lancha, m.dh_posicao, m.prox_t, m.na_base,
         m.cerca, m.sog_efetivo, m.dist_base_m, m.t_base_ant, m.t_base_prox,
         sum(CASE WHEN NOT m.na_base AND (m.ant_base IS NULL OR m.ant_base)
                  THEN 1 ELSE 0 END)
           OVER (PARTITION BY m.cd_lancha ORDER BY m.dh_posicao
                 ROWS UNBOUNDED PRECEDING) AS ep
    FROM marcado m
),
episodios AS (
  SELECT n.cd_lancha,
         max(n.ds_lancha) AS ds_lancha,
         n.ep,
         min(n.dh_posicao) AS inicio,
         -- prox_t da ultima posicao fora = primeira posicao de base seguinte.
         -- max() ignora NULL, entao num episodio em aberto isso devolveria a
         -- propria ultima posicao; `em_aberto` desarma esse caso abaixo.
         max(n.prox_t)             AS fim_bruto,
         bool_or(n.prox_t IS NULL) AS em_aberto,
         count(*)                  AS n_posicoes,
         max(n.sog_efetivo)        AS sog_max,
         max(n.dist_base_m)        AS afastamento_max_m,
         bool_or(n.cerca = 'iate_clube') AS passou_iate_clube,
         min(n.t_base_ant)  AS t_base_ant,
         min(n.t_base_prox) AS t_base_prox,
         COALESCE(sum(EXTRACT(epoch FROM (n.prox_t - n.dh_posicao)))
                    FILTER (WHERE (n.prox_t - n.dh_posicao)
                                  > (SELECT limiar_min FROM par) * interval '1 minute'), 0)
           AS seg_nao_resolvidos,
         COALESCE(sum(EXTRACT(epoch FROM (n.prox_t - n.dh_posicao)))
                    FILTER (WHERE (n.prox_t - n.dh_posicao)
                                  <= (SELECT limiar_min FROM par) * interval '1 minute'
                            AND COALESCE(n.sog_efetivo, 999) < (SELECT limiar_parada_kn FROM par)), 0)
           AS seg_parada,
         COALESCE(sum(EXTRACT(epoch FROM (n.prox_t - n.dh_posicao)))
                    FILTER (WHERE (n.prox_t - n.dh_posicao)
                                  <= (SELECT limiar_min FROM par) * interval '1 minute'
                            AND COALESCE(n.sog_efetivo, 999) >= (SELECT limiar_parada_kn FROM par)), 0)
           AS seg_movimento
    FROM numerado n
   WHERE NOT n.na_base
     AND n.ep > 0
   GROUP BY n.cd_lancha, n.ep
),
-- Qual cerca de base corresponde aos dois momentos guardados acima.
-- (cd_lancha, dh_posicao) e unico entre as posicoes com coordenada.
rotulo AS (
  SELECT c.cd_lancha, c.dh_posicao, c.cerca
    FROM public.mv_ais_pos_classificada c
   WHERE c.na_base
)
SELECT
  e.ds_lancha,
  e.cd_lancha,
  e.ep AS nr_saida,
  e.inicio,
  CASE WHEN e.em_aberto THEN NULL ELSE e.fim_bruto END AS fim,
  e.em_aberto,
  (e.inicio AT TIME ZONE 'America/Fortaleza')::date AS dia_inicio,
  EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza'))::int AS hora_inicio,
  -- Noturna pelo HORARIO DE PARTIDA: uma saida as 23h que volta as 2h conta
  -- como UMA noite, nao duas — a pergunta e sobre a escala de quem embarcou, e
  -- quem embarcou saiu as 23h.
  (EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza')) >= 18
   OR EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza')) < 6) AS noturna,
  CASE WHEN e.em_aberto THEN NULL
       ELSE round((EXTRACT(epoch FROM (e.fim_bruto - e.inicio)) / 3600.0)::numeric, 2)
  END AS duracao_h,
  round((e.seg_movimento      / 3600.0)::numeric, 2) AS horas_movimento,
  round((e.seg_parada         / 3600.0)::numeric, 2) AS horas_parada,
  round((e.seg_nao_resolvidos / 3600.0)::numeric, 2) AS horas_nao_resolvidas,
  CASE WHEN e.em_aberto OR e.fim_bruto <= e.inicio THEN NULL
       ELSE round((100.0 * (1 - e.seg_nao_resolvidos
                                / EXTRACT(epoch FROM (e.fim_bruto - e.inicio))))::numeric, 1)
  END AS cobertura_pct,
  ro.cerca AS base_origem,
  rd.cerca AS base_destino,
  (ro.cerca IS NOT NULL AND rd.cerca IS NOT NULL AND ro.cerca <> rd.cerca) AS travessia,
  e.n_posicoes,
  round(e.sog_max::numeric, 1)                      AS sog_max,
  round((e.afastamento_max_m / 1000.0)::numeric, 2) AS afastamento_max_km,
  e.passou_iate_clube,
  -- Movimento curto e proximo: manobra de berco, reposicionamento, atracacao
  -- em outro ponto. NAO e ruido de GPS (o raio de 50 m ja tirou esse) e NAO e
  -- saida operacional. Em agosto/2026 sao 2 episodios da Flexeiras no mes
  -- inteiro; em 2025 pesam mais.
  (e.afastamento_max_m < 300
   AND NOT e.em_aberto
   AND (e.fim_bruto - e.inicio) < interval '20 minutes') AS curta_e_perto,
  (SELECT limiar_min       FROM par) AS limiar_min,
  (SELECT limiar_parada_kn FROM par) AS limiar_parada_kn
FROM episodios e
LEFT JOIN rotulo ro ON ro.cd_lancha = e.cd_lancha AND ro.dh_posicao = e.t_base_ant
LEFT JOIN rotulo rd ON rd.cd_lancha = e.cd_lancha AND rd.dh_posicao = e.t_base_prox;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_saidas_pk
  ON public.mv_ais_saidas (cd_lancha, nr_saida);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_inicio
  ON public.mv_ais_saidas (inicio);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_dia
  ON public.mv_ais_saidas (dia_inicio);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_rota
  ON public.mv_ais_saidas (base_origem, base_destino);

COMMENT ON MATERIALIZED VIEW public.mv_ais_saidas IS
  'Uma linha por saida da base, com rota (base_origem/base_destino) e duracao aberta em movimento e parada. Para CONTAR saidas filtre NOT curta_e_perto. Para medir OPERACAO use horas_movimento, nunca duracao_h: ha um ponto de espera no Pecem fora de qualquer cerca onde as lanchas ficam paradas por horas. A Fortim detecta menos saidas que manobras (64 contra 105 em agosto) porque encadeia manobras e tem 10,5% do mes sem transmissao. A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_saidas TO anon, authenticated;

SELECT cron.unschedule('refresh-ais-saidas-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-saidas-diario');

SELECT cron.schedule(
  'refresh-ais-saidas-diario',
  '10 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_saidas$$
);

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) TAMANHO. ESPERADO: ~4.150 episodios (eram 9.961 antes do raio de 50 m).
--
-- SELECT count(*) AS episodios,
--        count(*) FILTER (WHERE curta_e_perto) AS curtas_e_perto,
--        count(*) FILTER (WHERE travessia)     AS travessias,
--        count(*) FILTER (WHERE base_origem IS NULL) AS sem_origem
--   FROM public.mv_ais_saidas;

-- 2) AS ROTAS, e o primeiro numero do item de deslocamento entre portos.
--
-- SELECT base_origem, base_destino, count(*) AS saidas,
--        round(avg(duracao_h), 2)       AS dur_media_h,
--        round(avg(horas_movimento), 2) AS movimento_medio_h,
--        round(avg(sog_max), 1)         AS sog_max_medio
--   FROM public.mv_ais_saidas
--  WHERE NOT em_aberto AND NOT curta_e_perto
--  GROUP BY 1, 2 ORDER BY saidas DESC;

-- 3) TRAVESSIAS PELO AIS vs FAINAS REGISTRADAS, mesmo periodo. O AIS so ve de
--    jan/2025 em diante. Diferenca grande aqui aponta travessia nao registrada
--    ou detectada a mais — vale investigar caso a caso.
--
-- SELECT
--   (SELECT count(*) FROM public.mv_ais_saidas
--     WHERE travessia AND inicio >= '2025-01-01')  AS travessias_ais,
--   (SELECT count(*) FROM public.fainas_deslocamentos
--     WHERE dh_inicio >= '2025-01-01')             AS fainas_registradas;

-- 4) QUANTO DE CADA SAIDA E ESPERA PARADA. A leitura que motivou esta versao,
--    agora no grao do episodio.
--
-- SELECT ds_lancha, count(*) AS saidas,
--        round(sum(horas_movimento), 1) AS movimento_h,
--        round(sum(horas_parada), 1)    AS parada_h,
--        round(100.0 * sum(horas_parada)
--              / nullif(sum(horas_parada + horas_movimento), 0), 0) AS pct_parada
--   FROM public.mv_ais_saidas
--  WHERE dia_inicio BETWEEN '2026-08-01' AND '2026-08-31' AND NOT curta_e_perto
--  GROUP BY 1 ORDER BY 1;

-- 5) CALIBRACAO CONTRA AS MANOBRAS, agosto/2026. ESPERADO: Flexeiras ~91
--    saidas operacionais contra 91 manobras. A Fortim fica bem abaixo das 105
--    dela, pelos motivos no COMMENT da view — nao e erro.
--
-- SELECT s.ds_lancha,
--        count(*) FILTER (WHERE NOT s.curta_e_perto) AS saidas_operacionais,
--        (SELECT count(*) FROM public.manobras_lanchas m
--          WHERE m.ds_lancha = s.ds_lancha
--            AND m.dh_manobra >= '2026-08-01T03:00:00Z'
--            AND m.dh_manobra <  '2026-09-01T03:00:00Z') AS manobras
--   FROM public.mv_ais_saidas s
--  WHERE s.dia_inicio BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;
