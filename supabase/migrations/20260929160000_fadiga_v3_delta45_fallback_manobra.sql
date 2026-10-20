-- ─────────────────────────────────────────────────────────────────────────────
-- Fadiga v3 — delta de 45 min, fallback por manobra, semana virando às 08:00
--
-- SUBSTITUI a mv_fadiga_periodos de 20260922220000. Três pedidos da gestão em
-- 29/09/2026, e cada um muda um pedaço diferente do cálculo.
--
-- ─── 1. delta_min: 60 → 45 ───────────────────────────────────────────────────
--
-- Era provisório desde o começo — o único parâmetro da camada que não vinha nem
-- da IMO nem de calibração. A gestão definiu 45 min. Encurta TODA jornada em
-- 30 min (15 de cada ponta), então os números desta aba mudam em bloco.
--
-- ─── 2. FALLBACK POR MANOBRA ─────────────────────────────────────────────────
--
-- Até aqui a camada só enxergava o que o AIS mostrava. Lancha com transponder
-- fora do ar aparecia como lancha em repouso — o pior erro possível numa
-- análise de fadiga, porque ele some justamente com o trabalho.
--
-- Agora, manobra SEM cobertura de AIS gera janela própria de
-- `delta_manobra_min` antes e depois do carimbo. São 60 min, não 45, e o motivo
-- é operacional: o carimbo marca o embarque do prático, mas a lancha já se
-- deslocou para buscá-lo antes e ainda volta depois de deixá-lo.
--
-- ⚠️ É FALLBACK, não soma. A janela só nasce se NÃO houver posição AIS alguma
--    no intervalo — senão o AIS já descreve o evento melhor, e somar as duas
--    inflaria toda jornada já coberta.
--
-- ⚠️ A TAÍBA ENTRA NA CAMADA PELA PRIMEIRA VEZ. Ela não tem MMSI: nunca
--    transmitiu, então TODA manobra dela é "sem cobertura". Passa a ter 272
--    períodos desde 2025. São jornadas de 2 h fixas, sem movimento observado —
--    leia `fonte` antes de comparar com as outras duas lanchas.
--
-- ⚠️ Recorte em 2025-01-01, primeira data com AIS. Antes disso não existe
--    "fallback": existiria só manobra, um dado muito mais pobre, e emendá-lo à
--    série faria a tendência mensal mentir.
--
-- ─── 3. A SEMANA DA TURMA VIRA ÀS 08:00, NÃO À MEIA-NOITE ────────────────────
--
-- A rendição é na manhã de terça. Ancorar à meia-noite jogava o trabalho da
-- madrugada de terça — que é da turma que está SAINDO — para a semana da turma
-- que ainda nem chegou. Subtraindo 8 h antes de resolver a terça, a jornada que
-- começa terça 07:00 fica na semana certa, a que termina.
--
-- ─── O QUE NÃO MUDOU ─────────────────────────────────────────────────────────
--
-- Limiares da MSC.1/Circ.1598 da IMO: 12 h (§34), 16 h (§33), WOCL 03–05 (§27),
-- madrugada 00–06 (§28). `grau` continua sendo a combinação que o guia nomeia.
--
-- ⚠️ PROXY DA LANCHA, NÃO DA PESSOA. Não há tabela de tripulação no banco.
-- ⚠️ Módulo 2 §32: ferramenta de fadiga aponta ponto quente, não decide escala.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_fadiga_semana;
DROP MATERIALIZED VIEW IF EXISTS public.mv_fadiga_periodos;

CREATE MATERIALIZED VIEW public.mv_fadiga_periodos AS
WITH par AS (
  SELECT 45  AS delta_min,             -- definido pela gestão em 29/09/2026
         60  AS delta_manobra_min,     -- ida para buscar o prático + volta
         1.0::double precision AS limiar_parada_kn,
         30  AS limiar_min,            -- acima disto o intervalo é buraco
         8   AS hora_virada_turma      -- terça 08:00, hora de Fortaleza
),
-- nome canônico: `manobras_lanchas` chama a Taíba de "TAÍBA III"
nome AS (
  SELECT l.id_webpilot::int AS cd_lancha, upper(l.nome) AS ds_lancha
    FROM public.lanchas l
),

