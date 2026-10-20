-- ─────────────────────────────────────────────────────────────────────────────
-- Posições AIS — tabela, monitoramento e agendamento
--
-- Endpoint novo do WebPilot (10/09/2026):
--   /integracao/lanchas/itAIS.aspx
-- Lista toda lancha com MMSI preenchido, numa janela móvel de ~48h.
--
-- Objetivo desta etapa: apenas ARMAZENAR. Nenhuma tela consome estes dados
-- ainda. O histórico antigo será carregado depois, e a chave única abaixo
-- torna essa carga idempotente.
--
-- Três coisas medidas no payload real antes de escrever isto:
--
--   1. `DH_POSICAO` vem em hora local de Fortaleza, NÃO em UTC. Conferido
--      contra o relógio: registro mais novo 10:41:09 com UTC em 13:41:53.
--      A Edge Function anexa `-03:00` antes de gravar. Fortaleza não tem
--      horário de verão, então o offset é fixo.
--      [CORRIGIDO 11/09/2026] As tabelas irmãs (manobras_lanchas,
--      fainas_deslocamentos) tambem estao em UTC e alinham DIRETO com esta:
--      os endpoints delas ja mandam UTC, enquanto o do AIS manda hora local.
--      Convencoes diferentes na origem, mesmo resultado no banco. NAO aplique
--      deslocamento ao cruzar. Prova: faina 519 declara inicio 14:21 e o AIS
--      marca o primeiro SOG>=10 no as 14:21:33.
--
--   2. (cd_lancha, dh_posicao) NÃO é único: 18 colisões em 48h, todas com a
--      mesma forma — uma linha posicionada e outra inteiramente nula no mesmo
--      instante. Os ~39% de registros sem coordenada são um segundo fluxo de
--      mensagens do AIS, não lixo. Daí a coluna gerada `tem_posicao` na chave.
--      Sem ela: ou uma das duas linhas some, ou (pior) o NULL nunca casa
--      consigo mesmo numa UNIQUE comum e as linhas se multiplicam a cada run.
--
--   3. O AIS da Flexeiras está quase mudo: 10 registros em 48h contra 2.359 da
--      Fortim. A Taíba não aparece — não tem MMSI cadastrado. Nenhum dos dois
--      é problema deste código.
--
-- Volume: ~1.200 linhas/dia hoje, ~2.400 se a Flexeiras voltar a reportar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 — tabela ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posicoes_ais (
  id           bigserial   PRIMARY KEY,
  cd_lancha    integer     NOT NULL,
  ds_lancha    text        NOT NULL,
  nr_mmsi      bigint,
  dh_posicao   timestamptz NOT NULL,
  dc_latitude  double precision,
  dc_longitude double precision,
  dc_sog       double precision,
  dc_cog       double precision,
  tem_posicao  boolean GENERATED ALWAYS AS
                 (dc_latitude IS NOT NULL AND dc_longitude IS NOT NULL) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posicoes_ais_unica UNIQUE (cd_lancha, dh_posicao, tem_posicao)
);

COMMENT ON TABLE  public.posicoes_ais IS
  'Posições AIS das lanchas, do endpoint itAIS do WebPilot. Janela de origem ~48h; o sync diário acumula o histórico.';
COMMENT ON COLUMN public.posicoes_ais.dh_posicao IS
  'Instante da posição, em UTC. A origem manda hora de Fortaleza (UTC-3) e a Edge Function converte.';
COMMENT ON COLUMN public.posicoes_ais.tem_posicao IS
  'Gerada. Entra na chave única porque registros sem coordenada colidem no mesmo instante com os posicionados.';
COMMENT ON COLUMN public.posicoes_ais.dc_sog IS 'Speed Over Ground, em nós.';
COMMENT ON COLUMN public.posicoes_ais.dc_cog IS 'Course Over Ground, em graus. Nulo quando parada.';

-- Consulta por faixa de tempo cruzando lanchas (a UNIQUE já cobre lancha+tempo).
CREATE INDEX IF NOT EXISTS idx_posicoes_ais_dh ON public.posicoes_ais (dh_posicao);

