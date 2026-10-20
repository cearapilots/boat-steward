-- ─────────────────────────────────────────────────────────────────────────────
-- v_ais_saida_motivo — por que a lancha saiu
--
-- Depende de mv_ais_saidas (arquivo 3 de 20260922). View comum, nao
-- materializada: sao 4.151 episodios contra 16 mil manobras, custa pouco.
--
-- Responde a pergunta que a nota de fadiga levanta e o card do Trello repete:
-- "alem das manobras, lanchas por vezes circulam para outros fins, como provas
-- de mar, abastecimento, etc. — cruzando com o historico conseguimos
-- indiretamente inferir o motivo de cada saida".
--
-- E, sobretudo, entrega o numero que ninguem tinha: quantas saidas NAO tem
-- registro nenhum que as explique.
--
-- ─── AS QUATRO FONTES, E O QUANTO CADA UMA VALE ──────────────────────────────
--
-- manobras_lanchas      instante preciso (dh_manobra). Fonte forte.
-- abastecimentos        instante preciso (dh_abastecimento). Fonte forte, mas
--                       so registra DIESEL: lancamento de oleo lubrificante vai
--                       com Litros = 0 e nem chega ao FleetIQ. Troca de oleo
--                       nao aparece aqui.
-- ocorrencias_webpilot  janela com inicio e fim em 922 de 924 registros. Fonte
--                       MEDIA: descreve o estado da LANCHA, nao a presenca da
--                       tripulacao. Uma corretiva aberta nao prova que houve
--                       saida para teste.
-- provas_mar            so DATA, sem hora. Fonte FRACA: casa no dia, nao no
--                       episodio. Num dia com tres saidas, todas as tres
--                       recebem a marca. Use como indicio, nunca como prova.
--
-- ─── TOLERANCIA DE 15 MINUTOS ────────────────────────────────────────────────
--
-- O registro da manobra e feito pela atalaia alguns instantes depois do
-- transbordo, e o horario de saida do berco nem sempre e o mesmo relogio.
-- A janela do episodio e alargada em 15 min de cada lado para absorver isso.
-- Gravado em `tolerancia_min`. Acima disso comecaria a roubar manobra da saida
-- vizinha — o intervalo tipico entre saidas consecutivas e de dezenas de
-- minutos.
--
-- ─── PRECEDENCIA DO `motivo` ─────────────────────────────────────────────────
--
-- Uma saida pode ter varias marcas ao mesmo tempo (travessia COM manobra no
-- caminho e o caso comum). As colunas booleanas ficam todas expostas; `motivo`
-- escolhe uma, nesta ordem:
--
--   1. manobra       — a atividade-fim, e a de registro mais confiavel
--   2. travessia     — deslocamento entre portos, medido pelo proprio AIS
--   3. abastecimento
--   4. prova_de_mar  — depois das anteriores por ser so do dia
--   5. ocorrencia    — a mais fraca; so quando nada mais explica
--   6. sem_registro  ← o numero que interessa a gestao
--   7. movimento_no_berco — as `curta_e_perto`, que nem chegam a ser saida
--
-- ⚠️ `sem_registro` NAO significa saida indevida. Significa que nenhuma das
--    quatro fontes explica aquele movimento. Pode ser teste pos-manutencao,
--    reposicionamento, apoio nao registrado, ou registro que ficou faltando.
--    A coluna serve para levantar a pergunta, nunca para responde-la.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ais_saida_motivo AS
WITH par AS (
  SELECT 15 AS tolerancia_min
),
s AS (
  SELECT sa.*,
         (sa.inicio - (SELECT tolerancia_min FROM par) * interval '1 minute') AS ini_tol,
         (COALESCE(sa.fim, sa.inicio) + (SELECT tolerancia_min FROM par) * interval '1 minute') AS fim_tol,
         ld.lancha_uuid
    FROM public.mv_ais_saidas sa
    LEFT JOIN public.v_lancha_dim ld ON ld.cd_lancha = sa.cd_lancha
),
cruza AS (
  SELECT s.*,
         (SELECT count(*) FROM public.manobras_lanchas m
           WHERE m.cd_lancha = s.cd_lancha
             AND m.dh_manobra >= s.ini_tol AND m.dh_manobra <= s.fim_tol) AS n_manobras,
         (SELECT count(*) FROM public.abastecimentos_combustivel a
           WHERE a.cd_lancha = s.cd_lancha
             AND a.dh_abastecimento >= s.ini_tol AND a.dh_abastecimento <= s.fim_tol) AS n_abastecimentos,
         -- Ocorrencia que ESTAVA ABERTA durante o episodio (sobreposicao de
         -- janelas), nao apenas iniciada dentro dele.
         (SELECT count(*) FROM public.ocorrencias_webpilot o
           WHERE o.lancha_id = s.lancha_uuid
             AND o.data_inicio <= s.fim_tol
             AND COALESCE(o.data_fim, s.fim_tol) >= s.ini_tol) AS n_ocorrencias,
         -- Grao de DIA: provas_mar nao tem hora. Ver ressalva no cabecalho.
         (SELECT count(*) FROM public.provas_mar pm
           WHERE pm.lancha_id = s.lancha_uuid
             AND pm.data = s.dia_inicio) AS n_provas_mar
    FROM s
)
SELECT
  c.ds_lancha,
  c.cd_lancha,
  c.nr_saida,
  c.inicio,
  c.fim,
  c.dia_inicio,
  c.hora_inicio,
  c.noturna,
  c.duracao_h,
  c.horas_movimento,
  c.horas_parada,
  c.horas_nao_resolvidas,
  c.cobertura_pct,
  c.base_origem,
  c.base_destino,
  c.travessia,
  c.afastamento_max_km,
  c.sog_max,
  c.passou_iate_clube,
  c.curta_e_perto,
  c.em_aberto,
  c.n_manobras,
  c.n_abastecimentos,
  c.n_ocorrencias,
  c.n_provas_mar,
  (c.n_manobras       > 0) AS tem_manobra,
  (c.n_abastecimentos > 0) AS tem_abastecimento,
  (c.n_ocorrencias    > 0) AS tem_ocorrencia_aberta,
  (c.n_provas_mar     > 0) AS tem_prova_mar_no_dia,
  CASE
    WHEN c.curta_e_perto        THEN 'movimento_no_berco'
    WHEN c.n_manobras       > 0 THEN 'manobra'
    WHEN c.travessia            THEN 'travessia'
    WHEN c.n_abastecimentos > 0 THEN 'abastecimento'
    WHEN c.n_provas_mar     > 0 THEN 'prova_de_mar'
    WHEN c.n_ocorrencias    > 0 THEN 'ocorrencia'
    ELSE 'sem_registro'
  END AS motivo,
  -- Quao bem o motivo se sustenta. Nao e sobre o motivo estar certo: e sobre
  -- o AIS ter enxergado o episodio inteiro. Uma saida com cobertura de 40%
  -- pode ter tido uma manobra dentro do buraco.
  CASE
    WHEN c.em_aberto             THEN 'episodio_em_aberto'
    WHEN c.cobertura_pct < 70    THEN 'cobertura_baixa'
    ELSE 'ok'
  END AS confianca,
  (SELECT tolerancia_min FROM par) AS tolerancia_min
