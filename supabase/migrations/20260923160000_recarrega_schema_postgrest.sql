-- Faz o PostgREST recarregar o cache de schema.
--
-- View nova criada por `supabase db push` so aparece na API depois que o
-- PostgREST recarrega — ate la a consulta devolve 404. O recarregamento
-- automatico tem atraso; este NOTIFY dispara na hora.
--
-- Rode isto sempre que criar view/tabela nova e a API responder 404.
NOTIFY pgrst, 'reload schema';
