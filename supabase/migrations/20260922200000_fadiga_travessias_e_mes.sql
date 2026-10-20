-- ─────────────────────────────────────────────────────────────────────────────
-- Fadiga, travessias entre portos, e o fechamento mensal
--
-- Quatro views comuns sobre mv_ais_saidas e mv_ais_base_dia, mais a remocao de
-- uma view morta. Nada aqui e pesado: o grao maior sao 4.151 episodios.
--
--   v_fadiga_periodos   períodos de trabalho da guarnicao, com os limiares IMO
--   v_fadiga_semana     o acumulado de cada turma, de terca a terca
--   v_ais_travessias    Mucuripe <-> Pecem, com velocidade por sentido
--   v_ais_mes           o fechamento mensal por lancha
--
-- ─── DE ONDE VEM CADA LIMIAR ─────────────────────────────────────────────────
--
-- Da MSC.1/Circ.1598 da IMO (Guidelines on Fatigue, 2019). Nao sao numeros
-- escolhidos por nos:
--
--   12 h  "Accident rates rise exponentially after 12 hours of consecutive
--         work, particularly when working at night" (Modulo 1, §34)
--   16 h  a partir de ~16 h continuas acordado a pressao de sono e alta (§33)
--   03-05 window of circadian low, o fundo do relogio biologico (§27)
--   00-06 faixa em que os incidentes maritimos se concentram (§28)
--
-- E uma decisao de modelagem que o guia resolve, §20.3: "Six 1-hour naps do
-- not have the same benefit as one 6-hour period of sleep". Por isso
-- `v_fadiga_semana` mede o MAIOR descanso continuo, e nao a soma dos
-- descansos — somar esconde exatamente o padrao que o encadeamento de manobras
-- produz.
--
-- ─── O DELTA-T DE 1 HORA ─────────────────────────────────────────────────────
--
-- A lancha sair do berco nao marca o inicio do trabalho: antes ha preparacao, e
-- depois de atracar a tripulacao nao "desliga". O Modulo 2, §27.2 da IMO
-- fundamenta isso — o intervalo entre turnos precisa comportar comer, banho,
-- convivio e a inercia do sono.
--
-- ⚠️ 1 h ANTES E 1 H DEPOIS E UM PADRAO PROVISORIO, nao uma medicao. A gestao
--    ainda vai definir o numero real. Esta gravado em `delta_min` na propria
--    linha: trocar o valor no CTE `par` e recriar a view muda tudo, sem refazer
--    nada mais.
--
-- Saidas cujas janelas expandidas se tocam viram UM periodo de trabalho. Duas
-- manobras separadas por 40 min de berco nao sao dois turnos.
--
-- ⚠️ ESTA E UMA PROXY DA LANCHA, NAO DA PESSOA. Nao existe tabela de tripulacao
--    no banco — o unico vestigio e o campo `mestre` em provas_mar, vazio em 168
--    de 184 linhas. Enquanto isso nao existir, "a guarnicao da Fortim trabalhou
--    14 h" significa "a Fortim esteve em atividade 14 h". A troca de turma as
--    tercas ancora a semana, mas nao diz quem estava a bordo.
--
-- ⚠️ E o proprio guia impoe um limite, Modulo 2 §32: ferramentas de previsao de
--    fadiga "nao devem ser usadas isoladamente nem ser o principal condutor das
--    decisoes de escala". Isto aponta ponto quente; nao julga tripulante.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ Limpeza: view morta ══════════════════════════════════════════════════════
-- v_ais_cercas cruzava posicao x cerca linha a linha, sem indice de apoio.
-- Foi superada por mv_ais_pos_classificada e hoje so devolve timeout (500) se
-- alguem consultar inteira. Nao e referenciada pelo frontend nem pelas edge
-- functions.
DROP VIEW IF EXISTS public.v_ais_cercas;


