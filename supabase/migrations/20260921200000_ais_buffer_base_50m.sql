-- ─────────────────────────────────────────────────────────────────────────────
-- Raio de tolerancia de 50 m nas cercas de base
--
-- SUBSTITUI as definicoes de mv_ais_base_dia (20260921140000... na verdade
-- 20260921160000) e mv_ais_saidas (20260921180000). Rode este arquivo inteiro;
-- ele recria as duas views. Nao e preciso rodar os dois anteriores de novo.
--
-- ─── O QUE DEU ERRADO ────────────────────────────────────────────────────────
--
-- As cercas recebidas em KMZ desenham o BERCO, nao a lancha atracada nele:
-- Mucuripe ~1.152 m² (34 x 34 m), Pecem ~3.855 m² (62 x 62 m). Uma lancha
-- amarrada balanca, o GPS oscila, e a posicao transmitida sai e volta da cerca
-- varias vezes por hora sem que a embarcacao saia do lugar.
--
-- Janela real, FLEXEIRAS atracada no Pecem em 29/11/2025:
--
--     02:44:17  sog= 0.2  pecem_base
--     02:45:17  sog=18.9  FORA         ← 84 m em 89 s = ~1,8 kn de verdade;
--     02:46:46  sog= 1.7  pecem_base      o 18,9 e leitura espuria do AIS
--     02:47:46  sog= 1.6  pecem_base
--
-- Em 35 minutos parada, a posicao cruzou a cerca ONZE vezes. Na serie inteira
-- isso gerou 9.961 episodios — 8 por lancha por dia —, dos quais 5.877 (59%)
-- nunca passaram de 50 m da base, a 1,3 kn, durando 2,8 min em media.
--
-- ⚠️ NAO tente separar ruido por VELOCIDADE. O dc_sog tem picos espurios
--    isolados (o 18,9 kn acima, com a lancha amarrada). Foi o criterio que eu
--    tentei primeiro e ele nao se sustenta. A geometria decide; o SOG nao.
--
-- ─── POR QUE 50 m, e nao outro numero ────────────────────────────────────────
--
-- Duas evidencias independentes apontam o mesmo valor.
--
-- 1. O DEGRAU NA SERIE. Episodios sobreviventes por raio de tolerancia:
--
--        0 m → 9.960     150 m → 3.466
--       50 m → 4.083     300 m → 3.280
--      100 m → 3.628     500 m → 3.077
--
--    A queda inteira acontece nos primeiros 50 m e custa 2,9% das horas.
--    Depois disso a contagem quase nao anda, e o SOG medio por faixa comeca a
--    subir (1,3 kn abaixo de 50 m; 10,6 kn entre 300 e 500 m) — sinal de que se
--    passou a cortar movimento de verdade.
--
-- 2. CALIBRACAO CONTRA AS MANOBRAS REGISTRADAS, agosto/2026, que sao referencia
--    externa e independente do AIS:
--
--                      manobras   saidas 0 m   50 m   100 m   300 m
--        FLEXEIRAS          91        101       92      91      90
--        FORTIM            105         68       64      61      60
--
--    A Flexeiras sai de 101 para 92 contra 91 manobras: praticamente 1:1.
--    Acima de 50 m o ganho desaparece.
--
--    A Fortim detecta MENOS saidas que manobras (64 contra 105). Nao e defeito
--    do buffer — o numero cai pouco de 0 m para 50 m. As explicacoes provaveis
--    sao duas, e nenhuma se resolve aqui: ela encadeia varias manobras por
--    saida, e tem 10,5% do mes sem transmissao (ver mv_ais_cobertura_dia), onde
--    uma saida inteira pode caber. NAO use contagem de saidas da Fortim como
--    proxy de manobra sem olhar a cobertura do periodo.
--
-- ─── O QUE FICA DE FORA, de proposito ────────────────────────────────────────
--
-- Nenhum debounce. Com o buffer, sobram 2,4% de pares de saidas consecutivas
-- separados por menos de 2 min na base (eram 12,2% sem buffer). Daria para
-- juntar esses pares, mas a gestao pediu justamente "retorno curto entre
-- saidas" — um merge silencioso apagaria o fenomeno que se quer medir. Os 2,4%
-- ficam declarados aqui em vez de escondidos no codigo.
--
-- A coluna `provavel_ruido` da versao anterior SAI. Com o buffer o artefato
-- some da propria definicao, e manter um flag construido sobre o criterio de
-- SOG que acabou de cair so convidaria a confiar nele de novo. No lugar entra
-- `curta_e_perto`, puramente geometrica e temporal.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1 de 2 — mv_ais_base_dia
-- ═════════════════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_base_dia;

