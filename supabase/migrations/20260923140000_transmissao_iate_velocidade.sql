-- ─────────────────────────────────────────────────────────────────────────────
-- Três itens da lista da gestão: falha de AIS, Iate Clube, velocidade
--
--   v_ais_falhas_transmissao  distingue AIS com defeito de queda esperada
--   v_ais_iate_clube          passagens pelo clube, por mês e lancha
--   v_ais_velocidade          perfil de velocidade por contexto
--   v_atividade_manutencao    janelas de manutenção como atividade da guarnição
--
-- ─── DECISÃO REGISTRADA: NÃO HAVERÁ CERCA NOVA NO PECÉM ──────────────────────
--
-- Em 23/09/2026 a gestão respondeu, depois de ver o KML com as posições
-- paradas sobre a imagem de satélite: "a priori, não vamos inserir outra
-- digital fence em Pecém".
--
-- A imagem mostrou o que os números não diziam: as posições paradas se alinham
-- AO LONGO DO PIER 3 / TMUT. As lanchas amarram no cais comercial — não é
-- fundeio nem área de espera, é atracação em berço de terceiros. Há ainda uma
-- nuvem difusa na bacia de evolução.
--
-- ⚠️ CONSEQUÊNCIA PERMANENTE, não um pendência: `horas_fora` continua incluindo
--    esse tempo amarrado. Quem publicar "tempo fora da base" como se fosse
--    operação vai errar por mais de 100 h/mês na Fortim. A coluna a publicar é
--    `horas_fora_movimento`. A `mv_ais_paradas_fora` fica como a evidência que
--    embasou a decisão.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ 1. Falha de transmissão: defeito ou queda esperada ═══════════════════════
--
-- O §1b da lista de ideias pede exatamente isto: "cautela nesse cálculo para
-- eventuais situações em que o AIS da lancha fique fora do ar por bastante
-- tempo (...) não confundir isso com os momentos que a transmissão sai do ar
-- durante travessia entre portos (acontece com frequência)".
--
-- A distinção usa `fainas_deslocamentos`, que registra início e fim de cada
-- travessia Mucuripe <-> Pecém e é independente do AIS.

CREATE OR REPLACE VIEW public.v_ais_falhas_transmissao AS
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
  EXISTS (
    SELECT 1 FROM public.fainas_deslocamentos f
     WHERE f.cd_lancha = b.cd_lancha
       AND f.dh_fim IS NOT NULL
       AND f.dh_inicio <= b.fim
       AND f.dh_fim    >= b.inicio
  ) AS dentro_de_faina,
  CASE
    -- Travessia registrada cobrindo o buraco: queda esperada, o documento já
    -- avisa que acontece com frequência no caminho entre os portos.
    WHEN EXISTS (
      SELECT 1 FROM public.fainas_deslocamentos f
       WHERE f.cd_lancha = b.cd_lancha AND f.dh_fim IS NOT NULL
         AND f.dh_inicio <= b.fim AND f.dh_fim >= b.inicio
    ) THEN 'queda_em_travessia'
    -- Atracada antes E depois: a lancha não saiu do lugar e mesmo assim sumiu.
    -- É o caso que interessa — transponder com problema.
    WHEN b.base_antes AND COALESCE(b.base_depois, false) THEN 'ais_com_defeito'
    ELSE 'indeterminado'
  END AS classe,
  -- O limiar de 6 h é o que a gestão pediu para o alerta, e está em
  -- configuracoes.ais_horas_sem_transmitir_alerta.
  (b.h >= 6) AS acima_do_alerta
FROM buracos b;

COMMENT ON VIEW public.v_ais_falhas_transmissao IS
  'Cada intervalo acima de 30 min sem posicao AIS, classificado: queda_em_travessia (ha faina registrada no periodo — esperado), ais_com_defeito (lancha atracada antes e depois, nao saiu do lugar e sumiu) ou indeterminado. Atende ao §1b da lista da gestao.';

GRANT SELECT ON public.v_ais_falhas_transmissao TO anon, authenticated;


-- ═══ 2. Iate Clube ════════════════════════════════════════════════════════════
--
-- ⚠️ AJUSTE A EXPECTATIVA ANTES DE OLHAR: em agosto/2026 foram 2,47 h da
--    Flexeiras e 0,95 h da Fortim no mês inteiro. O clube é travessia, não
--    estadia — das 24 passagens medidas entre 19 e 25/08, quinze duraram um
--    minuto ou menos.
--
-- O que a gestão queria de verdade aqui — percentual por comandante e cruzamento
-- com maré — não é possível: não existe tabela de tripulação nem série de maré
-- no banco.

CREATE OR REPLACE VIEW public.v_ais_iate_clube AS
SELECT
  to_char(s.dia_inicio, 'YYYY-MM') AS ano_mes,
  s.ds_lancha,
  s.cd_lancha,
  count(*)                                  AS passagens,
  count(*) FILTER (WHERE s.noturna)         AS noturnas,
  round(sum(s.horas_movimento), 2)          AS horas_movimento,
  round(avg(s.duracao_h), 2)                AS duracao_media_h,
  min(s.inicio)                             AS primeira,
  max(s.inicio)                             AS ultima
FROM public.mv_ais_saidas s
WHERE s.passou_iate_clube
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.v_ais_iate_clube IS
  'Saidas que passaram pela cerca do Iate Clube, por mes e lancha. Volume baixissimo por natureza: o clube e ponto de travessia, nao estadia. Percentual por comandante e cruzamento com mare NAO sao possiveis — nao ha tabela de tripulacao nem serie de mare no banco.';