-- ── A) O que o AIS viu: posição em movimento fora da base ───────────────────
jan_ais AS (
  SELECT c.cd_lancha,
         c.ds_lancha,
         c.dh_posicao - (SELECT delta_min FROM par) * interval '1 minute' AS ini,
         c.dh_posicao + (SELECT delta_min FROM par) * interval '1 minute' AS fim,
         'ais'::text  AS fonte,
         c.dh_posicao,
         c.prox_t
    FROM public.mv_ais_pos_classificada c
   WHERE NOT c.na_base
     AND COALESCE(c.sog_efetivo, 999) >= (SELECT limiar_parada_kn FROM par)
),

-- ── B) O que o AIS NÃO viu, mas a manobra prova que aconteceu ───────────────
jan_man AS (
  SELECT m.cd_lancha,
         n.ds_lancha,
         m.dh_manobra - (SELECT delta_manobra_min FROM par) * interval '1 minute' AS ini,
         m.dh_manobra + (SELECT delta_manobra_min FROM par) * interval '1 minute' AS fim,
         'manobra'::text AS fonte,
         NULL::timestamptz AS dh_posicao,
         NULL::timestamptz AS prox_t
    FROM public.manobras_lanchas m
    JOIN nome n ON n.cd_lancha = m.cd_lancha
   WHERE m.dh_manobra >= '2025-01-01'::timestamptz
     AND NOT EXISTS (
           SELECT 1
             FROM public.mv_ais_pos_classificada c
            WHERE c.cd_lancha  = m.cd_lancha
              AND c.dh_posicao >= m.dh_manobra - (SELECT delta_manobra_min FROM par) * interval '1 minute'
              AND c.dh_posicao <= m.dh_manobra + (SELECT delta_manobra_min FROM par) * interval '1 minute')
),

jan AS (SELECT * FROM jan_ais UNION ALL SELECT * FROM jan_man),

