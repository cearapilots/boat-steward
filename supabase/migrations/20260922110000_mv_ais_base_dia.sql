-- ─────────────────────────────────────────────────────────────────────────────
-- mv_ais_base_dia — o dia de cada lancha: base, fora, e quanto disso foi cego
--
-- ARQUIVO 2 DE 3. Rode o 20260922100000_mv_ais_pos_classificada.sql antes.
--
-- Esta versao SUBSTITUI a de 20260921200000_ais_buffer_base_50m.sql. Nao toca
-- PostGIS: le a classificacao ja pronta da camada anterior.
--
--     horas_base + horas_fora + horas_nao_resolvidas = 24 h
--     horas_fora = horas_fora_movimento + horas_fora_parada
--
-- ─── A NOVIDADE: FORA NAO E O MESMO QUE EM OPERACAO ──────────────────────────
--
-- Cruzar o AIS com o horimetro de motor (indicadores_ativos) em agosto/2026
-- mostrou que a coluna `horas_fora`, sozinha, engana:
--
--     FLEXEIRAS   fora 194,4 h  =  parada  94,1 h  +  movimento 100,3 h
--     FORTIM      fora 283,0 h  =  parada 182,5 h  +  movimento 100,6 h
--
-- As duas lanchas se movimentam praticamente o mesmo. A diferenca de 88,6 h,
-- que parecia "a Fortim trabalha muito mais", e tempo SENTADO — quase todo num
-- aglomerado a ~550 m ao norte do berco do Pecem, fora de todas as cercas.
--
-- ⚠️ NAO INVENTAMOS UMA CERCA PARA ESSE PONTO. O aglomerado se espalha por
--    ~600 m nos dois eixos, em 151 celulas de 110 m, com um segundo foco a
--    sudeste. Isso e a bacia do porto, nao um berco. Um poligono desenhado por
--    nos embutiria um palpite dentro do numero. A separacao parada/movimento e
--    MEDIDA. Se um dia chegar o KMZ do ponto de espera, ele entra como cerca
--    versionada normal e esta view continua valendo sem alteracao.
--
-- ⚠️ PARA PUBLICAR "TEMPO EM OPERACAO", USE horas_fora_movimento. A coluna
--    horas_fora inclui espera. Foi o erro que quase saiu num numero para a
--    gestao.
--
-- ─── LIMIAR DE PARADA: 1,0 kn ────────────────────────────────────────────────
--
-- Horas em movimento fora da base, agosto/2026, por limiar testado:
--
--       0,5 kn → 123,5 / 125,3        1,5 kn →  87,8 /  82,1
--       1,0 kn → 100,3 / 100,6        2,0 kn →  84,0 /  75,6
--                                     3,0 kn →  80,0 /  69,4
--
-- Ate 1,0 kn as duas lanchas praticamente coincidem; acima disso divergem, o
-- que sugere que ali ja se comeca a cortar deslocamento lento real (entrada e
-- saida de berco, aproximacao de navio). Gravado na linha para ser auditavel.
--
-- ⚠️ O HORIMETRO NAO VALIDA ESSA COLUNA. Em agosto ele marcou 189,1 h
--    (Flexeiras) e 206,2 h (Fortim) — perto do tempo FORA, nao do tempo em
--    movimento. Lancha de pratico espera com maquina rodando. O horimetro
--    valida `horas_fora`; nao use para conferir `horas_fora_movimento`.
--
-- ─── O QUE FICOU IGUAL, e continua valendo ───────────────────────────────────
--
-- TRANSICAO PERTENCE AO ESTADO ANTERIOR: o intervalo entre duas posicoes e
-- atribuido ao estado da primeira. Com posicao a cada 2 a 3 min, o erro maximo
-- por transicao e de 3 minutos.
--
-- IATE CLUBE CONTA COMO FORA, em coluna propria e SUBCONJUNTO de horas_fora.
-- Nao e base — e area de evento, nao estadia. Em agosto foram 2,47 h da
-- Flexeiras e 0,95 h da Fortim: travessia, nao permanencia.
--
-- BORDAS DA SERIE: o primeiro e o ultimo dia de cada lancha nao fecham em 24 h.
-- Antes da primeira posicao e depois da ultima nao existe par para medir, e a
-- linha curta e preferivel a inventar 24 h de nada. Todo o periodo de interesse
-- e interior a serie.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ais_base_dia;

