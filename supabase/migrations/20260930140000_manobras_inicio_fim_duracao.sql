-- ─────────────────────────────────────────────────────────────────────────────
-- manobras_lanchas ganha início, embarque, fim e duração
--
-- O WebPilot atendeu o pedido de 29/09/2026 e o `itManobras` passou a devolver
-- `DH_INI_MAN`, `DH_EMBARQUE`, `DH_FIM_MAN`, `NR_MINUTOS` e `DC_HORAS`.
--
-- ─── POR QUE ISSO IMPORTA ────────────────────────────────────────────────────
--
-- Ate aqui a tabela tinha UM carimbo, o `dh_manobra`, e ele e a grade de
-- agendamento, nao o evento: 99,8% das 1.787 manobras de 2026 caem em :00 ou
-- :30, com os segundos sempre zerados. Media contra o AIS, a parada da lancha
-- junto ao navio fica centrada nele (mediana +4,2 min) mas dispersa — intervalo
-- interquartil de 38 min, e so 45% dentro de +-15 min.
--
-- Os carimbos novos sao observacao de verdade. O contraste prova:
--
--     DH_MANOBRA   em :00/:30 -> 100,0%   (a grade)
--     DH_INI_MAN   em :00/:30 ->  12,1%
--     DH_EMBARQUE  em :00/:30 ->   9,3%
--     DH_FIM_MAN   em :00/:30 ->   7,5%
--
-- ─── AS DUAS DATAS DE INICIO SAO DIFERENTES, E A ORDEM IMPORTA ───────────────
--
-- ⚠️ `dh_embarque` e SEMPRE anterior ou igual a `dh_ini_man`. Nos 214 registros
--    do endpoint, diferem em 32, com mediana de 19 min e maximo de 73.
--
--    Confirmado com a operacao: o pratico EMBARCA no navio e o navio comeca a
--    manobrar depois.
--
--    `nr_minutos` e `dc_horas` vem calculados pela origem a partir de
--    `dh_ini_man` — e a duracao da MANOBRA. Para a janela da LANCHA, que e a
--    que interessa em fadiga, use `dh_embarque` ate `dh_fim_man`, porque comeca
--    mais cedo. Os dois carimbos estao aqui justamente para permitir isso.
--
-- ─── COBERTURA ───────────────────────────────────────────────────────────────
--
-- ⚠️ O endpoint e janela movel de ~30 dias: 214 registros hoje, contra 16.117
--    linhas na tabela. As manobras ANTIGAS ficam com os campos novos NULOS e
--    nao ha como o sync preenche-las. O historico entra por exportacao manual
--    da tela `hiLanchasManobras.aspx`.
--
--    Portanto: ao usar duracao de manobra, SEMPRE filtre `dh_fim_man IS NOT
--    NULL` e diga de que periodo esta falando. Nulo aqui significa "antes da
--    cobertura", nao "manobra sem fim".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.manobras_lanchas
  ADD COLUMN IF NOT EXISTS dh_ini_man  timestamptz,
  ADD COLUMN IF NOT EXISTS dh_embarque timestamptz,
  ADD COLUMN IF NOT EXISTS dh_fim_man  timestamptz,
  ADD COLUMN IF NOT EXISTS nr_minutos  integer,
  ADD COLUMN IF NOT EXISTS dc_horas    numeric;

COMMENT ON COLUMN public.manobras_lanchas.dh_manobra IS
  'Horario AGENDADO da manobra, em grade de 30 minutos (sempre :00 ou :30, '
  'segundos zerados). NAO e o instante do evento. Para o evento use dh_ini_man, '
  'dh_embarque e dh_fim_man.';
COMMENT ON COLUMN public.manobras_lanchas.dh_ini_man IS
  'Inicio real da manobra do navio. Base do nr_minutos calculado pela origem.';
COMMENT ON COLUMN public.manobras_lanchas.dh_embarque IS
  'Embarque do pratico no navio. SEMPRE anterior ou igual a dh_ini_man — o '
  'pratico embarca e o navio manobra depois. Mediana de 19 min quando diferem. '
  'E o inicio da janela da LANCHA, que e a relevante para fadiga.';
COMMENT ON COLUMN public.manobras_lanchas.dh_fim_man IS
  'Fim real da manobra. NULO significa manobra nao finalizada OU manobra '
  'anterior a cobertura do endpoint (~30 dias). Sempre filtre antes de agregar.';
COMMENT ON COLUMN public.manobras_lanchas.nr_minutos IS
  'Duracao em minutos, de dh_ini_man ate dh_fim_man, calculada pela origem. '
  'NULO quando nao ha fim — nunca zero. Ver a migration 20260930100000, que '
  'explica por que zero e pior que nulo aqui.';
COMMENT ON COLUMN public.manobras_lanchas.dc_horas IS
  'A mesma duracao em horas. Mesma regra do nr_minutos.';

-- Filtrar manobra com duracao conhecida e o padrao de uso destes campos.
CREATE INDEX IF NOT EXISTS idx_manobras_fim
  ON public.manobras_lanchas (dh_fim_man) WHERE dh_fim_man IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────
--
-- Rodar DEPOIS de publicar a sync-manobras nova e executa-la.
--
-- 1) A manobra 44836, que entrou sem porto em 30/09, se curou?
--
-- SELECT cd_manobra, ds_porto, dh_ini_man, dh_fim_man, nr_minutos
--   FROM public.manobras_lanchas WHERE cd_manobra = 44836;
--    ESPERADO: ds_porto preenchido e os campos novos populados.
--
-- 2) Nenhuma linha ficou sem porto:
--
-- SELECT count(*) FROM public.manobras_lanchas WHERE ds_porto IS NULL;
--    ESPERADO: 0
--
-- 3) A duracao so existe na janela do endpoint, e e plausivel:
--
-- SELECT count(*) AS total,
--        count(dh_fim_man) AS com_fim,
--        min(dh_manobra::date) FILTER (WHERE dh_fim_man IS NOT NULL) AS desde,
--        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY nr_minutos)::numeric,0) AS mediana_min
--   FROM public.manobras_lanchas;
--    ESPERADO: ~16.100 total, ~213 com fim, mediana por volta de 64 min.
--
-- 4) Nenhuma duracao zerada sobreviveu:
--
-- SELECT count(*) FROM public.manobras_lanchas WHERE nr_minutos <= 0;
--    ESPERADO: 0