CREATE MATERIALIZED VIEW public.mv_ais_base_dia AS
WITH par AS (
  SELECT 30 AS limiar_min, 50 AS buffer_base_m
),
-- Cerca-primeiro: o indice GiST esta em posicoes_ais.geom, e ST_DWithin sabe
-- usa-lo. Nao inverta para ponto-a-ponto.
--
-- O buffer vale SO para base. Iate Clube continua com a cerca exata: nao e
-- berco, e area de evento, e alargar ali inventaria permanencia que nao houve.
--
-- DISTINCT ON porque o buffer pode, em tese, fazer um ponto cair em duas
-- cercas. Hoje nao acontece (Mucuripe e Iate Clube distam ~650 m), mas se
-- alguem cadastrar cercas vizinhas amanha a view continua com uma linha por
-- posicao em vez de duplicar horas em silencio. Base ganha do resto.
cerca_da_pos AS (
  SELECT DISTINCT ON (p.id) p.id, cd.codigo, cd.papel
    FROM public.cercas_digitais cd
    JOIN public.posicoes_ais p
      ON ST_DWithin(cd.geom, p.geom,
                    CASE WHEN cd.papel = 'base'
                         THEN (SELECT buffer_base_m FROM par) ELSE 0 END)
   WHERE cd.vigencia_fim IS NULL
     AND p.tem_posicao
   ORDER BY p.id, (cd.papel = 'base') DESC
),
pares AS (
  SELECT p.cd_lancha,
         p.ds_lancha,
         p.dh_posicao AS t1,
         lead(p.dh_posicao) OVER (PARTITION BY p.cd_lancha ORDER BY p.dh_posicao) AS t2,
         cp.codigo AS cerca,
         cp.papel  AS papel
    FROM public.posicoes_ais p
    LEFT JOIN cerca_da_pos cp ON cp.id = p.id
   WHERE p.tem_posicao
),
segmentos AS (
  SELECT pr.cd_lancha,
         pr.ds_lancha,
         d::date AS dia,
         GREATEST(pr.t1, (d::timestamp AT TIME ZONE 'America/Fortaleza'))                   AS ini,
         LEAST(pr.t2, ((d::timestamp + interval '1 day') AT TIME ZONE 'America/Fortaleza')) AS fim,
         -- `papel`, nao o codigo: se uma base nova for cadastrada amanha, ela
         -- entra em horas_base sozinha. Com codigo fixo cairia calada em
         -- "fora" e a metrica mentiria sem avisar.
         CASE
           WHEN (pr.t2 - pr.t1) > (SELECT limiar_min FROM par) * interval '1 minute'
                THEN 'nao_resolvido'
           WHEN pr.papel = 'base' THEN 'base'
           ELSE 'fora'
         END AS estado,
         pr.cerca
    FROM pares pr
    CROSS JOIN LATERAL generate_series(
           (pr.t1 AT TIME ZONE 'America/Fortaleza')::date,
           (pr.t2 AT TIME ZONE 'America/Fortaleza')::date,
           interval '1 day') AS d
   WHERE pr.t2 IS NOT NULL
),
horas AS (
  SELECT s.cd_lancha,
         s.dia,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'base')  AS s_base,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'fora')  AS s_fora,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'nao_resolvido') AS s_nao,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'base' AND s.cerca = 'mucuripe_base')           AS s_muc,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'base' AND s.cerca = 'pecem_base')              AS s_pec,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'fora' AND s.cerca = 'iate_clube')              AS s_iate
    FROM segmentos s
   WHERE s.fim > s.ini
   GROUP BY 1, 2
),
contagem AS (
  SELECT p.cd_lancha,
         (p.dh_posicao AT TIME ZONE 'America/Fortaleza')::date AS dia,
         count(*) AS n_posicoes
    FROM public.posicoes_ais p
   WHERE p.tem_posicao
   GROUP BY 1, 2
),
limites AS (
  SELECT p.cd_lancha,
         max(p.ds_lancha) AS ds_lancha,
         min((p.dh_posicao AT TIME ZONE 'America/Fortaleza')::date) AS d0,
         max((p.dh_posicao AT TIME ZONE 'America/Fortaleza')::date) AS d1
    FROM public.posicoes_ais p
   WHERE p.tem_posicao
   GROUP BY 1
),
espinha AS (
  SELECT l.cd_lancha, l.ds_lancha, d::date AS dia
    FROM limites l
    CROSS JOIN LATERAL generate_series(l.d0, l.d1, interval '1 day') AS d
)
SELECT
  e.ds_lancha,
  e.cd_lancha,
  e.dia,
  COALESCE(c.n_posicoes, 0) AS n_posicoes,
  round((COALESCE(h.s_base, 0) / 3600.0)::numeric, 2) AS horas_base,
  round((COALESCE(h.s_muc, 0)  / 3600.0)::numeric, 2) AS horas_mucuripe,
  round((COALESCE(h.s_pec, 0)  / 3600.0)::numeric, 2) AS horas_pecem,
  round((COALESCE(h.s_fora, 0) / 3600.0)::numeric, 2) AS horas_fora,
  round((COALESCE(h.s_iate, 0) / 3600.0)::numeric, 2) AS horas_iate_clube,
  -- Dia sem posicao nenhuma e 24 h nao resolvidas, nao zero.
  CASE WHEN COALESCE(c.n_posicoes, 0) = 0
       THEN 24.00
       ELSE round((COALESCE(h.s_nao, 0) / 3600.0)::numeric, 2)
  END AS horas_nao_resolvidas,
  (SELECT limiar_min     FROM par) AS limiar_min,
  (SELECT buffer_base_m  FROM par) AS buffer_base_m