CREATE MATERIALIZED VIEW public.mv_ais_base_dia AS
WITH par AS (
  SELECT 30 AS limiar_min, 1.0::double precision AS limiar_parada_kn
),
segmentos AS (
  SELECT c.cd_lancha,
         c.ds_lancha,
         d::date AS dia,
         GREATEST(c.dh_posicao, (d::timestamp AT TIME ZONE 'America/Fortaleza'))                 AS ini,
         LEAST(c.prox_t, ((d::timestamp + interval '1 day') AT TIME ZONE 'America/Fortaleza'))   AS fim,
         CASE
           WHEN (c.prox_t - c.dh_posicao) > (SELECT limiar_min FROM par) * interval '1 minute'
                THEN 'nao_resolvido'
           -- `na_base` ja resolve por PAPEL, nao por codigo: uma base nova
           -- cadastrada amanha entra em horas_base sozinha, em vez de cair
           -- calada em "fora" e fazer a metrica mentir sem avisar.
           WHEN c.na_base THEN 'base'
           -- sog_efetivo nulo (nem SOG nem reserva) conta como movimento:
           -- numa metrica de fadiga, deixar de contar trabalho e o erro pior.
           WHEN COALESCE(c.sog_efetivo, 999) < (SELECT limiar_parada_kn FROM par)
                THEN 'fora_parada'
           ELSE 'fora_movimento'
         END AS estado,
         c.cerca
    FROM public.mv_ais_pos_classificada c
    CROSS JOIN LATERAL generate_series(
           (c.dh_posicao AT TIME ZONE 'America/Fortaleza')::date,
           (c.prox_t     AT TIME ZONE 'America/Fortaleza')::date,
           interval '1 day') AS d
   WHERE c.prox_t IS NOT NULL
),
horas AS (
  SELECT s.cd_lancha,
         s.dia,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'base')           AS s_base,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'fora_parada')    AS s_par,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'fora_movimento') AS s_mov,
         sum(EXTRACT(epoch FROM (s.fim - s.ini))) FILTER (WHERE s.estado = 'nao_resolvido')  AS s_nao,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'base' AND s.cerca = 'mucuripe_base')                    AS s_muc,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado = 'base' AND s.cerca = 'pecem_base')                       AS s_pec,
         sum(EXTRACT(epoch FROM (s.fim - s.ini)))
           FILTER (WHERE s.estado LIKE 'fora%' AND s.cerca = 'iate_clube')                   AS s_iate
    FROM segmentos s
   WHERE s.fim > s.ini
   GROUP BY 1, 2
),
contagem AS (
  SELECT c.cd_lancha,
         (c.dh_posicao AT TIME ZONE 'America/Fortaleza')::date AS dia,
         count(*) AS n_posicoes
    FROM public.mv_ais_pos_classificada c
   GROUP BY 1, 2
),
limites AS (
  SELECT c.cd_lancha,
         max(c.ds_lancha) AS ds_lancha,
         min((c.dh_posicao AT TIME ZONE 'America/Fortaleza')::date) AS d0,
         max((c.dh_posicao AT TIME ZONE 'America/Fortaleza')::date) AS d1
    FROM public.mv_ais_pos_classificada c
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
  -- horas_fora segue sendo o total; as duas seguintes o abrem.
  round(((COALESCE(h.s_par, 0) + COALESCE(h.s_mov, 0)) / 3600.0)::numeric, 2) AS horas_fora,
  round((COALESCE(h.s_mov, 0)  / 3600.0)::numeric, 2) AS horas_fora_movimento,
  round((COALESCE(h.s_par, 0)  / 3600.0)::numeric, 2) AS horas_fora_parada,
  round((COALESCE(h.s_iate, 0) / 3600.0)::numeric, 2) AS horas_iate_clube,
  -- Dia sem posicao nenhuma e 24 h nao resolvidas, nao zero.
  CASE WHEN COALESCE(c.n_posicoes, 0) = 0
       THEN 24.00
       ELSE round((COALESCE(h.s_nao, 0) / 3600.0)::numeric, 2)
  END AS horas_nao_resolvidas,
  (SELECT limiar_min       FROM par) AS limiar_min,
  (SELECT limiar_parada_kn FROM par) AS limiar_parada_kn
FROM espinha e
LEFT JOIN contagem c ON c.cd_lancha = e.cd_lancha AND c.dia = e.dia
LEFT JOIN horas    h ON h.cd_lancha = e.cd_lancha AND h.dia = e.dia;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ais_base_pk
  ON public.mv_ais_base_dia (cd_lancha, dia);
CREATE INDEX IF NOT EXISTS idx_mv_ais_base_dia
  ON public.mv_ais_base_dia (dia);

COMMENT ON MATERIALIZED VIEW public.mv_ais_base_dia IS
  'Horas por dia local na base, fora (aberta em movimento e parada) e nao resolvidas. ATENCAO: horas_fora inclui espera parada fora da cerca — ha um ponto de espera no Pecem que nao esta cercado. Para medir OPERACAO use horas_fora_movimento. horas_iate_clube e subconjunto de horas_fora. Nunca publique horas_fora sem horas_nao_resolvidas ao lado. A Taiba nao aparece: nao tem MMSI.';

GRANT SELECT ON public.mv_ais_base_dia TO anon, authenticated;

SELECT cron.unschedule('refresh-ais-base-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ais-base-diario');

SELECT cron.schedule(
  'refresh-ais-base-diario',
  '0 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ais_base_dia$$
);

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) FECHAMENTO EM 24 h, com a fora aberta em duas. ESPERADO: total 744 h;
--    movimento ~100 h para AS DUAS lanchas; parada ~94 h na Flexeiras e ~182 h
--    na Fortim.
--
-- SELECT ds_lancha,
--        round(sum(horas_base), 1)           AS base_h,
--        round(sum(horas_fora_movimento), 1) AS movimento_h,
--        round(sum(horas_fora_parada), 1)    AS parada_h,
--        round(sum(horas_nao_resolvidas), 1) AS nao_resolvido_h,
--        round(sum(horas_base + horas_fora + horas_nao_resolvidas), 1) AS total_h
--   FROM public.mv_ais_base_dia
--  WHERE dia BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1 ORDER BY 1;

