-- ─────────────────────────────────────────────────────────────────────────────
-- Duas correções sobre 20260923140000/150000, achadas na verificação
--
-- ─── 1. "indeterminado" era 75% das linhas ───────────────────────────────────
--
-- Em 2026: 347 de 466 buracos caíam em `indeterminado`. Um balde que recebe
-- três quartos dos casos não classifica nada.
--
-- Olhando o que eram: buracos com a lancha FORA da base antes ou depois. Isto
-- é perda de sinal durante operação — e o §1b da lista da gestão já dizia que
-- acontece "durante a realização de manobras, quando navega para região mais
-- distante". Tem nome próprio: `queda_em_operacao`.
--
-- Sobra `indeterminado` só para o que realmente não se resolve.
--
-- ─── 2. O Iate Clube somava a saída inteira ──────────────────────────────────
--
-- A versão anterior contava as saídas que TOCARAM a cerca do clube e somava
-- `horas_movimento` dessas saídas. Isso devolvia "52 passagens, 59,28 h" em
-- agosto/2026 — e 59 h parece uso intenso do clube.
--
-- Não é. As 59 h são o movimento das saídas inteiras, que passaram pelo clube
-- em algum momento. O tempo DENTRO da cerca em agosto foi de 2,47 h na
-- Flexeiras e 0,95 h na Fortim: das 24 travessias medidas entre 19 e 25/08,
-- quinze duraram um minuto ou menos.
--
-- ⚠️ As duas grandezas agora vêm em colunas separadas e nomeadas pelo que são.
--    Confundir uma com a outra exagera o uso do clube em vinte vezes.
--
-- O que a gestão realmente queria aqui — percentual por comandante e cruzamento
-- com maré — continua impossível: não há tabela de tripulação nem série de maré.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_falhas_transmissao;

CREATE MATERIALIZED VIEW public.mv_ais_falhas_transmissao AS
WITH par AS (
  SELECT 30 AS limiar_min
),
pos AS (
  SELECT c.cd_lancha, c.ds_lancha, c.dh_posicao, c.prox_t, c.na_base,
         lead(c.na_base) OVER (PARTITION BY c.cd_lancha ORDER BY c.dh_posicao) AS base_depois
    FROM public.mv_ais_pos_classificada c
),
buracos AS (
  SELECT p.cd_lancha, p.ds_lancha,
         p.dh_posicao AS inicio,
         p.prox_t     AS fim,
         p.na_base    AS base_antes,
         p.base_depois,
         EXTRACT(epoch FROM (p.prox_t - p.dh_posicao)) / 3600.0 AS h
    FROM pos p
   WHERE p.prox_t IS NOT NULL
     AND (p.prox_t - p.dh_posicao) > (SELECT limiar_min FROM par) * interval '1 minute'
)
SELECT
  b.ds_lancha,
  b.cd_lancha,
  b.inicio,
  b.fim,
  (b.inicio AT TIME ZONE 'America/Fortaleza')::date AS dia,
  round(b.h::numeric, 2) AS duracao_h,
  b.base_antes,
  b.base_depois,
  fa.tem AS dentro_de_faina,
  CASE
    -- Travessia registrada cobrindo o buraco. Fonte independente do AIS.
    WHEN fa.tem THEN 'queda_em_travessia'
    -- Atracada antes E depois: nao saiu do lugar e mesmo assim sumiu. E o unico
    -- caso que aponta transponder com problema.
    WHEN b.base_antes AND COALESCE(b.base_depois, false) THEN 'ais_com_defeito'
    -- Fora da base em alguma das pontas: perda de sinal em operacao, que o §1b
    -- ja descrevia como corriqueira ao navegar para regiao mais distante.
    WHEN NOT b.base_antes OR NOT COALESCE(b.base_depois, true) THEN 'queda_em_operacao'
    ELSE 'indeterminado'
  END AS classe,
  (b.h >= 6) AS acima_do_alerta
