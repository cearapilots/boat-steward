
-- 1. LANCHAS
CREATE TABLE lanchas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              VARCHAR(50) NOT NULL UNIQUE,
  id_webpilot       VARCHAR(100),
  horimetro         NUMERIC(10,1) NOT NULL DEFAULT 0,
  horimetro_gerador NUMERIC(10,1) NOT NULL DEFAULT 0,
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN lanchas.horimetro         IS 'Horímetro principal da lancha, referência para motores e reversores';
COMMENT ON COLUMN lanchas.horimetro_gerador IS 'Horímetro do gerador — contador próprio, independente da lancha';
COMMENT ON COLUMN lanchas.id_webpilot       IS 'ID da lancha no sistema WebPilot (AllSystem) para integração automática';

-- 2. ATIVOS
CREATE TABLE ativos (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  VARCHAR(50) NOT NULL UNIQUE,
  tipo                  VARCHAR(20) NOT NULL CHECK (tipo IN ('motor', 'reversor', 'gerador')),
  numero_serie          VARCHAR(50),
  lancha_id             UUID REFERENCES lanchas(id) ON DELETE SET NULL,
  posicao               VARCHAR(10) CHECK (posicao IN ('BB', 'BE', NULL)),
  horimetro_equipamento NUMERIC(10,1) DEFAULT 0,
  offset_instalacao     NUMERIC(10,1) DEFAULT 0,
  intervalo_manutencao  INTEGER NOT NULL,
  intervalo_overhaul    INTEGER,
  ultima_troca_horimetro NUMERIC(10,1),
  ultima_troca_data      DATE,
  horimetro_overhaul    NUMERIC(10,1) DEFAULT 0,
  data_overhaul         DATE,
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN ativos.offset_instalacao     IS 'lancha.horimetro - equip.horimetro no momento da instalação. Negativo se motor tem mais horas que a lancha.';
COMMENT ON COLUMN ativos.horimetro_equipamento IS 'Horas acumuladas totais do equipamento físico. Para geradores é a leitura atual. Para motores/reversores é calculado e atualizado por trigger.';
COMMENT ON COLUMN ativos.ultima_troca_horimetro IS 'Para motores/reversores: h da LANCHA na última troca. Para geradores: h do próprio gerador.';
COMMENT ON COLUMN ativos.intervalo_manutencao  IS '250h=motor, 1000h=reversor, 200h=gerador';
COMMENT ON COLUMN ativos.intervalo_overhaul    IS '5000h=motor, 3000h=gerador, NULL=reversor (reversores não têm overhaul programado)';

-- 3. POSIÇÕES
CREATE TABLE posicoes (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id                       UUID NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
  lancha_id                      UUID REFERENCES lanchas(id) ON DELETE SET NULL,
  posicao                        VARCHAR(10) CHECK (posicao IN ('BB', 'BE', 'reserva', 'retirica')),
  data_instalacao                DATE NOT NULL,
  data_remocao                   DATE,
  horimetro_lancha_instalacao    NUMERIC(10,1) DEFAULT 0,
  horimetro_equipamento_instalacao NUMERIC(10,1) DEFAULT 0,
  offset_calculado               NUMERIC(10,1) DEFAULT 0,
  horas_operadas                 NUMERIC(10,1) DEFAULT 0,
  created_at                     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN posicoes.data_remocao IS 'NULL = ativo ainda nessa posição. Preenchido automaticamente quando nova posição é inserida.';
COMMENT ON COLUMN posicoes.horas_operadas IS 'Horas que o equipamento operou especificamente nesse período/posição.';
COMMENT ON TABLE  posicoes IS 'Histórico imutável. Nunca deletar registros. Ao trocar posição: fechar data_remocao do atual e inserir novo registro.';

-- 4. MANUTENÇÕES
CREATE TABLE manutencoes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id             UUID NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
  lancha_id            UUID REFERENCES lanchas(id) ON DELETE SET NULL,
  tipo                 VARCHAR(30) NOT NULL CHECK (tipo IN ('troca_oleo', 'overhaul', 'revisao_rolamentos', 'revisao_geral', 'outro')),
  data_manutencao      TIMESTAMPTZ NOT NULL,
  horimetro_lancha     NUMERIC(10,1),
  horimetro_equipamento NUMERIC(10,1),
  origem               VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'webpilot_sync', 'import_excel')),
  observacao           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN manutencoes.origem IS 'manual=inserido pelo usuário, webpilot_sync=veio da API, import_excel=migração inicial';