-- 2) A SOMA DAS PARTES E O TODO. ZERO linhas.
--
-- SELECT * FROM public.mv_ais_base_dia
--  WHERE abs(horas_fora - (horas_fora_movimento + horas_fora_parada)) > 0.02;

-- 3) RECONCILIACAO COM A COBERTURA. Passou em 1.260 dias nas versoes
--    anteriores e precisa continuar passando. ZERO linhas.
--
-- SELECT b.ds_lancha, b.dia, c.horas_observadas, (b.horas_base + b.horas_fora)
--   FROM public.mv_ais_base_dia b
--   JOIN public.mv_ais_cobertura_dia c
--     ON c.cd_lancha = b.cd_lancha AND c.dia = b.dia
--  WHERE abs(c.horas_observadas     - (b.horas_base + b.horas_fora)) > 0.02
--     OR abs(c.horas_nao_resolvidas -  b.horas_nao_resolvidas)       > 0.02;

-- 4) BASE NOVA NAO DECLARADA. horas_base soma por papel, mucuripe e pecem somam
--    por codigo. Divergencia = existe uma terceira cerca de base que ninguem
--    colocou em coluna. Nao e bug, e aviso. ZERO linhas hoje.
--
-- SELECT dia, ds_lancha, horas_base, horas_mucuripe, horas_pecem
--   FROM public.mv_ais_base_dia
--  WHERE abs(horas_base - (horas_mucuripe + horas_pecem)) > 0.02;
