/**
 * Horas operadas a partir do horímetro, não da soma de `dc_dif_be`.
 *
 * `dc_dif_be` significa "horas desde o evento anterior na sequência do WebPilot",
 * não "horas atribuíveis a esta linha". Quando dois eventos caem no mesmo momento
 * — uma faina e uma mudança de local, por exemplo — os dois carregam o mesmo
 * valor, e somar a coluna conta o mesmo intervalo duas vezes.
 *
 * Medido em 03/09/2026: a soma inflava as horas em ~10% no acumulado de 12 meses,
 * chegando a +70% em meses isolados.
 *
 * Aqui o cálculo usa o horímetro absoluto, estimado por interpolação linear nas
 * bordas do período. É a mesma lógica da view `v_analytics_horas_mes`, para que
 * as telas e a camada analítica não divirjam.
 */

export type LeituraHorimetro = {
  cd_lancha: number | string | null;
  dh_leitura: string | null;
  dc_horimetro_bb: number | string | null;
};

type Ponto = { t: number; h: number };

/** Uma série por lancha, sem instantes repetidos (fica o maior horímetro). */
export function serieHorimetro(leituras: LeituraHorimetro[]): Map<number, Ponto[]> {
  const porLancha = new Map<number, Map<number, number>>();
  for (const l of leituras) {
    const cd = Number(l.cd_lancha);
    const h = Number(l.dc_horimetro_bb);
    if (!Number.isFinite(cd) || !Number.isFinite(h) || !l.dh_leitura) continue;
    const t = new Date(l.dh_leitura).getTime();
    if (!Number.isFinite(t)) continue;
    if (!porLancha.has(cd)) porLancha.set(cd, new Map());
    const m = porLancha.get(cd)!;
    m.set(t, Math.max(m.get(t) ?? -Infinity, h));
  }
  const out = new Map<number, Ponto[]>();
  for (const [cd, m] of porLancha) {
    out.set(cd, [...m.entries()].map(([t, h]) => ({ t, h })).sort((a, b) => a.t - b.t));
  }
  return out;
}

/** Horímetro estimado no instante `quando`, por interpolação linear. */
export function horimetroEm(serie: Ponto[], quando: number): number | null {
  if (serie.length === 0) return null;
  let lo = 0, hi = serie.length - 1, iAnt = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (serie[mid].t <= quando) { iAnt = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (iAnt < 0) return null;                       // antes da primeira leitura
  const ant = serie[iAnt];
  const pos = serie[iAnt + 1];
  if (!pos || pos.t === ant.t) return ant.h;       // depois da última
  return ant.h + (pos.h - ant.h) * ((quando - ant.t) / (pos.t - ant.t));
}

/**
 * Horas operadas por lancha entre dois instantes.
 *
 * Se `de` for anterior à primeira leitura da lancha, conta a partir dela — é a
 * leitura natural de "desde o começo". Sem isso, um período aberto (sem filtro
 * de data) devolveria zero, porque `horimetroEm` não extrapola para trás.
 */
export function horasOperadasEntre(
  leituras: LeituraHorimetro[],
  de: Date | string,
  ate: Date | string,
): Map<number, number> {
  const t0 = new Date(de).getTime();
  const t1 = new Date(ate).getTime();
  const out = new Map<number, number>();
  for (const [cd, serie] of serieHorimetro(leituras)) {
    if (serie.length === 0) continue;
    const a = horimetroEm(serie, t0) ?? serie[0].h;
    const b = horimetroEm(serie, t1);
    if (b === null) continue;
    out.set(cd, Math.max(b - a, 0));
  }
  return out;
}

/** Horas operadas por mês (`YYYY-MM`) e por lancha. */
export function horasOperadasPorMes(
  leituras: LeituraHorimetro[],
): Map<string, Map<number, number>> {
  const series = serieHorimetro(leituras);
  const out = new Map<string, Map<number, number>>();
  for (const [cd, serie] of series) {
    if (serie.length === 0) continue;
    const ini = new Date(serie[0].t);
    const fim = new Date(serie[serie.length - 1].t);
    let ano = ini.getUTCFullYear(), mes = ini.getUTCMonth();
    for (;;) {
      const b0 = Date.UTC(ano, mes, 1);
      const b1 = Date.UTC(ano, mes + 1, 1);
      if (b0 > fim.getTime()) break;
      const a = horimetroEm(serie, b0);
      const b = horimetroEm(serie, b1);
      if (a !== null && b !== null) {
        const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;
        if (!out.has(chave)) out.set(chave, new Map());
        out.get(chave)!.set(cd, Math.max(b - a, 0));
      }
      mes += 1;
      if (mes > 11) { mes = 0; ano += 1; }
    }
  }
  return out;
}