FROM espinha e
LEFT JOIN contagem c ON c.cd_lancha = e.cd_lancha AND c.dia = e.dia
LEFT JOIN horas    h ON h.cd_lancha = e.cd_lancha AND h.dia = e.dia;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_base_pk
  ON public.mv_ais_base_dia (cd_lancha, dia);
CREATE INDEX IF NOT EXISTS idx_mv_ais_base_dia
  ON public.mv_ais_base_dia (dia);

COMMENT ON MATERIALIZED VIEW public.mv_ais_base_dia IS
  'Horas por dia local na base, fora e nao resolvidas, por lancha. "Na base" = dentro da cerca OU ate 50 m dela (a cerca desenha o berco, nao a lancha amarrada). horas_iate_clube e SUBCONJUNTO de horas_fora. Nunca publique horas_fora sem horas_nao_resolvidas ao lado. A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_base_dia TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2 de 2 — mv_ais_saidas
-- ═════════════════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_saidas;

CREATE MATERIALIZED VIEW public.mv_ais_saidas AS
WITH par AS (
  SELECT 30 AS limiar_min, 50 AS buffer_base_m
),
cerca_da_pos AS (
  SELECT DISTINCT ON (p.id) p.id, cd.codigo, cd.papel
    FROM public.cercas_digitais cd
    JOIN public.posicoes_ais p
      ON ST_DWithin(cd.geom, p.geom,
                    CASE WHEN cd.papel = 'base'
                         THEN (SELECT buffer_base_m FROM par) ELSE 0 END)
   WHERE cd.vigencia_fim IS NULL
     AND p.tem_posicao
   ORDER BY p.id, (cd.papel = 'base') DESC
),
pos AS (
  SELECT p.id,
         p.cd_lancha,
         p.ds_lancha,
         p.dh_posicao,
         p.dc_sog,
         cp.codigo AS cerca,
         -- papel NULO = fora de todas as cercas = fora. COALESCE explicito
         -- porque `NULL = 'base'` da NULL, nao falso, e NULL nao agrupa.
         COALESCE(cp.papel = 'base', false) AS na_base,
         -- Distancia ate a cerca de base mais proxima, em metros, medida da
         -- BORDA do poligono. Zerada dentro da base (inclusive no buffer): o
         -- CASE evita o ST_Distance nas centenas de milhares de posicoes
         -- atracadas, que sao a maioria absoluta da tabela.
         CASE WHEN COALESCE(cp.papel = 'base', false) THEN 0
              ELSE (SELECT min(ST_Distance(p.geom, b.geom))
                      FROM public.cercas_digitais b
                     WHERE b.vigencia_fim IS NULL AND b.papel = 'base')
         END AS dist_base_m
    FROM public.posicoes_ais p
    LEFT JOIN cerca_da_pos cp ON cp.id = p.id
   WHERE p.tem_posicao
),
marcado AS (
  SELECT po.*,
         lead(po.dh_posicao) OVER w AS prox_t,
         lag(po.na_base)     OVER w AS ant_base
    FROM pos po
  WINDOW w AS (PARTITION BY po.cd_lancha ORDER BY po.dh_posicao)
),
-- Ilhas: soma corrida que incrementa a cada transicao base → fora.
numerado AS (
  SELECT m.*,
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
         -- propria ultima posicao; `em_aberto` abaixo desarma esse caso.
         max(n.prox_t)             AS fim_bruto,
         bool_or(n.prox_t IS NULL) AS em_aberto,
         count(*)                  AS n_posicoes,
         max(n.dc_sog)             AS sog_max,
         max(n.dist_base_m)        AS afastamento_max_m,
         bool_or(n.cerca = 'iate_clube') AS passou_iate_clube,
         -- Buracos DENTRO do episodio, mesmo limiar da diaria.
         COALESCE(sum(EXTRACT(epoch FROM (n.prox_t - n.dh_posicao)))
                    FILTER (WHERE (n.prox_t - n.dh_posicao)
                                  > (SELECT limiar_min FROM par) * interval '1 minute'), 0)
           AS seg_nao_resolvidos
    FROM numerado n
   WHERE NOT n.na_base
     AND n.ep > 0
   GROUP BY n.cd_lancha, n.ep
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
  -- Noturna pelo HORARIO DE PARTIDA. Uma saida as 23h que volta as 2h conta
  -- como UMA noite, nao duas — a pergunta da gestao e sobre a escala de quem
  -- embarcou, e quem embarcou saiu as 23h.
  (EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza')) >= 18
   OR EXTRACT(hour FROM (e.inicio AT TIME ZONE 'America/Fortaleza')) < 6) AS noturna,
  CASE WHEN e.em_aberto THEN NULL
       ELSE round((EXTRACT(epoch FROM (e.fim_bruto - e.inicio)) / 3600.0)::numeric, 2)
  END AS duracao_h,
  round((e.seg_nao_resolvidos / 3600.0)::numeric, 2) AS horas_nao_resolvidas,
  CASE WHEN e.em_aberto OR e.fim_bruto <= e.inicio THEN NULL
       ELSE round((100.0 * (1 - e.seg_nao_resolvidos
                                / EXTRACT(epoch FROM (e.fim_bruto - e.inicio))))::numeric, 1)
  END AS cobertura_pct,
  e.n_posicoes,
  round(e.sog_max::numeric, 1)                      AS sog_max,
  round((e.afastamento_max_m / 1000.0)::numeric, 2) AS afastamento_max_km,
  e.passou_iate_clube,
  -- Movimento curto e proximo: manobra de berco, reposicionamento, atracacao
  -- em outro ponto. NAO e ruido de GPS (o buffer de 50 m ja tirou esse) e NAO
  -- e saida operacional. Em agosto/2026 sao 2 episodios da Flexeiras no mes
  -- inteiro; em 2025 pesam mais. Exclua ao contar saidas para a gestao.
  (e.afastamento_max_m < 300
   AND NOT e.em_aberto
   AND (e.fim_bruto - e.inicio) < interval '20 minutes') AS curta_e_perto,
  (SELECT limiar_min    FROM par) AS limiar_min,
  (SELECT buffer_base_m FROM par) AS buffer_base_m
FROM episodios e;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_saidas_pk
  ON public.mv_ais_saidas (cd_lancha, nr_saida);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_inicio
  ON public.mv_ais_saidas (inicio);
CREATE INDEX IF NOT EXISTS idx_mv_ais_saidas_dia
  ON public.mv_ais_saidas (dia_inicio);

COMMENT ON MATERIALIZED VIEW public.mv_ais_saidas IS
  'Uma linha por saida da base ("na base" = cerca + 50 m). Para CONTAR saidas filtre NOT curta_e_perto; para SOMAR horas nao filtre (quebraria a conciliacao com mv_ais_base_dia). Fortim detecta menos saidas que manobras: encadeia manobras e tem 10,5% do mes sem transmissao. A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_saidas TO anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICACAO — rode depois; nada aqui altera dados.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1) AS DUAS CHECAGENS DA DIARIA, DE NOVO. Elas passaram antes do buffer e
--    precisam passar de novo — e a razao de este arquivo recriar as duas views
--    juntas em vez de so a de saidas.
--    (a) tem que fechar em 744 h por lancha em agosto:
--
-- SELECT ds_lancha,
--        round(sum(horas_base), 1)           AS base_h,
--        round(sum(horas_fora), 1)           AS fora_h,
--        round(sum(horas_nao_resolvidas), 1) AS nao_resolvido_h,
--        round(sum(horas_base + horas_fora + horas_nao_resolvidas), 1) AS total_h
--   FROM public.mv_ais_base_dia
--  WHERE dia BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;
--
--    (b) reconciliacao com a cobertura — ZERO linhas:
--
-- SELECT b.ds_lancha, b.dia, c.horas_observadas, (b.horas_base + b.horas_fora)
--   FROM public.mv_ais_base_dia b
--   JOIN public.mv_ais_cobertura_dia c
--     ON c.cd_lancha = b.cd_lancha AND c.dia = b.dia
--  WHERE abs(c.horas_observadas     - (b.horas_base + b.horas_fora)) > 0.02
--     OR abs(c.horas_nao_resolvidas -  b.horas_nao_resolvidas)       > 0.02;

-- 2) O BUFFER FEZ O QUE PROMETEU? Episodios na serie: eram 9.961 antes.
--    ESPERADO: por volta de 4.080.
--
-- SELECT count(*) AS episodios,
--        count(*) FILTER (WHERE curta_e_perto) AS curtas_e_perto,
--        round(avg(duracao_h), 2) AS dur_media_h
--   FROM public.mv_ais_saidas;

