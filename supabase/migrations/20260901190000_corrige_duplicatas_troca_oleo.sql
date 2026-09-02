-- ============================================================================
-- Corrige as duplicatas de troca de óleo geradas pelo sync-ocorrencias
-- e recompõe ultima_troca_horimetro em ativos.
--
-- CAUSA: o dedup usava .maybeSingle(), que devolve data = null quando encontra
-- 2 ou mais linhas (o erro PGRST116 era descartado). A partir do momento em que
-- sync-trocas-oleo gravou sua própria linha para o mesmo dia, a checagem passou
-- a ler "várias" como "nenhuma" e reinseriu a cada execução — inclusive a cada
-- clique no botão Atualizar.
--
-- O código foi corrigido para .limit(1). Esta migration limpa o que já entrou.
--
-- Os casts de data são fixados em UTC de propósito: data_manutencao é
-- timestamptz, e ::date sozinho depende do fuso da sessão. Num fuso negativo
-- a linha de meia-noite cairia no dia anterior, viraria outra partição, e
-- sobrariam duas linhas em vez de uma.
-- ============================================================================

-- ── PASSO 0 — PREVIEW. Rode isto sozinho antes de aplicar o resto. ──────────
-- SELECT ativo_id, data_manutencao::date AS dia, count(*) AS linhas,
--        min(created_at) AS primeira, max(created_at) AS ultima,
--        array_agg(DISTINCT horimetro_lancha ORDER BY horimetro_lancha) AS horimetros
--   FROM manutencoes
--  WHERE tipo = 'troca_oleo' AND origem <> 'manual'
--  GROUP BY 1, 2 HAVING count(*) > 1
--  ORDER BY linhas DESC;

BEGIN;

-- ── PASSO 1 — remover as duplicatas ─────────────────────────────────────────
-- Mantém UMA linha por (ativo, tipo, dia), preferindo a que tem hora real
-- gravada. Registros com hora vêm do sync-trocas-oleo, que lê o horímetro do
-- próprio payload do WebPilot; os de meia-noite vêm do sync-ocorrencias, que
-- carimba o horímetro do momento em que roda (limitação C.6). Empate resolve
-- pelo mais antigo.
--
-- Linhas com origem 'manual' ficam fora: são intervenção deliberada.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY ativo_id, tipo, (data_manutencao AT TIME ZONE 'UTC')::date
           ORDER BY ((data_manutencao AT TIME ZONE 'UTC')::time <> '00:00:00') DESC,
                    created_at ASC
         ) AS rn
    FROM manutencoes
   WHERE tipo = 'troca_oleo'
     AND origem <> 'manual'
)
DELETE FROM manutencoes m
 USING ranked r
 WHERE m.id = r.id
   AND r.rn > 1;

-- ⚠️  ATENÇÃO — O PASSO 2 ABAIXO CAUSOU REGRESSÃO. NÃO REEXECUTAR COMO ESTÁ.
--
-- Ele foi escrito "geral e idempotente", re-sincronizando TODOS os ativos a
-- partir de manutencoes. Isso atropelou três baselines que não vinham de evento
-- de manutenção:
--
--   Gerador 1 (Fortim)  8257  -> NULL   (última troca é import_excel, que grava
--   Gerador 2 (Taíba)  10165  -> NULL    o valor em horimetro_equipamento e
--                                        deixa horimetro_lancha nulo)
--   Motor 8            13187  -> 12899  (baseline não tinha evento correspondente)
--
-- Pior: na v_situacao_atual um baseline nulo vira semáforo VERDE, não "—".
-- Os dois geradores saíram do monitoramento parecendo saudáveis.
--
-- Restaurado em 02/09/2026 pela migration 20260902100000.
--
-- LIÇÃO: um UPDATE de reparo deve ser restrito às linhas que se quer reparar.
-- Generalizar não é o mesmo que tornar seguro — aqui foi o oposto.
--
-- A versão correta, se algum dia for preciso repetir, tem estas duas guardas:
--   WHERE ... AND m.horimetro_lancha IS NOT NULL
--   AND a.id IN (<lista explícita dos ativos afetados>)
--
-- ── PASSO 2 — recompor ativos a partir do que sobrou ────────────────────────
-- Necessário porque o trigger atualizar_ativo_apos_manutencao é AFTER INSERT:
-- o DELETE acima não dispara nada.
--
-- Idempotente: o WHERE final faz virar no-op quando já está correto.
UPDATE ativos a
   SET ultima_troca_horimetro = m.horimetro_lancha,
       ultima_troca_data      = (m.data_manutencao AT TIME ZONE 'UTC')::date,
       updated_at             = now()
  FROM (
        SELECT DISTINCT ON (ativo_id)
               ativo_id, horimetro_lancha, data_manutencao
          FROM manutencoes
         WHERE tipo = 'troca_oleo'
         ORDER BY ativo_id, data_manutencao DESC, created_at DESC
       ) m
 WHERE a.id = m.ativo_id
   AND (a.ultima_troca_horimetro IS DISTINCT FROM m.horimetro_lancha
     OR a.ultima_troca_data      IS DISTINCT FROM (m.data_manutencao AT TIME ZONE 'UTC')::date);

COMMIT;

-- ── PASSO 3 — conferência ───────────────────────────────────────────────────
-- Esperado para os motores da Fortim: 13497 e 2026-08-20.
-- O WebPilot registra "Troca de óleo dos motores com: 13.497 Hs.
-- Proxima Troca: 13.747 Hs." — a próxima troca deve fechar em 13.747.
--
-- SELECT a.nome, a.ultima_troca_horimetro, a.ultima_troca_data,
--        a.ultima_troca_horimetro + a.intervalo_manutencao AS proxima_troca
--   FROM ativos a
--   JOIN lanchas l ON l.id = a.lancha_id
--  WHERE l.nome = 'Fortim' AND a.tipo = 'motor'
--  ORDER BY a.nome;