-- 5. HISTÓRICO
CREATE TABLE historico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_evento VARCHAR(30) NOT NULL CHECK (tipo_evento IN ('troca_oleo', 'overhaul', 'troca_posicao', 'revisao', 'falha', 'outro')),
  descricao   TEXT NOT NULL,
  ativo_id    UUID REFERENCES ativos(id) ON DELETE SET NULL,
  lancha_id   UUID REFERENCES lanchas(id) ON DELETE SET NULL,
  data_evento TIMESTAMPTZ NOT NULL,
  dados_extras JSONB,
  origem      VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'webpilot_sync', 'import_excel', 'sistema')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN historico.dados_extras IS 'JSONB flexível — guarda os dados específicos de cada tipo de evento sem precisar de colunas fixas.';

-- 6. SYNC LOG
CREATE TABLE sync_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executado_em TIMESTAMPTZ DEFAULT NOW(),
  status       VARCHAR(20) NOT NULL CHECK (status IN ('sucesso', 'erro', 'parcial')),
  lanchas_atualizadas INTEGER DEFAULT 0,
  eventos_importados  INTEGER DEFAULT 0,
  detalhe      TEXT
);

-- TRIGGER: updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_ativos
  BEFORE UPDATE ON ativos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- TRIGGER: calcular horas_operadas ao fechar posição
CREATE OR REPLACE FUNCTION trigger_calcular_horas_operadas()
RETURNS TRIGGER AS $$
DECLARE
  v_lancha_horimetro NUMERIC;
BEGIN
  IF NEW.data_remocao IS NOT NULL AND OLD.data_remocao IS NULL AND NEW.lancha_id IS NOT NULL THEN
    SELECT horimetro INTO v_lancha_horimetro
    FROM lanchas WHERE id = NEW.lancha_id;
    NEW.horas_operadas = v_lancha_horimetro - NEW.horimetro_lancha_instalacao;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calcular_horas_operadas
  BEFORE UPDATE ON posicoes
  FOR EACH ROW EXECUTE FUNCTION trigger_calcular_horas_operadas();

-- TRIGGER: atualizar ativo após manutenção
CREATE OR REPLACE FUNCTION trigger_atualizar_ativo_apos_manutencao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'troca_oleo' THEN
    UPDATE ativos SET
      ultima_troca_horimetro = NEW.horimetro_lancha,
      ultima_troca_data      = NEW.data_manutencao::DATE,
      updated_at             = NOW()
    WHERE id = NEW.ativo_id;
  ELSIF NEW.tipo = 'overhaul' THEN
    UPDATE ativos SET
      horimetro_overhaul = NEW.horimetro_equipamento,
      data_overhaul      = NEW.data_manutencao::DATE,
      updated_at         = NOW()
    WHERE id = NEW.ativo_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atualizar_ativo_apos_manutencao
  AFTER INSERT ON manutencoes
  FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_ativo_apos_manutencao();