-- 3) CALIBRACAO CONTRA AS MANOBRAS, agosto/2026. ESPERADO: Flexeiras ~92
--    saidas contra 91 manobras. A Fortim fica bem abaixo das 105 dela, pelos
--    motivos explicados no cabecalho — nao e erro desta view.
--
-- SELECT s.ds_lancha,
--        count(*)                                  AS saidas,
--        count(*) FILTER (WHERE NOT s.curta_e_perto) AS saidas_operacionais,
--        (SELECT count(*) FROM public.manobras_lanchas m
--          WHERE m.ds_lancha = s.ds_lancha
--            AND m.dh_manobra >= '2026-08-01T03:00:00Z'
--            AND m.dh_manobra <  '2026-09-01T03:00:00Z') AS manobras
--   FROM public.mv_ais_saidas s
--  WHERE s.dia_inicio BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;

-- 4) SOBROU RUIDO DE BERCO? Episodios que ainda ficam a menos de 50 m nao
--    deveriam existir — o buffer os absorveu. ESPERADO: zero linhas.
--
-- SELECT * FROM public.mv_ais_saidas WHERE afastamento_max_km < 0.05;

-- 5) CONCILIACAO ENTRE AS DUAS CAMADAS. Diferenca de poucas horas e esperada
--    (episodio em aberto no fim da serie + bordas da serie).
--
-- SELECT
--   (SELECT round(sum(duracao_h - horas_nao_resolvidas), 1)
--      FROM public.mv_ais_saidas WHERE NOT em_aberto) AS pelas_saidas,
--   (SELECT round(sum(horas_fora), 1)
--      FROM public.mv_ais_base_dia)                   AS pela_diaria;

-- 6) AS SAIDAS DA FORTIM, 19 a 25/08 — a pergunta que abriu esta serie toda.
--
-- SELECT ds_lancha, inicio, fim, duracao_h, afastamento_max_km, sog_max,
--        cobertura_pct, passou_iate_clube, curta_e_perto
--   FROM public.mv_ais_saidas
--  WHERE dia_inicio BETWEEN '2026-08-19' AND '2026-08-25'
--  ORDER BY inicio;
