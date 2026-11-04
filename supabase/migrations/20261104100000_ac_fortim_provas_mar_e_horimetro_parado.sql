-- ─────────────────────────────────────────────────────────────────────────────
-- 04/11/2026 — o pedido do Marcelo e duas correções do briefing de 02/11
--
-- ─── 1. AR-CONDICIONADO DA FORTIM: INSTALADO EM 30/10/2026 ───────────────────
--
-- Corretiva 7391, de 29/10 17h a 30/10 18h30: inverter Midea de 18.000 BTUs no
-- lugar do aparelho de 18/05/2024. O tooltip da periódica no Dashboard ainda
-- mostrava 18/05/2024 ("em uso há 2 anos, 5 meses"). Pedido do Marcelo em
-- 03/11/2026, com a data de 30/10. A periódica de A/C não muda: ela reiniciou
-- sozinha com a mesma ocorrência e vence em 28/11.
--
-- ─── 2. PROVAS DE MAR COM O MILHAR LIDO COMO DECIMAL ─────────────────────────
--
-- Quem digita "13.726" no campo numérico do navegador grava 13,726. O briefing
-- achou uma linha; são quatro, todas manuais, conferidas contra a leitura de
-- horímetro do mesmo dia em `indicadores_ativos`:
--
--   Taíba     14/07  horímetro 9,621  → 9.621    Abastecimento 3294, 14/07: 9.621
--   Fortim    23/07  horímetro 13,31  → 13.310   Abastecimento 3311, 23/07: 13.310
--                    peso 12 kg       → 12.000   as outras provas dela: 12.000
--   Fortim    21/09  horímetro 13,726 → 13.726   Abastecimento 3362, 18/09: 13.695
--   Flexeiras 26/10  peso 12 kg       → 12.000   as outras provas dela: 12.000
--
-- A tela de registro passou a ler o ponto como milhar nesses dois campos.
--
-- ─── 3. v_horimetro_parado GANHA ativo_id E lancha_id ────────────────────────
--
-- O Dashboard passa a ler esta view para duas coisas: a data da última leitura
-- de horímetro de cada lancha (o "Atualizado" do cartão era a hora do sync, não
-- da leitura) e o critério de calendário do ativo com horímetro congelado (o
-- Gerador 2 da Taíba mostrava "146 h, verde" para sempre). As duas colunas
-- entram no FIM, como o CREATE OR REPLACE exige; o corpo da view não muda.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.lanchas
   SET ac_data_instalacao = DATE '2026-10-30'
 WHERE id = 'a0000000-0000-0000-0000-000000000002'       -- Fortim
   AND ac_data_instalacao = DATE '2024-05-18';           -- só se ainda for o aparelho antigo

UPDATE public.provas_mar SET horimetro = 9621
 WHERE id = 'c9cd02a6-cde7-456b-821e-074b30831576' AND horimetro = 9.621;

UPDATE public.provas_mar SET horimetro = 13310, peso_kg = 12000
 WHERE id = 'f010c1d6-4ae3-483b-9fb1-6861631296b9' AND horimetro = 13.31 AND peso_kg = 12;

UPDATE public.provas_mar SET horimetro = 13726
 WHERE id = '6b111f0b-334a-4a80-93c9-9154b99c3ef2' AND horimetro = 13.726;

UPDATE public.provas_mar SET peso_kg = 12000
 WHERE lancha_id = 'a0000000-0000-0000-0000-000000000001'   -- Flexeiras
   AND data = DATE '2026-10-26' AND peso_kg = 12 AND origem = 'manual';

CREATE OR REPLACE VIEW public.v_horimetro_parado AS
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
       END                                               AS criterio_vigente,
       f.ativo_id,
       f.lancha_id
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
  'Taiba Gerador 2, parado em 10.219 h desde 21/05/2026. Desde 04/11/2026 o '
  'Dashboard le esta view: ultima_leitura no cartao da lancha e o calendario '
  'na troca de oleo do ativo congelado.';

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
-- SELECT nome, ac_data_instalacao FROM public.lanchas ORDER BY nome;
--    ESPERADO: Fortim 2026-10-30.
-- SELECT data, horimetro, peso_kg FROM public.provas_mar
--  WHERE origem = 'manual' AND (horimetro < 1000 OR peso_kg < 1000);
--    ESPERADO: nenhuma linha.
-- SELECT ativo_nome, ativo_id, lancha_id, criterio_vigente
--   FROM public.v_horimetro_parado WHERE horimetro_congelado;
--    ESPERADO: Gerador 2, b0000000-…-042, Taíba, 'calendario'.
