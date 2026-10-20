-- ─────────────────────────────────────────────────────────────────────────────
-- Fusão: as 8 tabelas do projeto `pilotgrid-assets` entram aqui
--
-- ─── POR QUE ─────────────────────────────────────────────────────────────────
--
-- A conta tinha dois projetos Supabase. Para assinar o plano Pro com um projeto
-- só, o `pilotgrid-assets` (esllvccotfvppatlvwwx) vem para dentro do projeto de
-- Controle de Horimetros (ejmlhoxhiupdobdlzjnh). O de origem sera APAGADO.
--
-- ⚠️ A copia fria de tudo — DDL, as 68 linhas e os 26 arquivos de storage —
--    esta em `pilotgrid-backup-2026-10-01/`. Depois que o projeto de origem for
--    apagado, aquela pasta e o UNICO rollback que existe. Nao a mova sem copia.
--
-- ─── O QUE ENTRA ─────────────────────────────────────────────────────────────
--
-- 8 tabelas de CADASTRO (68 linhas no total), que descrevem o canal de acesso
-- de Mucuripe e Pecem para o PilotGrid: sinais nauticos, grupos, gates entre
-- sinais, cadeias de gates, zonas e sequencias de zonas.
--
-- Nao e dado transacional e nao cresce sozinho — e editado a mao pela gestao.
--
-- ─── COLISAO: nenhuma de tabela, uma de funcao ───────────────────────────────
--
-- Nenhum objeto `nautical_*` existia aqui. A unica sobreposicao era a funcao
-- `public.set_updated_at()`, que JA EXISTE neste projeto desde 27/08/2026 e e
-- funcionalmente identica a de la (as duas so fazem `NEW.updated_at := now()`).
-- Por isso esta migration NAO a recria: os 6 triggers abaixo usam a que ja esta.
--
-- ─── SEGURANCA: decisao consciente da gestao ─────────────────────────────────
--
-- ⚠️ A politica e `FOR ALL TO authenticated USING true`, copiada como estava.
--    Consequencia da fusao: os 4 usuarios deste projeto — e nao so os 2 que
--    existiam no pilotgrid — passam a ter leitura e escrita nestas tabelas.
--
--    Isso foi levantado e ACEITO pela gestao em 01/10/2026: o PilotGrid e
--    editado so pelo chefe, e os outros usuarios nao tem nem o link. Se um dia
--    a equipe crescer, o lugar de apertar e aqui, trocando `USING true` por uma
--    lista de e-mails ou uma tabela de perfis.
--
-- ─── OS DADOS NAO ESTAO AQUI, E E DE PROPOSITO ───────────────────────────────
--
-- Esta migration cria so a ESTRUTURA. As 68 linhas sao carregadas por script a
-- partir do backup, porque este repositorio e publico e as zonas, gates e
-- cadeias sao a definicao operacional do canal — nao e coisa de versionar
-- aberto. Os sinais nauticos em si sao informacao de carta, mas o recorte e o
-- agrupamento que a praticagem faz deles, nao.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Grupos de sinais ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nautical_sign_groups (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  port_code   text        NOT NULL,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nautical_sign_groups_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_nsg_port ON public.nautical_sign_groups (port_code);

-- ── 2. Sinais náuticos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nautical_signs (
  id             uuid           NOT NULL DEFAULT gen_random_uuid(),
  port_code      text           NOT NULL,
  group_id       uuid,
  type           text           NOT NULL,
  name           text           NOT NULL,
  latitude       numeric(10,7)  NOT NULL,
  longitude      numeric(10,7)  NOT NULL,
  characteristic text,
  notes          text,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT nautical_signs_pkey PRIMARY KEY (id),
  CONSTRAINT nautical_signs_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES public.nautical_sign_groups(id) ON DELETE SET NULL,
  CONSTRAINT nautical_signs_latitude_check  CHECK (latitude  >= -90  AND latitude  <= 90),
  CONSTRAINT nautical_signs_longitude_check CHECK (longitude >= -180 AND longitude <= 180),
  CONSTRAINT nautical_signs_type_check CHECK (type = ANY (ARRAY[
    'lateralPort','lateralStarboard','cardinalN','cardinalE',
    'cardinalS','cardinalW','wreck','special']))
);
CREATE INDEX IF NOT EXISTS idx_ns_port  ON public.nautical_signs (port_code);
CREATE INDEX IF NOT EXISTS idx_ns_group ON public.nautical_signs (group_id);

-- ── 3. Gates: a linha entre dois pontos ──────────────────────────────────────
-- Cada ponta e um sinal cadastrado OU uma coordenada solta. Os dois CHECK
-- `endpoint_*_valid` garantem que a ponta tenha o que o seu tipo exige.
CREATE TABLE IF NOT EXISTS public.nautical_sign_gates (
  id                 uuid          NOT NULL DEFAULT gen_random_uuid(),
  port_code          text          NOT NULL,
  name               text          NOT NULL,
  endpoint_a_kind    text          NOT NULL,
  endpoint_a_sign_id uuid,
  endpoint_a_lng     numeric(10,7),
  endpoint_a_lat     numeric(10,7),
  endpoint_b_kind    text          NOT NULL,
  endpoint_b_sign_id uuid,
  endpoint_b_lng     numeric(10,7),
  endpoint_b_lat     numeric(10,7),
  notes              text,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT nautical_sign_gates_pkey PRIMARY KEY (id),
  CONSTRAINT nautical_sign_gates_endpoint_a_sign_id_fkey FOREIGN KEY (endpoint_a_sign_id)
    REFERENCES public.nautical_signs(id) ON DELETE SET NULL,
  CONSTRAINT nautical_sign_gates_endpoint_b_sign_id_fkey FOREIGN KEY (endpoint_b_sign_id)
    REFERENCES public.nautical_signs(id) ON DELETE SET NULL,
  CONSTRAINT nautical_sign_gates_endpoint_a_kind_check CHECK (endpoint_a_kind = ANY (ARRAY['sign','free'])),
  CONSTRAINT nautical_sign_gates_endpoint_b_kind_check CHECK (endpoint_b_kind = ANY (ARRAY['sign','free'])),
  CONSTRAINT endpoint_a_valid CHECK (
    (endpoint_a_kind = 'sign' AND endpoint_a_sign_id IS NOT NULL)
    OR (endpoint_a_kind = 'free' AND endpoint_a_lng IS NOT NULL AND endpoint_a_lat IS NOT NULL)),
  CONSTRAINT endpoint_b_valid CHECK (
    (endpoint_b_kind = 'sign' AND endpoint_b_sign_id IS NOT NULL)
    OR (endpoint_b_kind = 'free' AND endpoint_b_lng IS NOT NULL AND endpoint_b_lat IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_nsgate_port   ON public.nautical_sign_gates (port_code);
CREATE INDEX IF NOT EXISTS idx_nsgate_a_sign ON public.nautical_sign_gates (endpoint_a_sign_id)
  WHERE endpoint_a_sign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nsgate_b_sign ON public.nautical_sign_gates (endpoint_b_sign_id)
  WHERE endpoint_b_sign_id IS NOT NULL;

-- ── 4. Cadeias de gates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nautical_gate_chains (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  port_code         text        NOT NULL,
  name              text        NOT NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  transit_direction text,
  CONSTRAINT nautical_gate_chains_pkey PRIMARY KEY (id),
  CONSTRAINT nautical_gate_chains_transit_direction_check
    CHECK (transit_direction = ANY (ARRAY['entrada','saida']))
);
CREATE INDEX IF NOT EXISTS idx_ngc_port ON public.nautical_gate_chains (port_code);

CREATE TABLE IF NOT EXISTS public.nautical_gate_chain_members (
  chain_id uuid    NOT NULL,
  gate_id  uuid    NOT NULL,
  position integer NOT NULL,
  CONSTRAINT nautical_gate_chain_members_pkey PRIMARY KEY (chain_id, "position"),
  CONSTRAINT nautical_gate_chain_members_chain_id_fkey FOREIGN KEY (chain_id)
    REFERENCES public.nautical_gate_chains(id) ON DELETE CASCADE,
  CONSTRAINT nautical_gate_chain_members_gate_id_fkey FOREIGN KEY (gate_id)
    REFERENCES public.nautical_sign_gates(id) ON DELETE CASCADE
);
-- A origem tinha `idx_ngcm_chain` e `idx_chain_members_chain`, os dois em
-- (chain_id) — duplicata. Mantido um so.
CREATE INDEX IF NOT EXISTS idx_ngcm_chain ON public.nautical_gate_chain_members (chain_id);
CREATE INDEX IF NOT EXISTS idx_ngcm_gate  ON public.nautical_gate_chain_members (gate_id);

-- ── 5. Zonas e sequências ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nautical_zones (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  port_code  text        NOT NULL,
  name       text        NOT NULL,
  vertices   jsonb       NOT NULL,
  color      text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nautical_zones_pkey PRIMARY KEY (id),
  CONSTRAINT vertices_is_polygon CHECK (
    jsonb_typeof(vertices) = 'array' AND jsonb_array_length(vertices) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_nz_port ON public.nautical_zones (port_code);

CREATE TABLE IF NOT EXISTS public.nautical_zone_sequences (
  id                uuid          NOT NULL DEFAULT gen_random_uuid(),
  port_code         text          NOT NULL,
  name              text          NOT NULL,
  transit_direction text,
  reference_lon     numeric(10,7),
  reference_lat     numeric(10,7),
  notes             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT nautical_zone_sequences_pkey PRIMARY KEY (id),
  CONSTRAINT nautical_zone_sequences_transit_direction_check
    CHECK (transit_direction = ANY (ARRAY['entrada','saida'])),
  CONSTRAINT nautical_zone_sequences_reference_lat_check
    CHECK (reference_lat >= -90  AND reference_lat <= 90),
  CONSTRAINT nautical_zone_sequences_reference_lon_check
    CHECK (reference_lon >= -180 AND reference_lon <= 180)
);
CREATE INDEX IF NOT EXISTS idx_nzs_port ON public.nautical_zone_sequences (port_code);

CREATE TABLE IF NOT EXISTS public.nautical_zone_sequence_members (
  sequence_id uuid    NOT NULL,
  zone_id     uuid    NOT NULL,
  position    integer NOT NULL,
  CONSTRAINT nautical_zone_sequence_members_pkey PRIMARY KEY (sequence_id, "position"),
  CONSTRAINT nautical_zone_sequence_members_sequence_id_fkey FOREIGN KEY (sequence_id)
    REFERENCES public.nautical_zone_sequences(id) ON DELETE CASCADE,
  CONSTRAINT nautical_zone_sequence_members_zone_id_fkey FOREIGN KEY (zone_id)
    REFERENCES public.nautical_zones(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_nzsm_seq  ON public.nautical_zone_sequence_members (sequence_id);
CREATE INDEX IF NOT EXISTS idx_nzsm_zone ON public.nautical_zone_sequence_members (zone_id);


-- ═══ RLS — copiada da origem, sem alteração ══════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'nautical_sign_groups','nautical_signs','nautical_sign_gates',
    'nautical_gate_chains','nautical_gate_chain_members',
    'nautical_zones','nautical_zone_sequences','nautical_zone_sequence_members']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY authenticated_full_access ON public.%I '
      'AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;


-- ═══ Triggers de updated_at ══════════════════════════════════════════════════
-- Usam a `public.set_updated_at()` que JA EXISTE neste projeto. Nomes mantidos
-- iguais aos da origem, para o diff contra o backup ficar legivel.
DROP TRIGGER IF EXISTS trg_nsg_updated_at    ON public.nautical_sign_groups;
CREATE TRIGGER trg_nsg_updated_at    BEFORE UPDATE ON public.nautical_sign_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ns_updated_at     ON public.nautical_signs;
CREATE TRIGGER trg_ns_updated_at     BEFORE UPDATE ON public.nautical_signs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_nsgate_updated_at ON public.nautical_sign_gates;
CREATE TRIGGER trg_nsgate_updated_at BEFORE UPDATE ON public.nautical_sign_gates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ngc_updated_at    ON public.nautical_gate_chains;
CREATE TRIGGER trg_ngc_updated_at    BEFORE UPDATE ON public.nautical_gate_chains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_nz_updated_at     ON public.nautical_zones;
CREATE TRIGGER trg_nz_updated_at     BEFORE UPDATE ON public.nautical_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_nzs_updated_at    ON public.nautical_zone_sequences;
CREATE TRIGGER trg_nzs_updated_at    BEFORE UPDATE ON public.nautical_zone_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ⚠️ O trigger `nao_apaga_com_nulo` (migration 20260930120000) NAO entra aqui.
--    Ele existe para proteger tabela alimentada por SYNC contra regressao de
--    contrato do WebPilot. Estas sao editadas a mao pela gestao, e apagar um
--    campo de proposito e operacao legitima — barrar o nulo atrapalharia.

COMMENT ON TABLE public.nautical_signs IS
  'Sinais nauticos (boias, balizas) de Mucuripe e Pecem. Veio do projeto '
  'pilotgrid-assets na fusao de 01/10/2026. Cadastro editado a mao, nao tem sync.';
COMMENT ON TABLE public.nautical_zones IS
  'Zonas do canal de acesso, com os vertices em jsonb. Minimo de 3 vertices.';
COMMENT ON TABLE public.nautical_sign_gates IS
  'Gates: a linha entre dois pontos, cada um sendo um sinal cadastrado ou uma '
  'coordenada solta. Base dos gate_crossings que o PilotGrid exporta.';

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────
--
-- Rodar DEPOIS do script de carga dos dados.
--
-- SELECT relname, n_live_tup FROM pg_stat_user_tables
--  WHERE relname LIKE 'nautical%' ORDER BY relname;
--    ESPERADO: groups 5, signs 41, gates 5, chains 2, chain_members 8,
--              zones 3, sequences 1, sequence_members 3  — 68 no total.
--
-- SELECT tablename, policyname, roles::text FROM pg_policies
--  WHERE tablename LIKE 'nautical%';
--    ESPERADO: 8 linhas, todas authenticated_full_access / {authenticated}.
