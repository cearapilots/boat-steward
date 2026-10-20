-- ─────────────────────────────────────────────────────────────────────────────
-- Treinamento dos tripulantes: a cada 6 meses, e não a cada 180 dias
--
-- Pedido da gestão em 20/10/2026.
--
-- ─── POR QUE NÃO BASTAVA MUDAR O NÚMERO ──────────────────────────────────────
--
-- O treinamento já estava em 180 dias, e 180 dias não é 6 meses: o da Taíba,
-- feito em 14/10/2026, vencia em 12/04/2027, dois dias antes do que qualquer
-- pessoa diria ao ouvir "seis meses". E nenhum número fixo de dias resolve,
-- porque seis meses de calendário têm de 181 a 184 dias conforme os meses que
-- atravessam — 182 acerta uma vez e erra na seguinte.
--
-- Então o sistema passou a entender mês. `manutencoes_periodicas_tipos` ganha
-- `periodicidade_meses`; quando preenchida, ela manda, e o vencimento cai no
-- mesmo dia do mês, seis meses depois.
--
-- ⚠️ Fim de mês segue a regra do Postgres: 31/08 + 6 meses = 28/02 (ou 29/02),
--    nunca 03/03. O calendário da tela faz a mesma conta, para as duas telas
--    não discordarem.
--
-- ─── PRECEDÊNCIA ─────────────────────────────────────────────────────────────
--
--   1. exceção por lancha em `manutencoes_periodicas_excecoes` (sempre dias)
--   2. `periodicidade_meses` do tipo
--   3. `periodicidade_dias` do tipo
--
-- `periodicidade_dias` do treinamento passa a 183, só como aproximação para
-- quem ainda lê em dias. Não é o que vale.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.manutencoes_periodicas_tipos
  ADD COLUMN IF NOT EXISTS periodicidade_meses integer;

ALTER TABLE public.manutencoes_periodicas_tipos
  DROP CONSTRAINT IF EXISTS manutencoes_periodicas_tipos_meses_check;
ALTER TABLE public.manutencoes_periodicas_tipos
  ADD CONSTRAINT manutencoes_periodicas_tipos_meses_check
  CHECK (periodicidade_meses IS NULL OR periodicidade_meses > 0);

COMMENT ON COLUMN public.manutencoes_periodicas_tipos.periodicidade_meses IS
  'Periodicidade em meses de calendario. Quando preenchida, vale no lugar de '
  'periodicidade_dias: o vencimento cai no mesmo dia do mes, N meses depois. '
  'Excecao por lancha (manutencoes_periodicas_excecoes) continua vencendo as duas.';

UPDATE public.manutencoes_periodicas_tipos
   SET periodicidade_meses = 6,
       periodicidade_dias  = 183,
       descricao = 'A cada 6 meses de calendario (pedido da gestao em 20/10/2026). '
                || 'periodicidade_dias = 183 e so aproximacao.'
 WHERE id = 'e4150316-dac6-4f07-bddf-b6f900f18beb';        -- Treinamento dos tripulantes


-- ═══ A view passa a entender mês ═════════════════════════════════════════════
-- Mesmas colunas, na mesma ordem e do mesmo tipo — por isso CREATE OR REPLACE
-- serve. `periodicidade_dias` agora é o comprimento REAL do ciclo corrente
-- (182, 183, 184…), para quem lê em dias continuar vendo o número certo. E
-- `periodicidade_meses` entra no fim.

CREATE OR REPLACE VIEW public.v_manutencoes_periodicas_status AS
 SELECT mp.id,
    mp.lancha_id,
    l.nome AS lancha_nome,
    mpt.id AS tipo_id,
    mpt.nome AS tipo_nome,
    (p.proxima_data - mp.data_realizada) AS periodicidade_dias,
    mp.data_realizada AS ultima_realizada,
    p.proxima_data,
    p.proxima_data - CURRENT_DATE AS dias_restantes,
        CASE
            WHEN (p.proxima_data - CURRENT_DATE) < 0  THEN 'vencido'::text
            WHEN (p.proxima_data - CURRENT_DATE) <= 10 THEN 'atencao'::text
            ELSE 'ok'::text
        END AS status,
    CASE WHEN pp.periodicidade_dias IS NULL THEN mpt.periodicidade_meses END
      AS periodicidade_meses
   FROM ( SELECT DISTINCT ON (manutencoes_periodicas.lancha_id, manutencoes_periodicas.tipo_id)
            manutencoes_periodicas.id,
            manutencoes_periodicas.lancha_id,
            manutencoes_periodicas.tipo_id,
            manutencoes_periodicas.data_realizada
           FROM manutencoes_periodicas
          ORDER BY manutencoes_periodicas.lancha_id, manutencoes_periodicas.tipo_id,
                   manutencoes_periodicas.data_realizada DESC) mp
     JOIN lanchas l ON l.id = mp.lancha_id
     JOIN manutencoes_periodicas_tipos mpt ON mpt.id = mp.tipo_id
     LEFT JOIN public.manutencoes_periodicas_excecoes pp
            ON pp.lancha_id = mp.lancha_id AND pp.tipo_id = mp.tipo_id
     CROSS JOIN LATERAL (
            SELECT CASE
                     WHEN pp.periodicidade_dias IS NOT NULL
                       THEN mp.data_realizada + pp.periodicidade_dias
                     WHEN mpt.periodicidade_meses IS NOT NULL
                       THEN (mp.data_realizada + make_interval(months => mpt.periodicidade_meses))::date
                     ELSE mp.data_realizada + mpt.periodicidade_dias
                   END AS proxima_data
     ) p;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
-- SELECT lancha_nome, ultima_realizada, proxima_data, periodicidade_dias, periodicidade_meses
--   FROM public.v_manutencoes_periodicas_status WHERE tipo_nome LIKE 'Treinamento%';
--    ESPERADO: Taíba, 14/10/2026 → 14/04/2027, 182 dias, 6 meses.
--
-- E as outras 15 periódicas não podem ter mudado de data.
