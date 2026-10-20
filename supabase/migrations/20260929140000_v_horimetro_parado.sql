-- ─────────────────────────────────────────────────────────────────────────────
-- v_horimetro_parado — o semáforo verde que nunca vira
--
-- O briefing de 29/09/2026 pediu atenção a "dois horímetros de gerador
-- congelados". Investigando, os dois casos NÃO são iguais:
--
--   FORTIM Gerador 1   parado em 8.332 h desde 2026 — mas `ativos.ativo = false`
--                      (removido na conversão para lítio). NÃO entra em
--                      `v_situacao_atual`, não tem semáforo, não engana ninguém.
--                      É um campo morto em `indicadores_ativos`. Inofensivo.
--
--   TAÍBA  Gerador 2   parado em 10.219 h desde 21/05/2026 — e `ativo = true`.
--                      ⚠️ ESTE É O PROBLEMA. `v_situacao_atual` calcula
--                      "restam 146 h, VERDE" a partir de um horímetro que não
--                      anda há 13 leituras seguidas (dc_dif_gerador = 0 em
--                      todas). O número 146 é fixo: vai continuar 146 para
--                      sempre. A última troca foi em 07/04/2026 — 175 dias.
--                      NENHUM detector pode disparar, porque o denominador
--                      está congelado.
--
-- Há ainda um segundo defeito na mesma série, anterior a este:
--   em 19/05/2026 o horímetro do gerador da Taíba pulou de 1.302 para 10.212
--   numa única leitura (com `dc_dif_gerador = 12`, isto é, a origem acreditava
--   ter avançado 12 h). As trocas registradas já estavam na escala dos 10 mil
--   (9.966 em 12/08/2025, 10.165 em 07/04/2026). Ou seja: a série de LEITURAS
--   estava na escala errada até 19/05 e as MANUTENÇÕES sempre na certa.
--   Qualquer gráfico de horas de gerador da Taíba antes de 19/05/2026 é lixo.
--
-- ─── O QUE ESTA VIEW FAZ ─────────────────────────────────────────────────────
--
-- Nada é alterado. Esta é uma view NOVA e puramente aditiva: não toca em
-- `v_situacao_atual`, em `ativos`, nem em nenhuma tela existente.
--
-- Para cada ativo rastreado ela responde três coisas que hoje ninguém vê:
--
--   1. o horímetro que alimenta o cálculo dele está andando?
--   2. há quanto tempo está parado, e em quantas leituras seguidas
--   3. quantos dias desde a última troca, contra a MEDIANA HISTÓRICA de dias
--      entre trocas DESSE ativo — que é o critério de calendário, e vem do
--      próprio dado, não de um número inventado
--
-- Quando o horímetro congela, `criterio_vigente` passa de 'horimetro' para
-- 'calendario' e é `dias_desde_troca` que deve ser lido, não `horas_restantes`.
--
-- Limiar de congelamento: 3+ leituras no mesmo valor E 60+ dias parado. Os dois
-- juntos, porque lancha de reserva passa semanas sem leitura sem que o medidor
-- esteja quebrado — a Taíba abastece pouco e por isso é medida esparsamente.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_horimetro_parado;

