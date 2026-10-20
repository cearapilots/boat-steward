-- ─────────────────────────────────────────────────────────────────────────────
-- Cercas digitais (geofences) — Mucuripe, Pecém e Iate Clube
--
-- Origem: digital-fence/FleetIQ_AIS_Digital_Fences_Context.md + 3 KMZ,
-- recebidos em 10/09/2026.
--
-- VERIFICADO ANTES DE ESCREVER:
--  · os três SHA-256 declarados no .md batem com os arquivos;
--  · todos os vértices transcritos no .md batem com os KML dentro dos KMZ;
--  · ponto-em-polígono sobre as 707.222 posições históricas devolve
--    Flexeiras 37,0% Mucuripe / 21,6% Pecém / 0,4% Iate Clube / 40,9% fora e
--    Fortim 25,4% / 28,9% / 0,3% / 45,5%. As cercas contêm de fato os atracados.
--
-- DUAS DECISÕES DE DESENHO, ambas vindas do próprio documento:
--
--  1. Versionamento em vez de sobrescrita. O texto é explícito: se o berço de
--     Pecém mudar, a cerca e sua data devem ser versionadas, nunca sobrescritas
--     em silêncio. Daí `vigencia_inicio` / `vigencia_fim`.
--
--  2. A classificação NÃO entra em `posicoes_ais`. O documento pede preservar a
--     observação crua separada da classificação derivada. A cerca de cada
--     posição é resolvida na view `v_ais_cercas`, contra a versão vigente —
--     assim, corrigir um polígono reclassifica o histórico sozinho, sem
--     reescrever dado bruto.
--
-- ⚠️ `vigencia_inicio` fica NULA de propósito. O .md avisa que 10/09/2026 é a
--    data de RECEBIMENTO da geometria, não prova de quando o arranjo físico
--    começou. Nulo aqui significa "início desconhecido; assume-se que cobre
--    todo o histórico disponível" — e não uma data inventada.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── PASSO 1 — tabela das cercas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cercas_digitais (
  id               bigserial PRIMARY KEY,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  papel            text NOT NULL CHECK (papel IN ('base', 'area_operacional')),
  geom             geography(Polygon, 4326) NOT NULL,
  vigencia_inicio  date,
  vigencia_fim     date,
  data_recebimento date NOT NULL,
  arquivo_origem   text,
  sha256_origem    text,
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cercas_digitais IS
  'Poligonos operacionais das lanchas. Versionados: vigencia_fim NULL = versao vigente.';
COMMENT ON COLUMN public.cercas_digitais.vigencia_inicio IS
  'Inicio da vigencia. NULO = desconhecido; assume-se cobertura de todo o historico. Nao confundir com data_recebimento.';
COMMENT ON COLUMN public.cercas_digitais.papel IS
  'base = berco normal da lancha. area_operacional = area de evento, como o Iate Clube, que NAO e estadia em base.';

-- Uma unica versao vigente por cerca.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cercas_vigente
  ON public.cercas_digitais (codigo) WHERE vigencia_fim IS NULL;

CREATE INDEX IF NOT EXISTS idx_cercas_geom
  ON public.cercas_digitais USING gist (geom);

-- ── PASSO 2 — as tres geometrias ─────────────────────────────────────────────
-- ST_ForcePolygonCCW antes do cast: em `geography`, um anel com orientacao
-- invertida representaria o COMPLEMENTO do poligono — o planeta inteiro menos a
-- cerca. Todos os pontos apareceriam "dentro".
INSERT INTO public.cercas_digitais
  (codigo, nome, papel, geom, vigencia_inicio, data_recebimento,
   arquivo_origem, sha256_origem, observacao)