FROM buracos b
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.fainas_deslocamentos f
     WHERE f.cd_lancha = b.cd_lancha
       AND f.dh_fim IS NOT NULL
       AND f.dh_inicio <= b.fim
       AND f.dh_fim    >= b.inicio
  ) AS tem
) fa ON true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_falhas_pk
  ON public.mv_ais_falhas_transmissao (cd_lancha, inicio);
CREATE INDEX IF NOT EXISTS idx_mv_falhas_dia
  ON public.mv_ais_falhas_transmissao (dia, classe);

COMMENT ON MATERIALIZED VIEW public.mv_ais_falhas_transmissao IS
  'Cada intervalo acima de 30 min sem posicao AIS, classificado: queda_em_travessia (ha faina registrada — esperado), queda_em_operacao (lancha fora da base numa das pontas — esperado), ais_com_defeito (atracada antes e depois, nao saiu do lugar e sumiu) ou indeterminado. Para alerta operacional so `ais_com_defeito` interessa. Atende ao §1b da lista da gestao.';

GRANT SELECT ON public.mv_ais_falhas_transmissao TO anon, authenticated;


-- ═══ Iate Clube, com as duas grandezas separadas ══════════════════════════════

-- DROP antes do CREATE: `CREATE OR REPLACE VIEW` nao aceita mudanca na lista
-- de colunas, e aqui a lista muda. Sem isto a migration inteira reverte com
-- "cannot drop columns from view".
DROP VIEW IF EXISTS public.v_ais_iate_clube;

CREATE VIEW public.v_ais_iate_clube AS
WITH dentro AS (
  -- Tempo efetivamente DENTRO da cerca do clube.
  SELECT to_char(b.dia, 'YYYY-MM') AS ano_mes, b.ds_lancha, b.cd_lancha,
         round(sum(b.horas_iate_clube), 2) AS horas_dentro_da_cerca
    FROM public.mv_ais_base_dia b
   GROUP BY 1, 2, 3
),
saidas AS (
  -- Saidas que tocaram o clube em algum momento. A duracao delas e da SAIDA
  -- inteira, nao do tempo no clube — por isso vai em coluna separada.
  SELECT to_char(s.dia_inicio, 'YYYY-MM') AS ano_mes, s.ds_lancha, s.cd_lancha,
         count(*)                          AS saidas_que_passaram,
         count(*) FILTER (WHERE s.noturna) AS noturnas,
         round(sum(s.horas_movimento), 2)  AS horas_movimento_das_saidas
    FROM public.mv_ais_saidas s
   WHERE s.passou_iate_clube
   GROUP BY 1, 2, 3
)
SELECT
  d.ano_mes,
  d.ds_lancha,
  d.cd_lancha,
  d.horas_dentro_da_cerca,
  COALESCE(s.saidas_que_passaram, 0)        AS saidas_que_passaram,
  COALESCE(s.noturnas, 0)                   AS noturnas,
  s.horas_movimento_das_saidas,
  -- Quanto da saida foi de fato no clube. Numero baixissimo por natureza: o
  -- clube e ponto de transbordo, nao estadia.
  CASE WHEN COALESCE(s.horas_movimento_das_saidas, 0) > 0
       THEN round(100.0 * d.horas_dentro_da_cerca / s.horas_movimento_das_saidas, 1)
  END AS pct_da_saida_no_clube
FROM dentro d
LEFT JOIN saidas s
  ON s.ano_mes = d.ano_mes AND s.cd_lancha = d.cd_lancha
WHERE d.horas_dentro_da_cerca > 0 OR s.saidas_que_passaram > 0;

COMMENT ON VIEW public.v_ais_iate_clube IS
  'Uso do Iate Clube por mes e lancha. ATENCAO as duas grandezas: `horas_dentro_da_cerca` e o tempo no clube (2,47 h da Flexeiras em agosto/2026); `horas_movimento_das_saidas` e o movimento das saidas inteiras que passaram por la (59,28 h no mesmo mes). Confundir uma com a outra exagera o uso do clube em vinte vezes. Percentual por comandante e cruzamento com mare NAO sao possiveis: nao ha tabela de tripulacao nem serie de mare.';

GRANT SELECT ON public.v_ais_iate_clube TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