CREATE VIEW public.v_horimetro_parado AS
WITH leitura AS (
  -- `indicadores_ativos.cd_lancha` é o código do WebPilot, não o uuid da lancha
  SELECT l.id                   AS lancha_id,
         i.dh_leitura,
         COALESCE(i.dc_horimetro_bb, i.dc_horimetro_be) AS casco,
         i.dc_horimetro_gerador                          AS gerador
    FROM public.indicadores_ativos i
    JOIN public.lanchas l ON l.id_webpilot = i.cd_lancha::text
),
fonte AS (
  SELECT a.id                       AS ativo_id,
         a.nome                     AS ativo_nome,
         a.tipo,
         a.intervalo_manutencao,
         a.ultima_troca_data::date  AS ultima_troca_data,
         a.lancha_id,
         l.nome                     AS lancha_nome,
         CASE WHEN a.tipo = 'gerador' THEN 'horimetro_gerador'
              ELSE 'horimetro_casco' END AS fonte
    FROM public.ativos a
    JOIN public.lanchas l ON l.id = a.lancha_id
   WHERE a.ativo IS TRUE          -- o Gerador 1 da Fortim cai fora aqui
),
serie AS (
  SELECT f.ativo_id,
         x.dh_leitura,
         CASE WHEN f.tipo = 'gerador' THEN x.gerador ELSE x.casco END AS valor
    FROM fonte f
    JOIN leitura x ON x.lancha_id = f.lancha_id
),
atual AS (
  SELECT DISTINCT ON (s.ativo_id)
         s.ativo_id,
         s.valor      AS horimetro_atual,
         s.dh_leitura AS ultima_leitura
    FROM serie s
   WHERE s.valor IS NOT NULL
   ORDER BY s.ativo_id, s.dh_leitura DESC
),
mudou AS (
  SELECT a.ativo_id,
         a.horimetro_atual,
         a.ultima_leitura,
         -- quando o medidor marcou pela última vez qualquer OUTRO valor
         (SELECT max(s.dh_leitura)
            FROM serie s
           WHERE s.ativo_id = a.ativo_id
             AND s.valor IS NOT NULL
             AND s.valor <> a.horimetro_atual) AS dh_ultimo_valor_diferente
    FROM atual a
),
parado AS (
  SELECT m.ativo_id,
         m.horimetro_atual,
         m.ultima_leitura,
         (SELECT min(s.dh_leitura)
            FROM serie s
           WHERE s.ativo_id = m.ativo_id
             AND s.valor = m.horimetro_atual
             AND (m.dh_ultimo_valor_diferente IS NULL
                  OR s.dh_leitura > m.dh_ultimo_valor_diferente)) AS parado_desde,
         (SELECT count(*)
            FROM serie s
           WHERE s.ativo_id = m.ativo_id
             AND s.valor = m.horimetro_atual
             AND (m.dh_ultimo_valor_diferente IS NULL
                  OR s.dh_leitura > m.dh_ultimo_valor_diferente)) AS leituras_no_mesmo_valor
    FROM mudou m
),
ritmo AS (
  -- o calendário que o próprio ativo pratica, medido; não um número arbitrado
  SELECT h.ativo_id,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.dias)::numeric, 0)
                        AS mediana_dias_entre_trocas,
         count(*)       AS n_intervalos
    FROM (
      SELECT mn.ativo_id,
             mn.data_manutencao::date
               - lag(mn.data_manutencao::date)
                   OVER (PARTITION BY mn.ativo_id ORDER BY mn.data_manutencao) AS dias
        FROM public.manutencoes mn
       WHERE mn.tipo = 'troca_oleo'
    ) h
   WHERE h.dias IS NOT NULL
     AND h.dias > 0
   GROUP BY h.ativo_id
)
SELECT f.lancha_nome,
       f.ativo_nome,
       f.tipo,
       f.fonte,
       p.horimetro_atual,
       p.ultima_leitura,
       p.parado_desde,
       p.leituras_no_mesmo_valor,
       GREATEST(0, CURRENT_DATE - p.parado_desde::date)  AS dias_parado,
       f.ultima_troca_data,
       CURRENT_DATE - f.ultima_troca_data                AS dias_desde_troca,
       f.intervalo_manutencao,
       r.mediana_dias_entre_trocas,
       r.n_intervalos,
       (p.leituras_no_mesmo_valor >= 3
        AND CURRENT_DATE - p.parado_desde::date >= 60)   AS horimetro_congelado,
       CASE WHEN p.leituras_no_mesmo_valor >= 3
                 AND CURRENT_DATE - p.parado_desde::date >= 60
            THEN 'calendario'
            ELSE 'horimetro'
       END                                               AS criterio_vigente
  FROM fonte f
  JOIN parado p ON p.ativo_id = f.ativo_id
  LEFT JOIN ritmo  r ON r.ativo_id = f.ativo_id
 ORDER BY (p.leituras_no_mesmo_valor >= 3
           AND CURRENT_DATE - p.parado_desde::date >= 60) DESC,
          f.lancha_nome,
          f.ativo_nome;

COMMENT ON VIEW public.v_horimetro_parado IS
  'Ativos cujo horimetro de origem parou de andar, deixando o semaforo de troca '
  'de oleo congelado num valor que nunca muda. Quando horimetro_congelado = true, '
  'horas_restantes_troca de v_situacao_atual e ficcao e o criterio que vale e '
  'dias_desde_troca contra mediana_dias_entre_trocas. Caso vivo em 29/09/2026: '
  'Taiba Gerador 2, parado em 10.219 h desde 21/05/2026.';

GRANT SELECT ON public.v_horimetro_parado TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────
--
-- SELECT lancha_nome, ativo_nome, horimetro_atual, dias_parado,
--        leituras_no_mesmo_valor, dias_desde_troca, mediana_dias_entre_trocas,
--        horimetro_congelado, criterio_vigente
--   FROM public.v_horimetro_parado;
--
--   ESPERADO: exatamente UMA linha com horimetro_congelado = true —
--   Taiba / Gerador 2, ~131 dias parado, 13 leituras no mesmo valor,
--   175 dias desde a troca. Todas as outras com criterio_vigente='horimetro'.