GRANT SELECT ON public.v_ais_iate_clube TO anon, authenticated;


-- ═══ 3. Perfil de velocidade ══════════════════════════════════════════════════
--
-- O card pede "registro de estatísticas quanto à velocidade de operação".
-- Separado por contexto, porque a mesma lancha tem três regimes distintos:
-- manobrando no berço, navegando perto, e em travessia entre portos.
--
-- ⚠️ MEDIANA E PERCENTIS, NÃO MÉDIA. O `dc_sog` tem picos espúrios isolados —
--    há leitura de 18,9 kn com a lancha amarrada no Pecém, contrariada pelas
--    posições vizinhas. A média absorve esses picos; a mediana não.

CREATE OR REPLACE VIEW public.v_ais_velocidade AS
WITH ctx AS (
  SELECT c.cd_lancha, c.ds_lancha, c.sog_efetivo,
         to_char((c.dh_posicao AT TIME ZONE 'America/Fortaleza')::date, 'YYYY-MM') AS ano_mes,
         CASE WHEN c.na_base THEN 'no_berco'
              WHEN c.dist_base_m >= 5000 THEN 'travessia_ou_longe'
              ELSE 'proximo_a_base'
         END AS contexto
    FROM public.mv_ais_pos_classificada c
   WHERE c.sog_efetivo IS NOT NULL
     AND c.sog_efetivo >= 1.0            -- só navegando; parada não tem perfil
     AND c.sog_efetivo <= 40.0           -- descarta leitura absurda do transponder
)
SELECT
  ctx.ano_mes,
  ctx.ds_lancha,
  ctx.cd_lancha,
  ctx.contexto,
  count(*) AS n_posicoes,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY ctx.sog_efetivo)::numeric, 1) AS sog_mediano,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY ctx.sog_efetivo)::numeric, 1) AS sog_p90,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY ctx.sog_efetivo)::numeric, 1) AS sog_p99,
  round(max(ctx.sog_efetivo)::numeric, 1) AS sog_max
FROM ctx
GROUP BY 1, 2, 3, 4;

COMMENT ON VIEW public.v_ais_velocidade IS
  'Perfil de velocidade por mes, lancha e contexto (no_berco, proximo_a_base, travessia_ou_longe). Use MEDIANA e percentis: o dc_sog tem picos espurios isolados que a media absorve. Leituras acima de 40 kn sao descartadas como erro de transponder.';

GRANT SELECT ON public.v_ais_velocidade TO anon, authenticated;


-- ═══ 4. Manutenção como atividade da guarnição ════════════════════════════════
--
-- A nota de fadiga dizia: "difícil estimar outros tipos de atividades, como
-- manutenções. Só seria possível se fossem registradas com início e término
-- certinho. A ser avaliado."
--
-- Foram: `ocorrencias_webpilot` tem janela completa em 922 de 924 registros.
--
-- ⚠️ MAS A JANELA DESCREVE O ESTADO DA LANCHA, NÃO A PRESENÇA DA TRIPULAÇÃO.
--    Uma corretiva aberta por 21 h não significa 21 h de guarnição trabalhando —
--    pode ser lancha parada esperando peça. Por isso esta view fica SEPARADA de
--    mv_fadiga_periodos em vez de somar lá dentro: quem quiser considerar
--    manutenção como atividade faz a soma explicitamente, e sabe o que somou.

CREATE OR REPLACE VIEW public.v_atividade_manutencao AS
SELECT
  ld.lancha_nome AS ds_lancha,
  ld.cd_lancha,
  o.cd_ocorrencia,
  o.tipo_ocorrencia,
  o.efeito,
  o.data_inicio,
  o.data_fim,
  (o.data_inicio AT TIME ZONE 'America/Fortaleza')::date AS dia_inicio,
  ((o.data_inicio AT TIME ZONE 'America/Fortaleza')::date
    - ((EXTRACT(dow FROM (o.data_inicio AT TIME ZONE 'America/Fortaleza'))::int - 2 + 7) % 7)
    * interval '1 day')::date AS semana_turma,
  round(COALESCE(o.duracao_horas,
        EXTRACT(epoch FROM (o.data_fim - o.data_inicio)) / 3600.0)::numeric, 2) AS duracao_h,
  -- Preventiva programada tende a ter guarnição envolvida do início ao fim;
  -- corretiva com lancha inoperante pode ser espera de peça. A distinção fica
  -- exposta para quem consome decidir, não embutida num número.
  (o.tipo_ocorrencia ILIKE '%Preventiva%') AS preventiva,
  (o.efeito = 'Inoperante')                AS inoperante
FROM public.ocorrencias_webpilot o
JOIN public.v_lancha_dim ld ON ld.lancha_uuid = o.lancha_id
WHERE o.data_inicio IS NOT NULL
  AND o.data_fim    IS NOT NULL;

COMMENT ON VIEW public.v_atividade_manutencao IS
  'Janelas de manutencao com inicio e fim, ancoradas na semana de turma (terca a terca) para combinar com v_fadiga_semana. ATENCAO: a janela descreve o estado da LANCHA, nao a presenca da tripulacao — corretiva com lancha inoperante pode ser espera de peca. Mantida SEPARADA de mv_fadiga_periodos de proposito.';

GRANT SELECT ON public.v_atividade_manutencao TO anon, authenticated;