VALUES
  ('mucuripe_base', 'Mucuripe — base', 'base',
   ST_ForcePolygonCCW(ST_GeomFromText('POLYGON((
      -38.47679608172712 -3.714584597910847,
      -38.47654977857010 -3.714234021950847,
      -38.47671617668461 -3.714097412105192,
      -38.47697269588097 -3.714464326234725,
      -38.47679608172712 -3.714584597910847))', 4326))::geography,
   NULL, DATE '2026-09-10', 'Mucuripe-digital-fence.kmz',
   '14df585d93a9039a98d330ba9eab36817f3737bfc0c01378252ab64191a7cdd4',
   'Entorno imediato do berco normal em Mucuripe. ~1.152 m2.'),

  ('pecem_base', 'Pecém — base', 'base',
   ST_ForcePolygonCCW(ST_GeomFromText('POLYGON((
      -38.79653422383452 -3.532796604408956,
      -38.79687375519750 -3.533119416657107,
      -38.79632473610798 -3.533664255773551,
      -38.79607145906208 -3.533446871649341,
      -38.79653422383452 -3.532796604408956))', 4326))::geography,
   NULL, DATE '2026-09-10', 'pecem_digital-fence.kmz',
   'f2e6928304786ce56c193915061df70626cdaa1494a96d7a4606a0ba321cf497',
   'Berco ATUALMENTE usado em Pecem. Se mudar, encerre esta versao e insira outra — nao edite esta linha. ~3.855 m2.'),

  ('iate_clube', 'Iate Clube — área de transferência', 'area_operacional',
   ST_ForcePolygonCCW(ST_GeomFromText('POLYGON((
      -38.47776711776552 -3.720162142421247,
      -38.47787683352963 -3.719766700436927,
      -38.47882460523975 -3.719777122352005,
      -38.47859711597528 -3.720339771010637,
      -38.47776711776552 -3.720162142421247))', 4326))::geography,
   NULL, DATE '2026-09-10', 'Iate_clube-digital-fence.kmz',
   'b95c39f4d7a77ed05fc19a961e78efb9282982b15bc0bd446370038875d82d63',
   'Local OPCIONAL de embarque/desembarque, limitado por ondas e marulho. Visita aqui e evento operacional, NAO estadia em base. ~5.425 m2, a ~0,65 km de Mucuripe.')
ON CONFLICT DO NOTHING;

-- ── PASSO 3 — geometria indexavel nas posicoes ───────────────────────────────
-- Coluna gerada: e a MESMA coordenada em outro tipo, nao uma classificacao.
-- Sem ela e sem o indice GiST, consultar por cerca varre 707 mil linhas
-- construindo o ponto uma a uma.
ALTER TABLE public.posicoes_ais
  ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN dc_latitude IS NOT NULL AND dc_longitude IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint(dc_longitude, dc_latitude), 4326)::geography
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_posicoes_ais_geom
  ON public.posicoes_ais USING gist (geom);

-- ── PASSO 4 — a view que classifica ──────────────────────────────────────────
-- LATERAL com LIMIT 1: hoje os tres poligonos sao disjuntos, mas se um dia se
-- sobrepuserem um JOIN comum duplicaria a posicao. Aqui ela sai uma vez so.
CREATE OR REPLACE VIEW public.v_ais_cercas AS
SELECT p.id, p.cd_lancha, p.ds_lancha, p.dh_posicao,
       p.dc_latitude, p.dc_longitude, p.dc_sog, p.dc_cog, p.tem_posicao,
       c.codigo AS cerca_codigo,
       c.papel  AS cerca_papel,
       -- Só as duas bases contam como base: Iate Clube e area de evento.
       (c.papel = 'base') AS dentro_base
  FROM public.posicoes_ais p
  LEFT JOIN LATERAL (
       SELECT cd.codigo, cd.papel
         FROM public.cercas_digitais cd
        WHERE cd.vigencia_fim IS NULL
          AND p.geom IS NOT NULL
          AND ST_Covers(cd.geom, p.geom)
        LIMIT 1
  ) c ON true;

COMMENT ON VIEW public.v_ais_cercas IS
  'Posicoes AIS com a cerca vigente que as contem. cerca_codigo NULO = fora de todas OU sem coordenada: distinga por tem_posicao.';

-- ── PASSO 5 — RLS e permissoes, padrao do projeto ────────────────────────────
ALTER TABLE public.cercas_digitais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios autenticados podem tudo" ON public.cercas_digitais;
CREATE POLICY "usuarios autenticados podem tudo"
  ON public.cercas_digitais FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leitura publica cercas_digitais" ON public.cercas_digitais;
CREATE POLICY "leitura publica cercas_digitais"
  ON public.cercas_digitais FOR SELECT TO anon USING (true);

GRANT SELECT ON public.cercas_digitais TO anon, authenticated;
GRANT SELECT ON public.v_ais_cercas    TO anon, authenticated;

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
-- Deve reproduzir os percentuais medidos fora do banco:
--   Flexeiras 37,0 / 21,6 / 0,4 / 40,9   ·   Fortim 25,4 / 28,9 / 0,3 / 45,5
--
--   select ds_lancha, coalesce(cerca_codigo, 'FORA') as onde, count(*),
--          round(100.0*count(*) / sum(count(*)) over (partition by ds_lancha), 1) as pct
--     from public.v_ais_cercas where tem_posicao
--    group by 1, 2 order by 1, 3 desc;
--
-- Se algo der ~100% dentro, a orientacao do anel inverteu — veja o PASSO 2.
--
-- Area e perimetro contra o que o .md declara (1.152 / 3.855 / 5.425 m2):
--
--   select codigo,
--          round(ST_Area(geom)::numeric)      as area_m2,
--          round(ST_Perimeter(geom)::numeric) as perim_m
--     from public.cercas_digitais where vigencia_fim is null order by codigo;
