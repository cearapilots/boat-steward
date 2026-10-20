-- ─────────────────────────────────────────────────────────────────────────────
-- Duração sem fim vira NULO, não zero
--
-- A origem manda `NR_MINUTOS = 0` e `DC_HORAS = 0` quando a faina ainda não tem
-- `DH_FIM`. Zero e um valor VALIDO de duracao: entra em media e mediana sem
-- avisar ninguem.
--
-- ⚠️ ISSO JA CUSTOU UMA CONCLUSAO. A faina 512 (Fortim, 17/07/2026,
--    Mucuripe→Pecem) e o unico registro assim em 494 fainas, e inclui-la puxava
--    a mediana de travessia de 102,0 para 99,0 minutos — o que fez a analise de
--    docagem creditar ao casco limpo um ganho que era artefato de dado.
--    Documentado em references/contexto_da_gestao.md §2.1.
--
-- ─── POR QUE AQUI E NAO NO WEBPILOT ──────────────────────────────────────────
--
-- Da para pedir a origem que mande nulo. Mas e regra NOSSA de leitura, nao
-- defeito deles: travessia entre portos leva ~2 h, e zero nao e duracao curta,
-- e ausencia de medida. Tratar na entrada resolve para sempre, sem depender de
-- ninguem lembrar de filtrar. A `sync-fainas` ja foi corrigida e publicada em
-- 30/09/2026 para nao gravar mais zero; esta migration limpa o que ficou.
--
-- ─── E UM SEGUNDO DEFEITO, QUE A MESMA CORRECAO RESOLVEU ─────────────────────
--
-- A `sync-fainas` usava `ignoreDuplicates: true` — o defeito do Apendice C.8.
-- A faina entrava enquanto ainda estava em curso e, quando a origem a
-- completava, a correcao nunca chegava aqui.
--
-- Foi o caso da faina 524: o endpoint tinha DH_FIM 12:47 e 107 min desde
-- 15/09/2026, e o nosso banco guardou nulo com zeros por quinze dias. Trocado
-- para sobrescrever no conflito, ela se curou sozinha no primeiro sync.
--
-- A 512 nao se cura assim: e de julho e ja saiu da janela do endpoint. Por isso
-- esta migration — e por isso ela ANULA em vez de APAGAR: a faina aconteceu, o
-- que falta e a medida do fim, nao o registro.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ANTES ────────────────────────────────────────────────────────────────────
SELECT cd_faina_lancha, ds_lancha, dh_inicio, dh_fim, nr_minutos, dc_horas
  FROM public.fainas_deslocamentos
 WHERE dh_fim IS NULL OR nr_minutos <= 0 OR dc_horas <= 0
 ORDER BY dh_inicio;
-- esperado: 1 linha — a faina 512, com nr_minutos = 0 e dc_horas = 0

-- ── A CORRECAO ───────────────────────────────────────────────────────────────
-- Generica de proposito: pega a 512 e qualquer retardataria que apareca antes
-- de a funcao nova ter passado por ela.
UPDATE public.fainas_deslocamentos
   SET nr_minutos = NULL,
       dc_horas   = NULL
 WHERE dh_fim IS NULL
   AND (nr_minutos IS NOT NULL OR dc_horas IS NOT NULL);

-- ─── VERIFICACAO ─────────────────────────────────────────────────────────────
--
-- 1) Nenhuma faina sem fim carrega duracao. ZERO linhas.
--
-- SELECT cd_faina_lancha, dh_fim, nr_minutos, dc_horas
--   FROM public.fainas_deslocamentos
--  WHERE dh_fim IS NULL AND (nr_minutos IS NOT NULL OR dc_horas IS NOT NULL);
--
-- 2) A mediana de travessia deixa de depender de filtro manual.
--    Com a 512 anulada, AVG e PERCENTILE ja a ignoram sozinhos.
--
-- SELECT ds_local_orig || ' > ' || ds_local_dest AS rota,
--        count(*) AS n,
--        count(nr_minutos) AS com_duracao,
--        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY nr_minutos)::numeric, 1) AS mediana_min
--   FROM public.fainas_deslocamentos
--  GROUP BY 1 ORDER BY 1;
--    ESPERADO: 498 fainas, 497 com duracao, medianas por volta de 100 a 110 min.