-- VIEW: v_situacao_atual
CREATE OR REPLACE VIEW v_situacao_atual AS
SELECT
  l.id AS lancha_id, l.nome AS lancha_nome, l.horimetro AS lancha_horimetro,
  l.horimetro_gerador AS lancha_horimetro_gerador, l.ultima_atualizacao,
  a.id AS ativo_id, a.nome AS ativo_nome, a.tipo, a.posicao, a.numero_serie,
  a.intervalo_manutencao, a.intervalo_overhaul,
  a.ultima_troca_data, a.ultima_troca_horimetro,
  a.horimetro_overhaul, a.data_overhaul, a.offset_instalacao,
  CASE WHEN a.tipo = 'gerador' THEN l.horimetro_gerador
       ELSE ROUND(l.horimetro - a.offset_instalacao, 1) END AS horas_equipamento_calculadas,
  a.ultima_troca_horimetro + a.intervalo_manutencao AS proxima_troca_horimetro,
  CASE WHEN a.tipo = 'gerador'
       THEN (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro_gerador
       ELSE (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro END AS horas_restantes_troca,
  CASE WHEN a.intervalo_overhaul IS NOT NULL
       THEN a.horimetro_overhaul + a.intervalo_overhaul ELSE NULL END AS proximo_overhaul_horimetro,
  CASE WHEN a.intervalo_overhaul IS NOT NULL THEN
    (a.horimetro_overhaul + a.intervalo_overhaul)
    - CASE WHEN a.tipo = 'gerador' THEN l.horimetro_gerador
           ELSE ROUND(l.horimetro - a.offset_instalacao, 1) END
  ELSE NULL END AS horas_restantes_overhaul,
  CASE
    WHEN (CASE WHEN a.tipo = 'gerador' THEN (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro_gerador
               ELSE (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro END) < 0 THEN 'atrasado'
    WHEN (CASE WHEN a.tipo = 'gerador' THEN (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro_gerador
               ELSE (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro END) <= 50 THEN 'vermelho'
    WHEN (CASE WHEN a.tipo = 'gerador' THEN (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro_gerador
               ELSE (a.ultima_troca_horimetro + a.intervalo_manutencao) - l.horimetro END) <= 100 THEN 'amarelo'
    ELSE 'verde' END AS status_semaforo,
  CASE
    WHEN a.intervalo_overhaul IS NULL THEN NULL
    WHEN ((a.horimetro_overhaul + a.intervalo_overhaul) - CASE WHEN a.tipo = 'gerador' THEN l.horimetro_gerador ELSE ROUND(l.horimetro - a.offset_instalacao, 1) END) < 0 THEN 'atrasado'
    WHEN ((a.horimetro_overhaul + a.intervalo_overhaul) - CASE WHEN a.tipo = 'gerador' THEN l.horimetro_gerador ELSE ROUND(l.horimetro - a.offset_instalacao, 1) END) <= 500 THEN 'vermelho'
    WHEN ((a.horimetro_overhaul + a.intervalo_overhaul) - CASE WHEN a.tipo = 'gerador' THEN l.horimetro_gerador ELSE ROUND(l.horimetro - a.offset_instalacao, 1) END) <= 1000 THEN 'amarelo'
    ELSE 'verde' END AS status_overhaul
FROM ativos a
JOIN lanchas l ON l.id = a.lancha_id
WHERE a.ativo = TRUE AND a.lancha_id IS NOT NULL
UNION ALL
SELECT
  NULL, 'Reserva / Retífica', NULL, NULL, NOW(),
  a.id, a.nome, a.tipo, 'reserva', a.numero_serie,
  a.intervalo_manutencao, a.intervalo_overhaul,
  a.ultima_troca_data, a.ultima_troca_horimetro,
  a.horimetro_overhaul, a.data_overhaul, a.offset_instalacao,
  a.horimetro_equipamento,
  a.ultima_troca_horimetro + a.intervalo_manutencao,
  NULL,
  CASE WHEN a.intervalo_overhaul IS NOT NULL THEN a.horimetro_overhaul + a.intervalo_overhaul ELSE NULL END,
  NULL, NULL, NULL
FROM ativos a
WHERE a.ativo = TRUE AND a.lancha_id IS NULL;

-- ÍNDICES
CREATE INDEX idx_ativos_lancha     ON ativos(lancha_id);
CREATE INDEX idx_ativos_tipo       ON ativos(tipo);
CREATE INDEX idx_posicoes_ativo    ON posicoes(ativo_id);
CREATE INDEX idx_posicoes_lancha   ON posicoes(lancha_id);
CREATE INDEX idx_posicoes_ativa    ON posicoes(ativo_id) WHERE data_remocao IS NULL;
CREATE INDEX idx_manutencoes_ativo ON manutencoes(ativo_id);
CREATE INDEX idx_manutencoes_data  ON manutencoes(data_manutencao DESC);
CREATE INDEX idx_historico_lancha  ON historico(lancha_id);
CREATE INDEX idx_historico_data    ON historico(data_evento DESC);
CREATE INDEX idx_historico_tipo    ON historico(tipo_evento);

-- RLS
ALTER TABLE lanchas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ativos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE posicoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE manutencoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios autenticados podem tudo" ON lanchas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "usuarios autenticados podem tudo" ON ativos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "usuarios autenticados podem tudo" ON posicoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "usuarios autenticados podem tudo" ON manutencoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "usuarios autenticados podem tudo" ON historico FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "usuarios autenticados podem tudo" ON sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
