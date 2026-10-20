-- ─────────────────────────────────────────────────────────────────────────────
-- Carga do histórico AIS — 2025-01-01 a 2026-09-10
--
-- Origem: ais_historical_backfill_2025-01-01_to_2026-09-10/
--   flexeiras_ais_historical_...csv   340.029 linhas
--   fortim_ais_historical_...csv      367.193 linhas
--
-- Operação pontual, não é migração de schema. Pode ser repetida à vontade:
-- o ON CONFLICT DO UPDATE reescreve a linha em vez de duplicar.
--
-- TRÊS COISAS MEDIDAS NOS ARQUIVOS ANTES DE ESCREVER ISTO:
--
--  1. Mesmo fuso do endpoint ao vivo. As últimas linhas do CSV da Flexeiras
--     são exatamente os registros que o endpoint devolve agora, com as mesmas
--     coordenadas — logo, hora local de Fortaleza. Daí o `|| '-03:00'`.
--
--  2. O CSV corta os milissegundos: "09:46:32" no arquivo contra
--     "09:46:32.953" no endpoint. Sem truncar os dois lados ao segundo, a
--     MESMA leitura entraria duas vezes na janela de 48h em que as fontes se
--     sobrepõem. A Edge Function foi ajustada para truncar também.
--     Conferido: truncar não funde leitura nenhuma, nem no histórico
--     (0 colisões em 707 mil linhas) nem no payload ao vivo.
--
--  3. O histórico NÃO tem registros sem coordenada — 0 de 707.222. O endpoint
--     ao vivo tem 39%. São fluxos diferentes e convivem sem conflito.
--
-- O `DISTINCT ON` não é enfeite: sem ele, se dois registros de origem caírem
-- na mesma chave, o Postgres aborta com "ON CONFLICT DO UPDATE command cannot
-- affect row a second time".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ETAPA 1 — staging com os nomes de coluna do próprio CSV ──────────────────
-- Os nomes batem com o cabeçalho para que a importação do painel mapeie sozinha.
CREATE TABLE IF NOT EXISTS public._stg_ais_historico (
  "CD_LANCHA"    text,
  "DS_LANCHA"    text,
  "NR_MMSI"      text,
  "DH_POSICAO"   text,
  "DC_LATITUDE"  text,
  "DC_LONGITUDE" text,
  "DC_SOG"       text,
  "DC_COG"       text
);

TRUNCATE public._stg_ais_historico;

-- ── ETAPA 2 — importar os dois CSVs para _stg_ais_historico ──────────────────
-- Table Editor → _stg_ais_historico → Insert → Import data from CSV.
-- Nada de SQL aqui. Confira a contagem antes de seguir:
--
--   select "DS_LANCHA", count(*) from public._stg_ais_historico group by 1;
--   -- esperado: FLEXEIRAS 340029, FORTIM 367193

-- ── ETAPA 3 — transferir, convertendo e deduplicando ─────────────────────────
INSERT INTO public.posicoes_ais
  (cd_lancha, ds_lancha, nr_mmsi, dh_posicao,
   dc_latitude, dc_longitude, dc_sog, dc_cog)
SELECT DISTINCT ON (
         "CD_LANCHA"::integer,
         date_trunc('second', ("DH_POSICAO" || '-03:00')::timestamptz),
         (NULLIF("DC_LATITUDE", '') IS NOT NULL AND NULLIF("DC_LONGITUDE", '') IS NOT NULL)
       )
       "CD_LANCHA"::integer,
       "DS_LANCHA",
       NULLIF("NR_MMSI", '')::bigint,
       date_trunc('second', ("DH_POSICAO" || '-03:00')::timestamptz),
       NULLIF("DC_LATITUDE",  '')::double precision,
       NULLIF("DC_LONGITUDE", '')::double precision,
       NULLIF("DC_SOG",  '')::double precision,
       NULLIF("DC_COG",  '')::double precision
  FROM public._stg_ais_historico
 WHERE NULLIF("DH_POSICAO", '') IS NOT NULL
   AND NULLIF("CD_LANCHA",  '') IS NOT NULL
ON CONFLICT (cd_lancha, dh_posicao, tem_posicao) DO UPDATE
   SET ds_lancha    = EXCLUDED.ds_lancha,
       nr_mmsi      = EXCLUDED.nr_mmsi,
       dc_latitude  = EXCLUDED.dc_latitude,
       dc_longitude = EXCLUDED.dc_longitude,
       dc_sog       = EXCLUDED.dc_sog,
       dc_cog       = EXCLUDED.dc_cog;

-- ── ETAPA 4 — conferir ───────────────────────────────────────────────────────
--   select ds_lancha,
--          count(*)                                  as linhas,
--          count(*) filter (where not tem_posicao)   as sem_posicao,
--          min(dh_posicao) at time zone 'America/Fortaleza' as primeira_brt,
--          max(dh_posicao) at time zone 'America/Fortaleza' as ultima_brt
--     from public.posicoes_ais group by 1 order by 1;
--
-- `primeira_brt` da Flexeiras deve dar 2025-01-01 00:01:10 — se der 21:01:10
-- do dia anterior, a conversão de fuso saiu errada.
--
-- Rodar a ETAPA 3 duas vezes NÃO pode mudar a contagem:
--   select count(*) from public.posicoes_ais;

-- ── ETAPA 5 — limpar ─────────────────────────────────────────────────────────
-- Só depois de conferir. A staging ocupa ~50 MB.
--   DROP TABLE public._stg_ais_historico;
