-- ─────────────────────────────────────────────────────────────────────────────
-- Fadiga medida por MOVIMENTO, e não por "fora da base"
--
-- SUBSTITUI v_fadiga_periodos e v_fadiga_semana de 20260922200000.
--
-- ─── O ERRO QUE ESTA MIGRATION CONSERTA ──────────────────────────────────────
--
-- A primeira versao montava o periodo de trabalho a partir das SAIDAS, isto e,
-- de "fora da base". Resultado, em agosto/2026:
--
--     jornada maxima FORTIM      153,8 h
--     jornada maxima FLEXEIRAS    84,3 h
--     e na serie inteira, um periodo de 1.403,8 h
--
-- Nenhuma guarnicao trabalha 153 horas seguidas. Dois fenomenos diferentes
-- estavam inflando o numero, e so um era falha de dado:
--
--   · TEMPO CEGO. 13 periodos tem mais de 50% de AIS apagado. O de 1.403,8 h
--     tem 1.400,8 h de cego e 0,7 h de movimento.
--
--   · ESPERA PARADA, que NAO e falha nenhuma. O quarto periodo mais longo tem
--     119,2 h com apenas 5% de cego e 14,3 h de movimento: a lancha ficou
--     mesmo fora da base cinco dias, parada no ponto de espera do Pecem que
--     nao esta cercado. O dado esta certo; a interpretacao e que estava errada.
--
-- A propria nota de fadiga da gestao ja dizia o criterio: "sempre que estao em
-- MOVIMENTO, quer dizer que a tripulacao esta em atividade". A separacao
-- parada/movimento existia desde 22/09 e nao tinha sido aplicada aqui.
--
-- ─── COMO O PERIODO E MONTADO AGORA ──────────────────────────────────────────
--
-- Parte das POSICOES em movimento (fora da base e acima de 1 kn), nao das
-- saidas. Posicoes cujas janelas expandidas em `delta_min` se tocam formam um
-- periodo; um intervalo maior que 2 x delta o encerra.
--
-- Isso resolve os dois casos de uma vez, sem regra especial:
--   · lancha parada dias no Pecem nao gera movimento, entao o periodo fecha
--   · AIS apagado nao gera posicao, entao o periodo fecha
--
-- ⚠️ MATERIALIZADA. Varre as 719 mil posicoes classificadas; como view comum
--    refaria isso a cada consulta da tela. Entra no fim da corrente diaria.
--
-- ─── LIMIARES, todos da MSC.1/Circ.1598 da IMO (2019) ────────────────────────
--
--   12 h  "Accident rates rise exponentially after 12 hours of consecutive
--         work, particularly when working at night" (Modulo 1, §34)
--   16 h  a partir de ~16 h continuas acordado a pressao de sono e alta (§33)
--   03-05 window of circadian low (§27)
--   00-06 faixa em que os incidentes maritimos se concentram (§28)
--
-- ⚠️ delta_min = 60 min e PROVISORIO. A gestao ainda vai definir quanto tempo
--    de preparacao antes e de encerramento depois somar. O Modulo 2 §27.2 da
--    IMO fundamenta que esse tempo existe; o valor e operacional. Esta gravado
--    na linha — trocar no CTE `par` e recriar muda tudo.
--
-- ⚠️ PROXY DA LANCHA, NAO DA PESSOA. Nao ha tabela de tripulacao no banco.
--    "A Fortim trabalhou 14 h" nao diz quem estava a bordo.
--
-- ⚠️ Modulo 2 §32: ferramentas de fadiga "nao devem ser usadas isoladamente nem
--    ser o principal condutor das decisoes de escala". Aponta ponto quente.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_fadiga_semana;
DROP VIEW IF EXISTS public.v_fadiga_periodos;
DROP MATERIALIZED VIEW IF EXISTS public.mv_fadiga_periodos;

