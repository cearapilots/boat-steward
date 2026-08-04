-- ─────────────────────────────────────────────────────────────────────────────
-- Completa o agendamento diário dos syncs do WebPilot.
--
-- Contexto: 6 jobs já existiam (criados pelo painel, fora do versionamento):
--   sync-horimetros-diario   10:40 UTC
--   sync-trocas-oleo-diario  10:45 UTC
--   sync-ocorrencias-diario  10:50 UTC   (depende de sync-horimetros, que roda antes)
--   sync-indicadores-diario  10:55 UTC
--   sync-fainas-diario       11:00 UTC
--   sync-manobras-diario     11:05 UTC
--
-- Faltavam apenas `sync-abastecimentos` e `sync-vencimentos`, adicionados aqui
-- na sequência da mesma janela e seguindo a convenção de nome existente.
--
-- Rode no SQL Editor do Supabase (executa como `postgres`, que tem os grants do
-- schema `cron`). `cron.schedule` com nome repetido atualiza em vez de duplicar,
-- então reexecutar é seguro.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $outer$
declare
  fn      text;
  minuto  int := 10;   -- 11:10 e 11:15 UTC, após os 6 jobs já existentes
  projeto text := 'ejmlhoxhiupdobdlzjnh';
  chave   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqbWxob3hoaXVwZG9iZGx6am5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjU5OTIsImV4cCI6MjA5MTgwMTk5Mn0.Mssrl4bVxE_KGj3Rqv7tGIBLafhP9UokBVHQU2PsFEM';
  syncs   text[] := array['sync-abastecimentos', 'sync-vencimentos'];
begin
  foreach fn in array syncs loop
    perform cron.schedule(
      fn || '-diario',
      minuto || ' 11 * * *',
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

-- Conferir (devem existir 8 jobs no total, todos com sufixo -diario):
--   select jobname, schedule, active from cron.job order by schedule;
--
-- Ver execuções (após a primeira madrugada):
--   select j.jobname, d.status, d.start_time, d.return_message
--   from cron.job_run_details d join cron.job j using (jobid)
--   order by d.start_time desc limit 20;
