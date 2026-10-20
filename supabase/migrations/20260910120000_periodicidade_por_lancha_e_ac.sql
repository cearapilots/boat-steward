-- ─────────────────────────────────────────────────────────────────────────────
-- Periodicidade própria por lancha + data de instalação do ar-condicionado
--
-- Pedido da gestão em 10/09/2026:
--   1. a limpeza do ar-condicionado da Fortim passa a ser mensal; as demais
--      lanchas continuam em 60 dias;
--   2. o Dashboard deve mostrar a data de instalação do AC de cada lancha e há
--      quanto tempo ele está em uso.
--
-- Por que uma tabela nova. `manutencoes_periodicas_tipos.periodicidade_dias` é
-- um valor por TIPO, válido para a frota inteira. Mudá-lo para 30 alteraria as
-- três lanchas. A exceção precisa ser por (lancha, tipo), e isso não existia.
--
-- ATENÇÃO — a view `v_manutencoes_periodicas_status` nunca esteve em migration
-- nenhuma: foi criada direto no editor SQL. A definição abaixo foi capturada de
-- `pg_get_viewdef` em 10/09/2026 e só acrescenta o COALESCE da exceção. Se
-- alguém tiver alterado a view depois dessa data, confira antes de rodar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASSO 1 — exceção de periodicidade por lancha ────────────────────────────
CREATE TABLE IF NOT EXISTS public.manutencoes_periodicas_excecoes (
  lancha_id          uuid        NOT NULL REFERENCES public.lanchas(id) ON DELETE CASCADE,
  tipo_id            uuid        NOT NULL REFERENCES public.manutencoes_periodicas_tipos(id) ON DELETE CASCADE,
  periodicidade_dias integer     NOT NULL CHECK (periodicidade_dias > 0),
  observacao         text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lancha_id, tipo_id)
);

COMMENT ON TABLE public.manutencoes_periodicas_excecoes IS
  'Periodicidade própria de uma lancha para um tipo de periódica. Sem linha aqui, vale manutencoes_periodicas_tipos.periodicidade_dias.';

ALTER TABLE public.manutencoes_periodicas_excecoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios autenticados podem tudo" ON public.manutencoes_periodicas_excecoes;
CREATE POLICY "usuarios autenticados podem tudo"
  ON public.manutencoes_periodicas_excecoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leitura publica manutencoes_periodicas_excecoes" ON public.manutencoes_periodicas_excecoes;
CREATE POLICY "leitura publica manutencoes_periodicas_excecoes"
  ON public.manutencoes_periodicas_excecoes
  FOR SELECT TO anon USING (true);

-- ── PASSO 2 — AC da Fortim passa a mensal ────────────────────────────────────
INSERT INTO public.manutencoes_periodicas_excecoes
  (lancha_id, tipo_id, periodicidade_dias, observacao)
VALUES
  ('a0000000-0000-0000-0000-000000000002',   -- Fortim
   '6e892c99-3082-41c8-ab70-4530c54eb6f9',   -- Limpeza/manutencao ar-condicionado
   30,
   'Pedido da gestao em 10/09/2026: AC da Fortim mensal; demais lanchas seguem em 60 dias.')
ON CONFLICT (lancha_id, tipo_id) DO UPDATE
  SET periodicidade_dias = EXCLUDED.periodicidade_dias,
      observacao         = EXCLUDED.observacao,
      updated_at         = now();

-- ── PASSO 3 — a view passa a respeitar a exceção ─────────────────────────────
-- Idêntica à original, com duas mudanças: o LEFT JOIN da tabela de exceções e
-- o COALESCE resolvido uma única vez no LATERAL, para não repetir a expressão
-- nas quatro colunas que dependem dela.
CREATE OR REPLACE VIEW public.v_manutencoes_periodicas_status AS
 SELECT mp.id,
    mp.lancha_id,
    l.nome AS lancha_nome,
    mpt.id AS tipo_id,
    mpt.nome AS tipo_nome,
    p.periodicidade_dias,
    mp.data_realizada AS ultima_realizada,
    mp.data_realizada + p.periodicidade_dias AS proxima_data,
    mp.data_realizada + p.periodicidade_dias - CURRENT_DATE AS dias_restantes,
        CASE
            WHEN (mp.data_realizada + p.periodicidade_dias - CURRENT_DATE) < 0 THEN 'vencido'::text
            WHEN (mp.data_realizada + p.periodicidade_dias - CURRENT_DATE) <= 10 THEN 'atencao'::text
            ELSE 'ok'::text
        END AS status
   FROM ( SELECT DISTINCT ON (manutencoes_periodicas.lancha_id, manutencoes_periodicas.tipo_id) manutencoes_periodicas.id,
            manutencoes_periodicas.lancha_id,
            manutencoes_periodicas.tipo_id,
            manutencoes_periodicas.data_realizada
           FROM manutencoes_periodicas
          ORDER BY manutencoes_periodicas.lancha_id, manutencoes_periodicas.tipo_id, manutencoes_periodicas.data_realizada DESC) mp
     JOIN lanchas l ON l.id = mp.lancha_id
     JOIN manutencoes_periodicas_tipos mpt ON mpt.id = mp.tipo_id
     LEFT JOIN public.manutencoes_periodicas_excecoes pp
            ON pp.lancha_id = mp.lancha_id AND pp.tipo_id = mp.tipo_id
     CROSS JOIN LATERAL (
            SELECT COALESCE(pp.periodicidade_dias, mpt.periodicidade_dias) AS periodicidade_dias
     ) p;

-- ── PASSO 4 — data de instalação do ar-condicionado ──────────────────────────
ALTER TABLE public.lanchas ADD COLUMN IF NOT EXISTS ac_data_instalacao date;

COMMENT ON COLUMN public.lanchas.ac_data_instalacao IS
  'Data de instalacao do ar-condicionado atual. Exibida no tooltip do Dashboard.';

-- ── PASSO 5 — valores, PENDENTES DE CONFIRMACAO ──────────────────────────────
-- As datas abaixo foram lidas do texto livre de manutencoes_periodicas.observacao
-- e NAO estao confirmadas pela gestao. Descomente so depois de confirmar.
--
--   Flexeiras 27/05/2024  "Substituir condensador e evaporador (Equipamentos todos novos)"
--                         -- a mais discutivel: trocou componentes, nao o aparelho inteiro
--   Fortim    18/05/2024  "Substituicao do aparelho de ar-condicionado por um novo"
--   Taiba     07/12/2024  "Substituicao do ar condicionado"
--
-- UPDATE public.lanchas SET ac_data_instalacao = '2024-05-27' WHERE id = 'a0000000-0000-0000-0000-000000000001';
-- UPDATE public.lanchas SET ac_data_instalacao = '2024-05-18' WHERE id = 'a0000000-0000-0000-0000-000000000002';
-- UPDATE public.lanchas SET ac_data_instalacao = '2024-12-07' WHERE id = 'a0000000-0000-0000-0000-000000000003';

-- ── CONFERENCIA ──────────────────────────────────────────────────────────────
-- Deve mostrar Fortim com 30 dias e as outras duas com 60:
--
-- SELECT lancha_nome, periodicidade_dias, ultima_realizada, proxima_data, dias_restantes
--   FROM public.v_manutencoes_periodicas_status
--  WHERE tipo_id = '6e892c99-3082-41c8-ab70-4530c54eb6f9'
--  ORDER BY lancha_nome;