CREATE MATERIALIZED VIEW public.mv_fadiga_periodos AS
WITH par AS (
  SELECT 60 AS delta_min, 1.0::double precision AS limiar_parada_kn, 30 AS limiar_min
),
-- Só posição em MOVIMENTO fora da base. Manobra dentro do berço fica de fora
-- de propósito: o delta-t já cobre preparação e encerramento.
mov AS (
  SELECT c.cd_lancha, c.ds_lancha, c.dh_posicao, c.prox_t,
         lag(c.dh_posicao) OVER (PARTITION BY c.cd_lancha ORDER BY c.dh_posicao) AS ant_t
    FROM public.mv_ais_pos_classificada c
   WHERE NOT c.na_base
     AND COALESCE(c.sog_efetivo, 999) >= (SELECT limiar_parada_kn FROM par)
),
ilha AS (
  SELECT m.*,
         sum(CASE WHEN m.ant_t IS NULL
                   OR (m.dh_posicao - m.ant_t) > 2 * (SELECT delta_min FROM par) * interval '1 minute'
                  THEN 1 ELSE 0 END)
           OVER (PARTITION BY m.cd_lancha ORDER BY m.dh_posicao ROWS UNBOUNDED PRECEDING) AS per
    FROM mov m
),
bloco AS (
  SELECT i.cd_lancha,
         max(i.ds_lancha) AS ds_lancha,
         i.per,
         (min(i.dh_posicao) - (SELECT delta_min FROM par) * interval '1 minute') AS inicio_trabalho,
         (max(i.dh_posicao) + (SELECT delta_min FROM par) * interval '1 minute') AS fim_trabalho,
         count(*) AS n_posicoes,
         -- Só intervalos curtos entram como movimento observado; acima do
         -- limiar é buraco, e buraco não é trabalho comprovado.
         COALESCE(sum(EXTRACT(epoch FROM (i.prox_t - i.dh_posicao)))
           FILTER (WHERE (i.prox_t - i.dh_posicao)
                         <= (SELECT limiar_min FROM par) * interval '1 minute'), 0) / 3600.0
           AS h_movimento
    FROM ilha i
   GROUP BY i.cd_lancha, i.per
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
)
SELECT
  b.ds_lancha,
  b.cd_lancha,
  b.per AS nr_periodo,
  b.inicio_trabalho,
  b.fim_trabalho,
  (b.inicio_trabalho AT TIME ZONE 'America/Fortaleza')::date AS dia_inicio,
  -- Semana da turma ancorada na TERÇA, quando a guarnição troca.
  ((b.inicio_trabalho AT TIME ZONE 'America/Fortaleza')::date
    - ((EXTRACT(dow FROM (b.inicio_trabalho AT TIME ZONE 'America/Fortaleza'))::int - 2 + 7) % 7)
    * interval '1 day')::date AS semana_turma,
  round((EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0)::numeric, 2) AS duracao_h,
  round(b.h_movimento::numeric, 2) AS horas_movimento,
  b.n_posicoes,
  round(COALESCE(j.h_wocl, 0)::numeric, 2)      AS horas_wocl,
  round(COALESCE(j.h_madrugada, 0)::numeric, 2) AS horas_madrugada,
  -- Quanto da jornada é movimento de fato. Jornada longa com pouquíssimo
  -- movimento é sinal de espera longa no meio, não de esforço contínuo.
  round((100.0 * b.h_movimento
         / NULLIF(EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0, 0))::numeric, 0)
    AS densidade_pct,
  (EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12) AS excede_12h,
  (EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 16) AS excede_16h,
  (COALESCE(j.h_wocl, 0) > 0) AS atravessa_wocl,
  -- 'critico' é a combinação que o §34 nomeia: jornada longa E noite. Não é
  -- severidade calculada por nós, é a regra do guia aplicada.
  CASE
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 16 THEN 'critico'
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12
         AND COALESCE(j.h_madrugada, 0) > 0                                      THEN 'critico'
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12 THEN 'atencao'
    WHEN COALESCE(j.h_wocl, 0) > 0                                               THEN 'atencao'
    ELSE 'normal'
  END AS grau,
  (SELECT delta_min FROM par)        AS delta_min,
  (SELECT limiar_parada_kn FROM par) AS limiar_parada_kn
FROM bloco b
LEFT JOIN janelas j ON j.cd_lancha = b.cd_lancha AND j.per = b.per;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_fadiga_pk
  ON public.mv_fadiga_periodos (cd_lancha, nr_periodo);
CREATE INDEX IF NOT EXISTS idx_mv_fadiga_dia
  ON public.mv_fadiga_periodos (dia_inicio);
CREATE INDEX IF NOT EXISTS idx_mv_fadiga_semana
  ON public.mv_fadiga_periodos (semana_turma);

COMMENT ON MATERIALIZED VIEW public.mv_fadiga_periodos IS
  'Períodos de trabalho montados a partir do MOVIMENTO da lancha (fora da base e acima de 1 kn), expandidos em delta_min antes e depois. Não use "fora da base" para isto: a lancha fica dias parada num ponto de espera do Pecém sem cerca, e a jornada ia a 153 h. Limiares da MSC.1/Circ.1598 da IMO. PROXY DA LANCHA, NÃO DA PESSOA.';

GRANT SELECT ON public.mv_fadiga_periodos TO anon, authenticated;


-- ═══ A semana da turma, de terça a terça ══════════════════════════════════════

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
  round(max(f.duracao_h), 1)                    AS maior_jornada_h,
  -- O MAIOR descanso contínuo, não a soma. O §20.3 da IMO é explícito: "Six
  -- 1-hour naps do not have the same benefit as one 6-hour period of sleep".
  -- Somar folgas esconderia exatamente o padrão que o encadeamento produz.
  round(max(f.folga_antes_h)::numeric, 1)       AS maior_folga_h,
  round(min(f.folga_antes_h)::numeric, 1)       AS menor_folga_h,
  count(*) FILTER (WHERE f.folga_antes_h < 6)   AS folgas_abaixo_de_6h
FROM folga f
GROUP BY f.ds_lancha, f.cd_lancha, f.semana_turma;

COMMENT ON VIEW public.v_fadiga_semana IS
  'Acumulado por lancha e semana de turma (terça a terça). `maior_folga_h` é proposital: o §20.3 da IMO diz que descanso fragmentado não se soma. PROXY DA LANCHA, NÃO DA PESSOA.';

GRANT SELECT ON public.v_fadiga_semana TO anon, authenticated;

-- Último elo da corrente diária: sync 09:40 → classificada 09:45 → cobertura
-- 09:50 → base 10:00 → saídas 10:10 → fadiga 10:20 (UTC).
SELECT cron.unschedule('refresh-fadiga-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-fadiga-diario');

SELECT cron.schedule(
  'refresh-fadiga-diario',
  '20 10 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_fadiga_periodos$$
);
