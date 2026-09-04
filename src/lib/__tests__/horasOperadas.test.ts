import { describe, it, expect } from "vitest";
import {
  horasOperadasPorMes,
  horasOperadasEntre,
  horimetroEm,
  serieHorimetro,
} from "../horasOperadas";

/**
 * Cenário sintético que reproduz os três padrões reais do banco.
 * Os valores esperados foram conferidos contra a view v_analytics_horas_mes
 * rodando sobre os dados de produção em 04/09/2026.
 */
const LEITURAS = [
  // ── Lancha 1: dois eventos no MESMO instante, com o mesmo dc_dif ──────────
  // É o padrão que inflava a soma: uma faina e uma mudança de local no mesmo
  // momento, cada uma carregando "horas desde o evento anterior".
  { cd_lancha: 1, dh_leitura: "2026-01-05T12:00:00Z", dc_horimetro_bb: 1000 },
  { cd_lancha: 1, dh_leitura: "2026-01-20T12:00:00Z", dc_horimetro_bb: 1040 },
  { cd_lancha: 1, dh_leitura: "2026-02-10T12:00:00Z", dc_horimetro_bb: 1100 },
  { cd_lancha: 1, dh_leitura: "2026-02-10T12:00:00Z", dc_horimetro_bb: 1100 }, // duplicata
  { cd_lancha: 1, dh_leitura: "2026-03-02T12:00:00Z", dc_horimetro_bb: 1150 },

  // ── Lancha 2: MÊS INTEIRO sem leitura (fevereiro) ────────────────────────
  // O método antigo dava zero; a interpolação distribui o intervalo.
  { cd_lancha: 2, dh_leitura: "2026-01-01T00:00:00Z", dc_horimetro_bb: 500 },
  { cd_lancha: 2, dh_leitura: "2026-03-01T00:00:00Z", dc_horimetro_bb: 559 },

  // ── Lancha 3: leituras no mesmo instante com horímetros DIFERENTES ───────
  // Foi o que tornou o método dos passos não determinístico. Aqui fica o maior.
  { cd_lancha: 3, dh_leitura: "2026-01-10T00:00:00Z", dc_horimetro_bb: 200 },
  { cd_lancha: 3, dh_leitura: "2026-02-01T00:00:00Z", dc_horimetro_bb: 230 },
  { cd_lancha: 3, dh_leitura: "2026-02-01T00:00:00Z", dc_horimetro_bb: 236 },
  { cd_lancha: 3, dh_leitura: "2026-03-01T00:00:00Z", dc_horimetro_bb: 280 },
];

describe("serieHorimetro", () => {
  it("colapsa leituras do mesmo instante mantendo o maior horímetro", () => {
    const s = serieHorimetro(LEITURAS as any).get(3)!;
    expect(s).toHaveLength(3);
    expect(s[1].h).toBe(236); // e não 230
  });

  it("ordena por instante", () => {
    const s = serieHorimetro(LEITURAS as any).get(1)!;
    expect(s.map(p => p.h)).toEqual([1000, 1040, 1100, 1150]);
  });
});

describe("horimetroEm", () => {
  const s = serieHorimetro(LEITURAS as any).get(2)!;

  it("interpola linearmente entre duas leituras", () => {
    // 500 em 01/01 e 559 em 01/03: 59 h em 59 dias, 1 h/dia.
    // Em 01/02 passaram 31 dias -> 531.
    expect(horimetroEm(s, Date.parse("2026-02-01T00:00:00Z"))).toBeCloseTo(531, 5);
  });

  it("devolve null antes da primeira leitura", () => {
    expect(horimetroEm(s, Date.parse("2025-01-01T00:00:00Z"))).toBeNull();
  });

  it("devolve a última leitura depois do fim da série", () => {
    expect(horimetroEm(s, Date.parse("2030-01-01T00:00:00Z"))).toBe(559);
  });
});

describe("horasOperadasPorMes", () => {
  const porMes = horasOperadasPorMes(LEITURAS as any);

  it("não conta duas vezes o evento duplicado", () => {
    // Fevereiro da lancha 1 vai da borda de 01/02 à de 01/03.
    // A duplicata de 10/02 não acrescenta nada, porque o horímetro não andou.
    const fev = porMes.get("2026-02")!.get(1)!;
    expect(fev).toBeGreaterThan(0);
    expect(fev).toBeLessThan(110); // a soma dos dc_dif daria bem mais
  });

  it("preenche mês sem nenhuma leitura", () => {
    // 1 h/dia em fevereiro de 2026 (28 dias).
    expect(porMes.get("2026-02")!.get(2)!).toBeCloseTo(28, 5);
  });

  it("é determinístico com horímetros diferentes no mesmo instante", () => {
    const a = horasOperadasPorMes(LEITURAS as any).get("2026-02")!.get(3);
    const b = horasOperadasPorMes([...LEITURAS].reverse() as any).get("2026-02")!.get(3);
    expect(a).toBe(b);
  });

  it("nunca devolve hora negativa", () => {
    for (const m of porMes.values())
      for (const h of m.values()) expect(h).toBeGreaterThanOrEqual(0);
  });
});

describe("horasOperadasEntre", () => {
  it("período aberto conta desde a primeira leitura, não devolve zero", () => {
    // Regressão: com `de` anterior à série, a lancha era pulada e o KPI zerava.
    const tudo = horasOperadasEntre(LEITURAS as any, "1900-01-01", "2999-12-31");
    expect(tudo.get(2)!).toBeCloseTo(59, 5);
  });

  it("faixa livre bate com a soma dos meses que ela cobre", () => {
    const faixa = horasOperadasEntre(LEITURAS as any, "2026-01-01", "2026-03-01");
    const porMes = horasOperadasPorMes(LEITURAS as any);
    const soma = ["2026-01", "2026-02"].reduce(
      (s, m) => s + (porMes.get(m)?.get(2) ?? 0), 0);
    expect(faixa.get(2)!).toBeCloseTo(soma, 5);
  });
});