-- ── Funde janelas que se tocam ──────────────────────────────────────────────
-- ⚠️ O frame começa em UNBOUNDED PRECEDING e só o FIM anda. Isso é
--    incremental. NÃO troque por um frame cujo INÍCIO ande (por exemplo
--    CURRENT ROW .. UNBOUNDED FOLLOWING): max() não tem função inversa de
--    transição, o frame seria recalculado linha a linha e a consulta vira
--    O(n²). Já estourou o timeout uma vez por isso, em 22/09/2026.
ord AS (
  SELECT j.*,
         max(j.fim) OVER (PARTITION BY j.cd_lancha ORDER BY j.ini, j.fim
                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS fim_ant
    FROM jan j
),
grp AS (
  SELECT o.*,
         sum(CASE WHEN o.fim_ant IS NULL OR o.ini > o.fim_ant THEN 1 ELSE 0 END)
           OVER (PARTITION BY o.cd_lancha ORDER BY o.ini, o.fim ROWS UNBOUNDED PRECEDING) AS per
    FROM ord o
),
bloco AS (
  SELECT g.cd_lancha,
         max(g.ds_lancha) AS ds_lancha,
         g.per,
         min(g.ini) AS inicio_trabalho,
         max(g.fim) AS fim_trabalho,
         count(*) FILTER (WHERE g.fonte = 'ais')     AS n_posicoes,
         count(*) FILTER (WHERE g.fonte = 'manobra') AS n_manobras_sem_ais,
         -- Só o AIS comprova movimento; janela de manobra entra com zero.
         -- Intervalo acima do limiar é buraco, e buraco não é trabalho visto.
         COALESCE(sum(EXTRACT(epoch FROM (g.prox_t - g.dh_posicao)))
           FILTER (WHERE g.fonte = 'ais'
                     AND (g.prox_t - g.dh_posicao)
                         <= (SELECT limiar_min FROM par) * interval '1 minute'), 0) / 3600.0
           AS h_movimento
    FROM grp g
   GROUP BY g.cd_lancha, g.per
),
janelas AS (
  SELECT b.cd_lancha, b.per,
         sum(GREATEST(0, EXTRACT(epoch FROM (
              LEAST(b.fim_trabalho, ((d + time '05:00') AT TIME ZONE 'America/Fortaleza'))
            - GREATEST(b.inicio_trabalho, ((d + time '03:00') AT TIME ZONE 'America/Fortaleza'))
         )))) / 3600.0 AS h_wocl,
         sum(GREATEST(0, EXTRACT(epoch FROM (
              LEAST(b.fim_trabalho, ((d + time '06:00') AT TIME ZONE 'America/Fortaleza'))
            - GREATEST(b.inicio_trabalho, ((d + time '00:00') AT TIME ZONE 'America/Fortaleza'))
         )))) / 3600.0 AS h_madrugada
    FROM bloco b
    CROSS JOIN LATERAL generate_series(
           (b.inicio_trabalho AT TIME ZONE 'America/Fortaleza')::date,
           (b.fim_trabalho    AT TIME ZONE 'America/Fortaleza')::date,
           interval '1 day') AS d
   GROUP BY b.cd_lancha, b.per
),
-- A virada às 08:00: desloca o relógio local 8 h para trás e só então resolve
-- a terça. Jornada que começa terça 07:00 cai na semana que está terminando.
turma AS (
  SELECT b.cd_lancha, b.per,
         ((b.inicio_trabalho AT TIME ZONE 'America/Fortaleza')
           - (SELECT hora_virada_turma FROM par) * interval '1 hour') AS t_ancora
    FROM bloco b
)
SELECT
  b.ds_lancha,
  b.cd_lancha,
  b.per AS nr_periodo,
  b.inicio_trabalho,
  b.fim_trabalho,
  (b.inicio_trabalho AT TIME ZONE 'America/Fortaleza')::date AS dia_inicio,
  (t.t_ancora::date
    - ((EXTRACT(dow FROM t.t_ancora)::int - 2 + 7) % 7) * interval '1 day')::date AS semana_turma,
  round((EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0)::numeric, 2) AS duracao_h,
  round(b.h_movimento::numeric, 2) AS horas_movimento,
  b.n_posicoes,
  b.n_manobras_sem_ais,
  -- De onde veio este período. 'manobra' = o AIS estava cego e quem provou a
  -- atividade foi o registro de manobra; nele horas_movimento é sempre 0.
  CASE WHEN b.n_posicoes > 0 AND b.n_manobras_sem_ais > 0 THEN 'ais+manobra'
       WHEN b.n_manobras_sem_ais > 0                      THEN 'manobra'
       ELSE 'ais' END AS fonte,
  round(COALESCE(j.h_wocl, 0)::numeric, 2)      AS horas_wocl,
  round(COALESCE(j.h_madrugada, 0)::numeric, 2) AS horas_madrugada,
  -- Jornada longa com pouco movimento é espera longa no meio, não esforço
  -- contínuo. Em período de fonte 'manobra' a densidade é 0 por construção.
  round((100.0 * b.h_movimento
         / NULLIF(EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0, 0))::numeric, 0)
    AS densidade_pct,
  (EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12) AS excede_12h,
  (EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 16) AS excede_16h,
  (COALESCE(j.h_wocl, 0) > 0) AS atravessa_wocl,
  CASE
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 16 THEN 'critico'
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12
         AND COALESCE(j.h_madrugada, 0) > 0                                      THEN 'critico'
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12 THEN 'atencao'
    WHEN COALESCE(j.h_wocl, 0) > 0                                               THEN 'atencao'
    ELSE 'normal'
  END AS grau,
  (SELECT delta_min          FROM par) AS delta_min,
  (SELECT delta_manobra_min  FROM par) AS delta_manobra_min,
  (SELECT limiar_parada_kn   FROM par) AS limiar_parada_kn
FROM bloco b
LEFT JOIN janelas j ON j.cd_lancha = b.cd_lancha AND j.per = b.per
JOIN turma   t ON t.cd_lancha = b.cd_lancha AND t.per = b.per;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_fadiga_pk
  ON public.mv_fadiga_periodos (cd_lancha, nr_periodo);
CREATE INDEX IF NOT EXISTS idx_mv_fadiga_dia
  ON public.mv_fadiga_periodos (dia_inicio);
CREATE INDEX IF NOT EXISTS idx_mv_fadiga_semana
  ON public.mv_fadiga_periodos (semana_turma);

COMMENT ON MATERIALIZED VIEW public.mv_fadiga_periodos IS
  'Periodos de trabalho, v3 (29/09/2026). Movimento do AIS expandido em 45 min antes e depois, MAIS manobra sem cobertura de AIS expandida em 60 min — o fallback para transponder fora do ar. A coluna `fonte` diz qual dos dois sustenta cada periodo; em fonte=manobra, horas_movimento e densidade_pct sao 0 por construcao. A Taiba so aparece por fallback, pois nao tem MMSI. Semana da turma vira terca as 08:00 locais. Limiares da MSC.1/Circ.1598 da IMO. PROXY DA LANCHA, NAO DA PESSOA.';

GRANT SELECT ON public.mv_fadiga_periodos TO anon, authenticated;


-- ═══ A semana da turma, de terça 08:00 a terça 08:00 ═════════════════════════

CREATE OR REPLACE VIEW public.v_fadiga_semana AS
WITH folga AS (
  SELECT p.*,
         EXTRACT(epoch FROM (p.inicio_trabalho
           - lag(p.fim_trabalho) OVER (PARTITION BY p.cd_lancha ORDER BY p.inicio_trabalho))) / 3600.0
           AS folga_antes_h
    FROM public.mv_fadiga_periodos p
)
SELECT
  f.ds_lancha,
  f.cd_lancha,
  f.semana_turma,
  count(*)                                      AS periodos_trabalho,
  round(sum(f.duracao_h), 1)                    AS horas_trabalho,
  round(sum(f.horas_movimento), 1)              AS horas_movimento,
  round(sum(f.horas_madrugada), 1)              AS horas_madrugada,
  round(sum(f.horas_wocl), 1)                   AS horas_wocl,
  count(*) FILTER (WHERE f.horas_madrugada > 0) AS noites_trabalhadas,
  count(*) FILTER (WHERE f.excede_12h)          AS periodos_acima_12h,
  count(*) FILTER (WHERE f.excede_16h)          AS periodos_acima_16h,
  count(*) FILTER (WHERE f.grau = 'critico')    AS periodos_criticos,
  -- Quantos períodos da semana só existem por causa do fallback. Semana com
  -- número alto aqui está descrevendo AIS ausente tanto quanto trabalho.
  count(*) FILTER (WHERE f.fonte <> 'ais')      AS periodos_por_manobra,
  round(max(f.duracao_h), 1)                    AS maior_jornada_h,
  -- O MAIOR descanso contínuo, não a soma. §20.3 da IMO: "Six 1-hour naps do
  -- not have the same benefit as one 6-hour period of sleep".
  round(max(f.folga_antes_h)::numeric, 1)       AS maior_folga_h,
  round(min(f.folga_antes_h)::numeric, 1)       AS menor_folga_h,
  count(*) FILTER (WHERE f.folga_antes_h < 6)   AS folgas_abaixo_de_6h
FROM folga f
GROUP BY f.ds_lancha, f.cd_lancha, f.semana_turma;

COMMENT ON VIEW public.v_fadiga_semana IS
  'Acumulado por lancha e semana de turma. A semana vira na TERCA as 08:00 locais, nao a meia-noite: a madrugada de terca pertence a turma que esta saindo. `maior_folga_h` e proposital — o §20.3 da IMO diz que descanso fragmentado nao se soma. `periodos_por_manobra` conta os que so existem pelo fallback de AIS cego. PROXY DA LANCHA, NAO DA PESSOA.';

GRANT SELECT ON public.v_fadiga_semana TO anon, authenticated;

-- A corrente diária não muda: sync 09:40 → classificada 09:45 → cobertura
-- 09:50 → base 10:00 → saídas 10:10 → fadiga 10:20 (UTC). O job já existe e
-- aponta para o nome da matview, que foi recriado com o mesmo nome.

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────
--
-- 1) A Taiba entrou, e so por fallback:
-- SELECT ds_lancha, fonte, count(*), round(avg(duracao_h),2) AS jornada_media
--   FROM public.mv_fadiga_periodos GROUP BY 1,2 ORDER BY 1,2;
--
-- 2) Nenhuma jornada absurda sobreviveu:
-- SELECT ds_lancha, max(duracao_h) FROM public.mv_fadiga_periodos GROUP BY 1;
--
-- 3) A semana vira as 08:00 — jornada de terca de madrugada fica na semana
--    ANTERIOR ao proprio dia:
-- SELECT inicio_trabalho AT TIME ZONE 'America/Fortaleza' AS local, semana_turma
--   FROM public.mv_fadiga_periodos
--  WHERE EXTRACT(dow FROM (inicio_trabalho AT TIME ZONE 'America/Fortaleza')) = 2
--    AND EXTRACT(hour FROM (inicio_trabalho AT TIME ZONE 'America/Fortaleza')) < 8
--  ORDER BY inicio_trabalho DESC LIMIT 5;
