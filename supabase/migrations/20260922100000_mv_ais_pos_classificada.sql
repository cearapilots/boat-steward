-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_pos_classificada — a classificacao espacial, feita UMA vez
--
-- ARQUIVO 1 DE 3. Rode nesta ordem:
--   1. 20260922100000_mv_ais_pos_classificada.sql   ← este
--   2. 20260922110000_mv_ais_base_dia.sql
--   3. 20260922120000_mv_ais_saidas.sql
--
-- Rode um de cada vez no SQL editor. Juntos estouram o tempo do editor
-- ("Failed to fetch") — foi exatamente o que aconteceu na primeira tentativa.
--
-- ─── POR QUE ESTA CAMADA PASSOU A EXISTIR ────────────────────────────────────
--
-- Ate aqui, mv_ais_base_dia e mv_ais_saidas faziam cada uma a sua propria
-- juncao espacial contra as cercas, sobre as mesmas 709 mil posicoes. Trabalho
-- duplicado, e duas chances de as definicoes divergirem.
--
-- Pior: para calcular velocidade por deslocamento eu precisava de `lead(geom)`,
-- e arrastar 709 mil objetos `geography` por dentro de uma ordenacao de janela
-- derrubou o editor. Aqui a geometria nunca entra numa janela — o que circula
-- sao dois `double precision` de latitude e longitude, e o ponto so e
-- construido nas poucas linhas em que faz falta.
--
-- Depois desta view, as outras duas nao tocam PostGIS. Viram janela e soma.
--
-- ─── O QUE CADA COLUNA DECIDE ────────────────────────────────────────────────
--
-- `na_base`  — dentro da cerca de base OU ate 50 m dela. As cercas em KMZ
--              desenham o BERCO, nao a lancha amarrada nele: Mucuripe tem
--              ~1.152 m² (34 x 34 m). Sem esse raio, a lancha parada cruzava a
--              cerca onze vezes em 35 minutos e cada cruzamento virava uma
--              saida. Calibrado contra as manobras registradas de agosto/2026:
--              a Flexeiras sai de 101 saidas detectadas para 92, contra 91
--              manobras. Acima de 50 m o ganho some.
--
-- `sog_efetivo` — o SOG reportado; e so quando ele falta (6,94% das posicoes),
--              a velocidade calculada pelo deslocamento ate a posicao seguinte.
--              Reserva, nao segunda definicao. So vale para intervalos de ate
--              10 min: acima disso, deslocamento dividido por tempo subestima
--              demais, porque a lancha pode ter ido e voltado.
--
--              ⚠️ O SOG tem picos espurios isolados — ha leitura de 18,9 kn com
--                 a lancha amarrada no Pecem, contrariada pelas posicoes
--                 vizinhas. Nunca use velocidade sozinha para decidir se houve
--                 saida; a geometria decide.
--
-- `dist_base_m` — distancia ate a borda da cerca de base mais proxima. Zerada
--              dentro da base: o CASE evita o ST_Distance nas centenas de
--              milhares de posicoes atracadas, que sao a maioria da tabela.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_saidas;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_base_dia;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_pos_classificada;