-- ── PASSO 2 — RLS, mesmo padrão das demais tabelas ───────────────────────────
-- Leitura pública segue o padrão do projeto. AIS é transmissão aberta por
-- natureza (qualquer receptor ou site de tracking já a enxerga), então isto
-- não expõe nada que não seja público.
ALTER TABLE public.posicoes_ais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios autenticados podem tudo" ON public.posicoes_ais;
CREATE POLICY "usuarios autenticados podem tudo"
  ON public.posicoes_ais FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leitura publica posicoes_ais" ON public.posicoes_ais;
CREATE POLICY "leitura publica posicoes_ais"
  ON public.posicoes_ais FOR SELECT TO anon USING (true);

GRANT SELECT ON public.posicoes_ais TO anon, authenticated;

-- ── PASSO 3 — o sync novo entra no monitoramento ─────────────────────────────
-- `sync_log` não tem coluna dizendo qual função gravou a linha: a view infere
-- pelo TEXTO de `detalhe`. Sem o ramo abaixo o sync-ais cairia em
-- 'nao_identificado', que a própria view filtra para fora — a função rodaria
-- sem nenhum monitoramento, e a "regra zero" do briefing semanal não a veria.
-- Definição idêntica à atual, só com o ramo do AIS acrescentado no topo.
CREATE OR REPLACE VIEW public.v_analytics_sync_health AS
WITH classificado AS (
  SELECT executado_em, status, eventos_importados, lanchas_atualizadas, detalhe,
    CASE
      -- Ancorado e sensível a maiúsculas de propósito: ILIKE '%AIS%' casaria
      -- com "mais"/"demais" em qualquer detalhe. E vem primeiro para não ser
      -- capturado pelo ramo do sync-horimetros, que casa com '%→%' + '%h %'.
      WHEN detalhe LIKE 'AIS:%'                  THEN 'sync-ais'
      WHEN detalhe ILIKE '%Periódicas%'
        OR detalhe ILIKE '%Periodicas%'          THEN 'sync-ocorrencias'
      WHEN detalhe ILIKE '%Indicadores%'         THEN 'sync-indicadores'
      WHEN detalhe ILIKE '%Manobras processadas%'
        OR detalhe ILIKE '%Manobras:%'           THEN 'sync-manobras'
      WHEN detalhe ILIKE '%Fainas processadas%'
        OR detalhe ILIKE '%Fainas:%'             THEN 'sync-fainas'
      WHEN detalhe ILIKE '%Abastecimento%'       THEN 'sync-abastecimentos'
      WHEN detalhe ILIKE '%vencimento%'          THEN 'sync-vencimentos'
      WHEN detalhe ILIKE '%SKIP cd=%'
        OR detalhe ILIKE '%troca%óleo%'
        OR detalhe ILIKE '%troca%oleo%'
        OR detalhe ILIKE '%Trocas registradas%'
        OR detalhe ILIKE '%Nenhuma troca%'       THEN 'sync-trocas-oleo'
      WHEN detalhe ILIKE '%Gerador:%'
        OR (detalhe LIKE '%→%' AND detalhe ILIKE '%h %') THEN 'sync-horimetros'
      ELSE 'nao_identificado'
    END AS funcao
  FROM sync_log
  WHERE executado_em > now() - interval '30 days'
),
agregado AS (
  SELECT funcao,
    max(executado_em) AS ultima_execucao,
    max(executado_em) FILTER (WHERE status::text = 'sucesso') AS ultimo_sucesso,
    -- 'parcial' é execução saudável: sync-trocas-oleo grava parcial quando
    -- não há troca nova, o que é o caso na maioria dos dias.
    max(executado_em) FILTER (WHERE status::text IN ('sucesso','parcial')) AS ultima_execucao_ok,
    (array_agg(status            ORDER BY executado_em DESC))[1] AS status_ultima,
    (array_agg(eventos_importados ORDER BY executado_em DESC))[1] AS eventos_ultima,
    (array_agg(left(detalhe, 150) ORDER BY executado_em DESC))[1] AS detalhe_ultima,
    count(*)                                            AS execucoes_30d,
    count(*) FILTER (WHERE status::text = 'sucesso')    AS sucessos_30d,
    count(*) FILTER (WHERE status::text = 'parcial')    AS parciais_30d,
    count(*) FILTER (WHERE status::text = 'erro')       AS erros_30d,
    count(*) FILTER (WHERE status::text = 'erro'
                       AND executado_em > now() - interval '7 days') AS erros_7d,
    sum(eventos_importados) FILTER (WHERE executado_em > now() - interval '7 days') AS eventos_7d
  FROM classificado
  WHERE funcao <> 'nao_identificado'
  GROUP BY funcao
)
SELECT funcao, ultima_execucao, ultimo_sucesso, ultima_execucao_ok,
  status_ultima, eventos_ultima, detalhe_ultima,
  execucoes_30d, sucessos_30d, parciais_30d, erros_30d, erros_7d,
  COALESCE(eventos_7d, 0) AS eventos_7d,
  round(EXTRACT(epoch FROM (now() - ultima_execucao))    / 3600, 1) AS horas_desde_ultima,
  round(EXTRACT(epoch FROM (now() - ultima_execucao_ok)) / 3600, 1) AS horas_desde_ok,
  CASE
    WHEN ultima_execucao_ok IS NULL                      THEN 'critico'
    WHEN now() - ultima_execucao_ok > interval '48 hours' THEN 'critico'
    WHEN now() - ultima_execucao_ok > interval '26 hours' THEN 'atencao'
    WHEN erros_7d >= 3                                    THEN 'atencao'
    WHEN status_ultima::text = 'erro'                     THEN 'atencao'
    ELSE 'ok'
  END AS saude,
  CASE
    WHEN ultima_execucao_ok IS NULL
      THEN 'Nenhuma execução bem-sucedida em 30 dias'
    WHEN now() - ultima_execucao_ok > interval '48 hours'
      THEN 'Sem execução OK há mais de 48h — dados desta fonte estão defasados'
    WHEN now() - ultima_execucao_ok > interval '26 hours'
      THEN 'Sem execução OK há mais de 26h — verificar antes de analisar'
    WHEN erros_7d >= 3                THEN 'Múltiplas falhas na última semana'
    WHEN status_ultima::text = 'erro' THEN 'Última execução falhou (anteriores OK)'
    WHEN sucessos_30d = 0 AND parciais_30d > 0
      THEN 'Sincronizando normalmente — sem novidades no período'
    ELSE 'Sincronizando normalmente'
  END AS diagnostico
