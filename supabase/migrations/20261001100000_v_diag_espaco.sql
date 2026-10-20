-- ─────────────────────────────────────────────────────────────────────────────
-- v_diag_espaco — quanto cada objeto ocupa, e se o indice serve para algo
--
-- Em 01/10/2026 o banco bateu 443 de 500 MB do plano gratuito, e a camada de
-- AIS responde por quase tudo. Nao da para decidir o que cortar sem ver dois
-- numeros que o painel do Supabase nao mostra:
--
--   · quanto de cada tabela e DADO VIVO e quanto e espaco morto a recuperar
--   · quantas vezes cada indice foi de fato usado desde o ultimo restart
--
-- Indice grande e nunca varrido e o corte mais barato que existe. Indice grande
-- e muito varrido e intocavel, por mais que incomode no ranking de tamanho.
--
-- Fica como view permanente: enquanto o banco estiver perto do teto, a pergunta
-- "o que esta crescendo" vai se repetir.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_diag_espaco;

CREATE VIEW public.v_diag_espaco AS
WITH tab AS (
  SELECT c.oid,
         c.relname::text                                   AS objeto,
         'tabela'::text                                    AS tipo,
         pg_table_size(c.oid)                              AS bytes_dados,
         pg_indexes_size(c.oid)                            AS bytes_indices,
         pg_total_relation_size(c.oid)                     AS bytes_total,
         c.reltuples::bigint                               AS linhas_estimadas,
         s.n_dead_tup                                      AS tuplas_mortas,
         s.last_autovacuum,
         NULL::bigint                                      AS varreduras
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'm')          -- tabela comum e materializada
),
idx AS (
  SELECT i.indexrelid                                      AS oid,
         ic.relname::text                                  AS objeto,
         'indice de ' || tc.relname::text                  AS tipo,
         pg_relation_size(i.indexrelid)                    AS bytes_dados,
         0::bigint                                         AS bytes_indices,
         pg_relation_size(i.indexrelid)                    AS bytes_total,
         NULL::bigint                                      AS linhas_estimadas,
         NULL::bigint                                      AS tuplas_mortas,
         NULL::timestamptz                                 AS last_autovacuum,
         COALESCE(su.idx_scan, 0)                          AS varreduras
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = ic.relnamespace
    LEFT JOIN pg_stat_user_indexes su ON su.indexrelid = i.indexrelid
   WHERE n.nspname = 'public'
)
SELECT objeto,
       tipo,
       round(bytes_total / 1048576.0, 2)   AS mb_total,
       round(bytes_dados / 1048576.0, 2)   AS mb_dados,
       round(bytes_indices / 1048576.0, 2) AS mb_indices,
       linhas_estimadas,
       CASE WHEN linhas_estimadas > 0
            THEN round(bytes_total::numeric / linhas_estimadas, 0) END AS bytes_por_linha,
       tuplas_mortas,
       varreduras,
       -- O veredito que interessa na hora de cortar
       CASE
         WHEN varreduras = 0 AND bytes_total > 10 * 1048576
              THEN 'INDICE GRANDE E NUNCA USADO — candidato a remocao'
         WHEN varreduras = 0 THEN 'indice nunca usado'
         WHEN tuplas_mortas > 50000 THEN 'muito espaco morto — VACUUM FULL recupera'
         ELSE NULL
       END AS veredito,
       last_autovacuum
  FROM (SELECT * FROM tab UNION ALL SELECT * FROM idx) x
 WHERE bytes_total > 1048576          -- abaixo de 1 MB nao muda decisao nenhuma
 ORDER BY bytes_total DESC;

COMMENT ON VIEW public.v_diag_espaco IS
  'Tamanho e uso de cada tabela, matview e indice acima de 1 MB. Criada em '
  '01/10/2026, quando o banco chegou a 443 de 500 MB do plano gratuito. A coluna '
  '`varreduras` e a que decide: indice grande com zero varredura e corte barato; '
  'indice grande e muito varrido e intocavel. `tuplas_mortas` alta indica espaco '
  'recuperavel por VACUUM FULL, sem perder dado nenhum.';

GRANT SELECT ON public.v_diag_espaco TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