FROM cruza c;

COMMENT ON VIEW public.v_ais_saida_motivo IS
  'Cada saida da base cruzada com manobras, abastecimentos, ocorrencias e provas de mar. `motivo` aplica precedencia (manobra > travessia > abastecimento > prova_de_mar > ocorrencia > sem_registro); as colunas booleanas mostram todas as marcas simultaneas. ATENCAO: `sem_registro` levanta a pergunta, nao a responde — pode ser teste pos-manutencao, reposicionamento ou registro faltando. provas_mar casa por DIA, nao por hora.';

GRANT SELECT ON public.v_ais_saida_motivo TO anon, authenticated;

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────

-- 1) O PANORAMA. Quanto de cada motivo, e quanto tempo de movimento cada um
--    representa. E a leitura que a gestao pediu.
--
-- SELECT motivo,
--        count(*)                        AS saidas,
--        round(sum(horas_movimento), 1)  AS movimento_h,
--        round(avg(duracao_h), 2)        AS dur_media_h,
--        count(*) FILTER (WHERE noturna) AS noturnas
--   FROM public.v_ais_saida_motivo
--  GROUP BY 1 ORDER BY 2 DESC;

-- 2) AS SEM REGISTRO, as maiores primeiro. Comece por aqui a investigacao:
--    saida longa e sem explicacao e o caso que vale abrir.
--
-- SELECT ds_lancha, inicio, duracao_h, horas_movimento, afastamento_max_km,
--        sog_max, base_origem, base_destino, cobertura_pct, confianca
--   FROM public.v_ais_saida_motivo
--  WHERE motivo = 'sem_registro' AND confianca = 'ok'
--  ORDER BY horas_movimento DESC
--  LIMIT 25;

-- 3) QUANTAS MARCAS AO MESMO TEMPO. Confirma que a precedencia nao esta
--    escondendo combinacao frequente.
--
-- SELECT tem_manobra, travessia, tem_abastecimento, tem_prova_mar_no_dia,
--        count(*)
--   FROM public.v_ais_saida_motivo
--  WHERE NOT curta_e_perto
--  GROUP BY 1,2,3,4 ORDER BY 5 DESC LIMIT 15;

-- 4) AGOSTO/2026, por lancha — o formato que vai para o relatorio mensal.
--
-- SELECT ds_lancha, motivo, count(*) AS saidas,
--        round(sum(horas_movimento), 1) AS movimento_h
--   FROM public.v_ais_saida_motivo
--  WHERE dia_inicio BETWEEN '2026-08-01' AND '2026-08-31'
--  GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- 5) A TOLERANCIA DE 15 MIN ESTA ROUBANDO MANOBRA DA VIZINHA? Se uma manobra
--    cai na janela de duas saidas, ela e contada duas vezes. ESPERADO: numero
--    baixo perto das 16 mil manobras.
--
-- SELECT count(*) AS manobras_contadas_em_duas_saidas
--   FROM (
--     SELECT m.cd_manobra
--       FROM public.manobras_lanchas m
--       JOIN public.v_ais_saida_motivo v
--         ON v.cd_lancha = m.cd_lancha
--        AND m.dh_manobra >= v.inicio - interval '15 minutes'
--        AND m.dh_manobra <= COALESCE(v.fim, v.inicio) + interval '15 minutes'
--      GROUP BY m.cd_manobra
--     HAVING count(*) > 1
--   ) x;