CREATE MATERIALIZED VIEW public.mv_ais_pos_classificada AS
WITH par AS (
  SELECT 50 AS buffer_base_m
),
-- Cerca-primeiro: o indice GiST vive em posicoes_ais.geom e ST_DWithin sabe
-- usa-lo. Percorrer as 3 cercas deixando o indice achar os pontos de cada uma e
-- ordens de grandeza mais barato que perguntar, ponto a ponto, onde ele cai.
-- NAO inverta.
--
-- O buffer vale SO para base. Iate Clube mantem a cerca exata: nao e berco, e
-- area de evento, e alargar ali inventaria permanencia que nao houve.
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
-- Coordenadas vizinhas como numeros soltos. A geometria NAO entra na janela.
vizinhanca AS (
  SELECT p.id,
         p.cd_lancha,
         p.ds_lancha,
         p.dh_posicao,
         p.dc_sog,
         p.dc_cog,
         p.dc_latitude,
         p.dc_longitude,
         cp.codigo AS cerca,
         cp.papel,
         lead(p.dh_posicao)   OVER w AS prox_t,
         lead(p.dc_latitude)  OVER w AS prox_lat,
         lead(p.dc_longitude) OVER w AS prox_lon
    FROM public.posicoes_ais p
    LEFT JOIN cerca_da_pos cp ON cp.id = p.id
   WHERE p.tem_posicao
  WINDOW w AS (PARTITION BY p.cd_lancha ORDER BY p.dh_posicao)
)
SELECT
  v.id,
  v.cd_lancha,
  v.ds_lancha,
  v.dh_posicao,
  v.prox_t,
  v.dc_sog,
  v.dc_cog,
  v.dc_latitude,
  v.dc_longitude,
  v.cerca,
  -- papel NULO = fora de todas as cercas = fora. COALESCE explicito porque
  -- `NULL = 'base'` da NULL, nao falso, e NULL nao agrupa.
  COALESCE(v.papel = 'base', false) AS na_base,
  -- SOG reportado; na falta dele, a reserva pelo deslocamento. O ponto so e
  -- construido dentro do CASE, ou seja, nas ~7% de linhas em que faz falta.
  -- 1 m/s = 1,94384 kn.
  COALESCE(
    v.dc_sog,
    CASE WHEN v.prox_t IS NOT NULL
          AND v.prox_t > v.dh_posicao
          AND (v.prox_t - v.dh_posicao) <= interval '10 minutes'
          AND v.prox_lat IS NOT NULL
         THEN ST_Distance(
                ST_SetSRID(ST_MakePoint(v.dc_longitude, v.dc_latitude), 4326)::geography,
                ST_SetSRID(ST_MakePoint(v.prox_lon,     v.prox_lat),     4326)::geography)
              / EXTRACT(epoch FROM (v.prox_t - v.dh_posicao)) * 1.94384
    END
  ) AS sog_efetivo,
  CASE WHEN COALESCE(v.papel = 'base', false) THEN 0
       ELSE (SELECT min(ST_Distance(
                      ST_SetSRID(ST_MakePoint(v.dc_longitude, v.dc_latitude), 4326)::geography,
                      b.geom))
               FROM public.cercas_digitais b
              WHERE b.vigencia_fim IS NULL AND b.papel = 'base')
  END AS dist_base_m,
  (SELECT buffer_base_m FROM par) AS buffer_base_m
FROM vizinhanca v;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_pos_pk
  ON public.mv_ais_pos_classificada (id);
CREATE INDEX IF NOT EXISTS idx_mv_ais_pos_lancha_t
  ON public.mv_ais_pos_classificada (cd_lancha, dh_posicao);

COMMENT ON MATERIALIZED VIEW public.mv_ais_pos_classificada IS
  'Cada posicao AIS ja resolvida contra as cercas vigentes: em que cerca caiu, se conta como base (cerca + 50 m), velocidade efetiva e distancia ate a base. Camada unica de classificacao — mv_ais_base_dia e mv_ais_saidas leem daqui e nao tocam PostGIS. Refaca esta view sempre que as cercas mudarem.';

GRANT SELECT ON public.mv_ais_pos_classificada TO anon, authenticated;

-- ─── Refresh, primeiro elo da corrente diaria ────────────────────────────────
-- sync-ais 09:40 → classificada 09:45 → cobertura 09:50 → base 10:00 →
-- saidas 10:10 (tudo UTC). CONCURRENTLY exige o indice unico acima e nao roda
-- dentro de transacao — por isso vai pelo cron, nao no corpo da migration.
SELECT cron.unschedule('refresh-ais-pos-classificada')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-pos-classificada');

SELECT cron.schedule(
  'refresh-ais-pos-classificada',
  '45 9 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_pos_classificada$$
);

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) TAMANHO E PREENCHIMENTO. ESPERADO: ~709 mil linhas, nenhuma com
--    sog_efetivo nulo alem das que nao tem posicao seguinte proxima.
--
-- SELECT count(*) AS posicoes,
--        count(*) FILTER (WHERE na_base)            AS na_base,
--        count(*) FILTER (WHERE dc_sog IS NULL)     AS sem_sog_reportado,
--        count(*) FILTER (WHERE sog_efetivo IS NULL) AS sem_sog_nem_reserva
--   FROM public.mv_ais_pos_classificada;

-- 2) A RESERVA DE VELOCIDADE FUNCIONOU? Compara o SOG reportado com o que o
--    deslocamento diria, nas linhas em que os dois existem. Se as medianas
--    forem muito diferentes, a reserva esta viesada e precisa ser revista.
--
-- SELECT round(avg(dc_sog)::numeric, 2)       AS sog_reportado_medio,
--        round(avg(sog_efetivo)::numeric, 2)  AS sog_efetivo_medio
--   FROM public.mv_ais_pos_classificada
--  WHERE dc_sog IS NOT NULL;

-- 3) DISTRIBUICAO POR CERCA.
--
-- SELECT ds_lancha, COALESCE(cerca, 'FORA') AS onde, count(*)
--   FROM public.mv_ais_pos_classificada
--  GROUP BY 1, 2 ORDER BY 1, 3 DESC;