-- ═══ 1. Periodos de trabalho ══════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_fadiga_periodos AS
WITH par AS (
  SELECT 60 AS delta_min
),
s AS (
  SELECT sa.cd_lancha, sa.ds_lancha, sa.inicio, sa.fim,
         sa.horas_movimento, sa.horas_nao_resolvidas, sa.travessia, sa.n_manobras,
         (sa.inicio - (SELECT delta_min FROM par) * interval '1 minute') AS ini_exp,
         (sa.fim    + (SELECT delta_min FROM par) * interval '1 minute') AS fim_exp
    -- v_ais_saida_motivo, e nao mv_ais_saidas: so ela traz `n_manobras`, que e
    -- o que liga o periodo de trabalho a atividade-fim.
    FROM public.v_ais_saida_motivo sa
   WHERE NOT sa.curta_e_perto
     AND NOT sa.em_aberto
),
-- Ilhas: novo periodo quando a janela expandida nao encosta na anterior.
-- O quadro so cresce, entao o custo e linear (ver a nota em mv_ais_saidas
-- sobre min/max nao terem funcao de transicao inversa).
marc AS (
  SELECT s.*,
         max(s.fim_exp) OVER (PARTITION BY s.cd_lancha ORDER BY s.inicio
                              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS fim_ant
    FROM s
),
ilha AS (
  SELECT marc.*,
         sum(CASE WHEN marc.fim_ant IS NULL OR marc.ini_exp > marc.fim_ant THEN 1 ELSE 0 END)
           OVER (PARTITION BY marc.cd_lancha ORDER BY marc.inicio ROWS UNBOUNDED PRECEDING) AS per
    FROM marc
),
bloco AS (
  SELECT i.cd_lancha,
         max(i.ds_lancha)    AS ds_lancha,
         i.per,
         min(i.ini_exp)      AS inicio_trabalho,
         max(i.fim_exp)      AS fim_trabalho,
         count(*)            AS n_saidas,
         sum(i.n_manobras)   AS n_manobras,
         sum(i.horas_movimento)      AS horas_movimento,
         sum(i.horas_nao_resolvidas) AS horas_nao_resolvidas,
         bool_or(i.travessia)        AS teve_travessia
    FROM ilha i
   GROUP BY i.cd_lancha, i.per
),
-- Horas do periodo que caem nas janelas de risco, dia local a dia local.
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
  -- Semana da turma: ancorada na TERCA, que e quando a guarnicao troca.
  ((b.inicio_trabalho AT TIME ZONE 'America/Fortaleza')::date
    - ((EXTRACT(dow FROM (b.inicio_trabalho AT TIME ZONE 'America/Fortaleza'))::int - 2 + 7) % 7)
    * interval '1 day')::date AS semana_turma,
  round((EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0)::numeric, 2) AS duracao_h,
  b.n_saidas,
  b.n_manobras,
  round(b.horas_movimento::numeric, 2)      AS horas_movimento,
  round(b.horas_nao_resolvidas::numeric, 2) AS horas_nao_resolvidas,
  b.teve_travessia,
  round(COALESCE(j.h_wocl, 0)::numeric, 2)      AS horas_wocl,
  round(COALESCE(j.h_madrugada, 0)::numeric, 2) AS horas_madrugada,
  -- Os dois patamares da IMO.
  (EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12) AS excede_12h,
  (EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 16) AS excede_16h,
  (COALESCE(j.h_wocl, 0) > 0) AS atravessa_wocl,
  -- Grau de atencao. 'critico' e a combinacao que o §34 nomeia: jornada longa
  -- E noite. Nao e severidade calculada, e a regra do guia aplicada.
  CASE
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 16 THEN 'critico'
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12
         AND COALESCE(j.h_madrugada, 0) > 0                                      THEN 'critico'
    WHEN EXTRACT(epoch FROM (b.fim_trabalho - b.inicio_trabalho)) / 3600.0 >= 12 THEN 'atencao'
    WHEN COALESCE(j.h_wocl, 0) > 0                                               THEN 'atencao'
    ELSE 'normal'
  END AS grau,
  (SELECT delta_min FROM par) AS delta_min
FROM bloco b
LEFT JOIN janelas j ON j.cd_lancha = b.cd_lancha AND j.per = b.per;

COMMENT ON VIEW public.v_fadiga_periodos IS
  'Periodos de trabalho da lancha: saidas cujas janelas expandidas em delta_min (1 h antes e depois, provisorio) se tocam viram um periodo so. Limiares da MSC.1/Circ.1598 da IMO: 12 h, 16 h, WOCL 03-05 e madrugada 00-06. PROXY DA LANCHA, NAO DA PESSOA — nao ha tabela de tripulacao no banco.';

GRANT SELECT ON public.v_fadiga_periodos TO anon, authenticated;


-- ═══ 2. A semana da turma, de terca a terca ═══════════════════════════════════

CREATE OR REPLACE VIEW public.v_fadiga_semana AS
WITH p AS (
  SELECT * FROM public.v_fadiga_periodos
),
-- Descanso entre periodos consecutivos. O §20.3 da IMO e explicito: descanso
-- fragmentado nao se soma. Por isso guardamos o MAIOR intervalo continuo, e
-- tambem quantas vezes o descanso ficou abaixo de 6 h.
folga AS (
  SELECT p.*,
         EXTRACT(epoch FROM (p.inicio_trabalho
           - lag(p.fim_trabalho) OVER (PARTITION BY p.cd_lancha ORDER BY p.inicio_trabalho))) / 3600.0
           AS folga_antes_h
    FROM p
)
SELECT
  f.ds_lancha,
  f.cd_lancha,
  f.semana_turma,
  count(*)                                   AS periodos_trabalho,
  sum(f.n_saidas)                            AS saidas,
  sum(f.n_manobras)                          AS manobras,
  round(sum(f.duracao_h), 1)                 AS horas_trabalho,
  round(sum(f.horas_movimento), 1)           AS horas_movimento,
  round(sum(f.horas_madrugada), 1)           AS horas_madrugada,
  round(sum(f.horas_wocl), 1)                AS horas_wocl,
  count(*) FILTER (WHERE f.horas_madrugada > 0) AS noites_trabalhadas,
  count(*) FILTER (WHERE f.excede_12h)       AS periodos_acima_12h,
  count(*) FILTER (WHERE f.excede_16h)       AS periodos_acima_16h,
  count(*) FILTER (WHERE f.grau = 'critico') AS periodos_criticos,
  round(max(f.duracao_h), 1)                 AS maior_jornada_h,
  -- O maior descanso continuo da semana. Seis folgas de 1 h nao valem uma de 6.
  round(max(f.folga_antes_h)::numeric, 1)    AS maior_folga_h,
  round(min(f.folga_antes_h)::numeric, 1)    AS menor_folga_h,
  count(*) FILTER (WHERE f.folga_antes_h < 6) AS folgas_abaixo_de_6h
FROM folga f
GROUP BY f.ds_lancha, f.cd_lancha, f.semana_turma;

COMMENT ON VIEW public.v_fadiga_semana IS
  'Acumulado por lancha e por semana de turma (terca a terca, quando a guarnicao troca). `maior_folga_h` e proposital: o §20.3 da IMO diz que descanso fragmentado nao se soma, entao a soma das folgas enganaria. PROXY DA LANCHA, NAO DA PESSOA.';

GRANT SELECT ON public.v_fadiga_semana TO anon, authenticated;


-- ═══ 3. Travessias entre portos, com velocidade ═══════════════════════════════

CREATE OR REPLACE VIEW public.v_ais_travessias AS
WITH t AS (
  SELECT sa.*
    FROM public.mv_ais_saidas sa
   WHERE sa.travessia AND NOT sa.em_aberto
),
vel AS (
  SELECT t.cd_lancha, t.nr_saida,
         avg(c.sog_efetivo)    FILTER (WHERE c.sog_efetivo >= 1) AS sog_medio,
         max(c.sog_efetivo)                                      AS sog_max,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY c.sog_efetivo)
           FILTER (WHERE c.sog_efetivo >= 1)                     AS sog_mediano,
         count(*) FILTER (WHERE c.sog_efetivo >= 1)              AS n_pos_navegando
    FROM t
    JOIN public.mv_ais_pos_classificada c
      ON c.cd_lancha = t.cd_lancha
     AND c.dh_posicao >= t.inicio
     AND c.dh_posicao <= t.fim
   GROUP BY t.cd_lancha, t.nr_saida
)
SELECT
  t.ds_lancha,
  t.cd_lancha,
  t.nr_saida,
  t.inicio,
  t.fim,
  t.dia_inicio,
  t.noturna,
  t.base_origem,
  t.base_destino,
  CASE
    WHEN t.base_origem = 'mucuripe_base' AND t.base_destino = 'pecem_base'    THEN 'Mucuripe → Pecém'
    WHEN t.base_origem = 'pecem_base'    AND t.base_destino = 'mucuripe_base' THEN 'Pecém → Mucuripe'
    ELSE COALESCE(t.base_origem, '?') || ' → ' || COALESCE(t.base_destino, '?')
  END AS sentido,
  t.duracao_h,
  t.horas_movimento,
  t.horas_parada,
  t.horas_nao_resolvidas,
  t.cobertura_pct,
  round(v.sog_medio::numeric, 1)   AS sog_medio,
  round(v.sog_mediano::numeric, 1) AS sog_mediano,
  round(v.sog_max::numeric, 1)     AS sog_max,
  v.n_pos_navegando