FROM agregado
ORDER BY
  CASE WHEN ultima_execucao_ok IS NULL                      THEN 0
       WHEN now() - ultima_execucao_ok > interval '48 hours' THEN 1
       WHEN now() - ultima_execucao_ok > interval '26 hours' THEN 2
       ELSE 3 END,
  funcao;
GRANT SELECT ON public.v_analytics_sync_health TO anon, authenticated;

-- ── PASSO 4 — agendamento diário, 09:40 UTC = 06:40 BRT ──────────────────────
-- Slot seguinte ao sync-vencimentos (09:35), ainda dentro da janela que termina
-- antes do turno das 08:00 BRT. Com a janela de 48h do endpoint, uma falha
-- isolada é recuperada no dia seguinte; duas seguidas perdem posições.
-- `cron.schedule` com nome repetido atualiza em vez de duplicar.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-ais-diario',
  '40 9 * * *',
  $cmd$select net.http_post(
    url     := 'https://ejmlhoxhiupdobdlzjnh.supabase.co/functions/v1/sync-ais',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqbWxob3hoaXVwZG9iZGx6am5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjU5OTIsImV4cCI6MjA5MTgwMTk5Mn0.Mssrl4bVxE_KGj3Rqv7tGIBLafhP9UokBVHQU2PsFEM'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );$cmd$
);

-- ── CONFERÊNCIA ──────────────────────────────────────────────────────────────
-- 9 jobs, todos com sufixo -diario:
--   select jobname, schedule, active from cron.job order by schedule;
--
-- Depois de invocar a função uma vez à mão, deve aparecer sync-ais aqui:
--   select funcao, saude, eventos_ultima, detalhe_ultima
--     from public.v_analytics_sync_health order by funcao;
--
-- E os dados, com o fuso já convertido:
--   select ds_lancha, count(*) filter (where tem_posicao) as com_posicao,
--          count(*) filter (where not tem_posicao) as sem_posicao,
--          min(dh_posicao), max(dh_posicao)
--     from public.posicoes_ais group by ds_lancha order by ds_lancha;
--
-- Rodar duas vezes seguidas NÃO pode aumentar a contagem:
--   select count(*) from public.posicoes_ais;
