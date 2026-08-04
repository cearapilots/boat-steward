-- ─────────────────────────────────────────────────────────────────────────────
-- Completa o agendamento diário dos syncs do WebPilot.
--
-- Contexto: 6 jobs já existiam (criados pelo painel, fora do versionamento);
-- faltavam `sync-abastecimentos` e `sync-vencimentos`, criados aqui.
--
-- RESTRIÇÃO OPERACIONAL: a equipe entra em serviço às 08:00 BRT, então TODOS os
-- syncs precisam terminar antes disso. Fortaleza é UTC-3 e não tem horário de
-- verão, então a conversão é fixa: 09:00 UTC = 06:00 BRT.
--
-- Janela adotada — 06:00 a 06:35 BRT (09:00 a 09:35 UTC), 5 min entre cada um:
--   sync-horimetros-diario      09:00 UTC = 06:00 BRT
--   sync-trocas-oleo-diario     09:05 UTC = 06:05 BRT
--   sync-ocorrencias-diario     09:10 UTC = 06:10 BRT  (depende de horimetros)
--   sync-indicadores-diario     09:15 UTC = 06:15 BRT
--   sync-fainas-diario          09:20 UTC = 06:20 BRT
--   sync-manobras-diario        09:25 UTC = 06:25 BRT
--   sync-abastecimentos-diario  09:30 UTC = 06:30 BRT
--   sync-vencimentos-diario     09:35 UTC = 06:35 BRT
--
-- Deixa ~1h25 de folga até o início do turno, para dar tempo de perceber e
-- reexecutar manualmente se algum sync falhar.
--
-- Rode no SQL Editor do Supabase (executa como `postgres`, que tem os grants do
-- schema `cron`). `cron.schedule` com nome repetido atualiza em vez de duplicar,
-- então reexecutar é seguro.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Cria os 2 jobs que faltavam (idempotente: mesmo nome atualiza, não duplica).
do $outer$
declare
  fn      text;
  minuto  int := 30;   -- 09:30 e 09:35 UTC
  projeto text := 'ejmlhoxhiupdobdlzjnh';
  chave   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqbWxob3hoaXVwZG9iZGx6am5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjU5OTIsImV4cCI6MjA5MTgwMTk5Mn0.Mssrl4bVxE_KGj3Rqv7tGIBLafhP9UokBVHQU2PsFEM';
  syncs   text[] := array['sync-abastecimentos', 'sync-vencimentos'];
begin
  foreach fn in array syncs loop
    perform cron.schedule(
      fn || '-diario',
      minuto || ' 9 * * *',
      format(
        $cmd$select net.http_post(
          url     := 'https://%s.supabase.co/functions/v1/%s',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
          body    := '{}'::jsonb,
          timeout_milliseconds := 55000
        );$cmd$,
        projeto, fn, chave
      )
    );
    minuto := minuto + 5;
  end loop;
end
$outer$;

-- 2. Reagenda os 8 para a janela 09:00–09:35 UTC (06:00–06:35 BRT).
--    `alter_job` muda só o horário e preserva o `command` original de cada job.
select cron.alter_job(jobid, schedule := '0 9 * * *')  from cron.job where jobname = 'sync-horimetros-diario';
select cron.alter_job(jobid, schedule := '5 9 * * *')  from cron.job where jobname = 'sync-trocas-oleo-diario';
select cron.alter_job(jobid, schedule := '10 9 * * *') from cron.job where jobname = 'sync-ocorrencias-diario';
select cron.alter_job(jobid, schedule := '15 9 * * *') from cron.job where jobname = 'sync-indicadores-diario';
select cron.alter_job(jobid, schedule := '20 9 * * *') from cron.job where jobname = 'sync-fainas-diario';
select cron.alter_job(jobid, schedule := '25 9 * * *') from cron.job where jobname = 'sync-manobras-diario';
select cron.alter_job(jobid, schedule := '30 9 * * *') from cron.job where jobname = 'sync-abastecimentos-diario';
select cron.alter_job(jobid, schedule := '35 9 * * *') from cron.job where jobname = 'sync-vencimentos-diario';

-- Conferir (devem existir 8 jobs no total, todos com sufixo -diario):
--   select jobname, schedule, active from cron.job order by schedule;
--
-- Ver execuções (após a primeira madrugada):
--   select j.jobname, d.status, d.start_time, d.return_message
--   from cron.job_run_details d join cron.job j using (jobid)
--   order by d.start_time desc limit 20;