FROM t
LEFT JOIN vel v ON v.cd_lancha = t.cd_lancha AND v.nr_saida = t.nr_saida;

COMMENT ON VIEW public.v_ais_travessias IS
  'Travessias Mucuripe <-> Pecem detectadas pelo AIS, com estatistica de velocidade por sentido. ATENCAO: use MEDIANA, nao media — ha episodios em que o AIS apagou no caminho e a duracao vai a centenas de horas (o maximo da serie e 1.401 h). A media de duracao nao significa nada aqui.';

GRANT SELECT ON public.v_ais_travessias TO anon, authenticated;


-- ═══ 4. Fechamento mensal por lancha ══════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_ais_mes AS
WITH d AS (
  SELECT to_char(b.dia, 'YYYY-MM') AS ano_mes,
         b.cd_lancha, b.ds_lancha,
         sum(b.horas_base)            AS h_base,
         sum(b.horas_mucuripe)        AS h_mucuripe,
         sum(b.horas_pecem)           AS h_pecem,
         sum(b.horas_fora_movimento)  AS h_movimento,
         sum(b.horas_fora_parada)     AS h_parada,
         sum(b.horas_nao_resolvidas)  AS h_cego,
         sum(b.horas_iate_clube)      AS h_iate,
         count(*)                     AS dias
    FROM public.mv_ais_base_dia b
   GROUP BY 1, 2, 3
),
sa AS (
  SELECT to_char(s.dia_inicio, 'YYYY-MM') AS ano_mes,
         s.cd_lancha,
         count(*) FILTER (WHERE NOT s.curta_e_perto)                  AS saidas,
         count(*) FILTER (WHERE NOT s.curta_e_perto AND s.noturna)    AS saidas_noturnas,
         count(*) FILTER (WHERE s.travessia)                          AS travessias,
         count(*) FILTER (WHERE s.passou_iate_clube)                  AS passagens_iate
    FROM public.mv_ais_saidas s
   GROUP BY 1, 2
)
SELECT
  d.ano_mes,
  d.ds_lancha,
  d.cd_lancha,
  d.dias,
  round(d.h_base::numeric, 1)       AS horas_base,
  round(d.h_mucuripe::numeric, 1)   AS horas_mucuripe,
  round(d.h_pecem::numeric, 1)      AS horas_pecem,
  round(d.h_movimento::numeric, 1)  AS horas_movimento,
  round(d.h_parada::numeric, 1)     AS horas_parada,
  round(d.h_cego::numeric, 1)       AS horas_nao_resolvidas,
  round(d.h_iate::numeric, 2)       AS horas_iate_clube,
  round((100.0 * (d.h_base + d.h_movimento + d.h_parada)
         / NULLIF(d.h_base + d.h_movimento + d.h_parada + d.h_cego, 0))::numeric, 1) AS cobertura_pct,
  -- Quanto do tempo de BASE foi no Pecem. O §3 da lista de ideias adverte que a
  -- metrica abaixo oscila conforme a lancha passe o mes num porto ou no outro;
  -- esta coluna existe para essa oscilacao ficar visivel ao lado do numero, em
  -- vez de explicar depois por que ele mudou.
  round((100.0 * d.h_pecem / NULLIF(d.h_mucuripe + d.h_pecem, 0))::numeric, 0) AS share_pecem_pct,
  -- ⚠️ MOVIMENTO sobre base, nao "fora" sobre base: `horas_parada` inclui a
  --    espera num ponto do Pecem que nao esta cercado, e somaria espera ao
  --    numerador como se fosse operacao.
  round((d.h_movimento / NULLIF(d.h_base, 0))::numeric, 3) AS razao_movimento_base,
  COALESCE(sa.saidas, 0)          AS saidas,
  COALESCE(sa.saidas_noturnas, 0) AS saidas_noturnas,
  COALESCE(sa.travessias, 0)      AS travessias,
  COALESCE(sa.passagens_iate, 0)  AS passagens_iate_clube
FROM d
LEFT JOIN sa ON sa.ano_mes = d.ano_mes AND sa.cd_lancha = d.cd_lancha;

COMMENT ON VIEW public.v_ais_mes IS
  'Fechamento mensal por lancha. `razao_movimento_base` usa MOVIMENTO, nao "fora": o tempo parado fora inclui espera num ponto do Pecem sem cerca. `share_pecem_pct` fica ao lado porque a razao oscila conforme a lancha passe o mes num porto ou no outro — era a ressalva do §3 da lista de ideias.';

GRANT SELECT ON public.v_ais_mes TO anon, authenticated;
