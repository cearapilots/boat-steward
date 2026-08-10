import { useState, useMemo } from "react";
import {
  useOcorrencias, useManobras, useIndicadoresOp,
  useManutencoesPeriodicas, useManutencoesTipos,
} from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Constantes ───────────────────────────────────────────────────────────────

const LANCHA_UUID_TO_CD: Record<string, number> = {
  "a0000000-0000-0000-0000-000000000001": 121,
  "a0000000-0000-0000-0000-000000000002": 1003,
  "a0000000-0000-0000-0000-000000000003": 117,
};

const LANCHA_NOME: Record<number, string> = { 121: "Flexeiras", 1003: "Fortim", 117: "Taíba" };
const LANCHA_COR:  Record<number, string> = { 121: "#2563EB",   1003: "#16A34A", 117: "#F97316" };
const LANCHAS = [
  { cd: 121,  nome: "Flexeiras" },
  { cd: 1003, nome: "Fortim"   },
  { cd: 117,  nome: "Taíba"    },
];

// "treinamento" é uma classe própria e NÃO está em selClasses (o filtro de
// Classificação lista apenas corretiva/preventiva/projeto/outros). Como
// `ocFiltradas` só aceita classes presentes em selClasses, treinamentos ficam
// fora de todos os KPIs e gráficos desta página — que é o comportamento
// desejado: treinar tripulação não é carga de manutenção.
function classifyTipo(tipo: string | null | undefined): "corretiva" | "preventiva" | "projeto" | "treinamento" | "outros" {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("projeto") || t.includes("melhoria") || t.includes("modificação")) return "projeto";
  if (t.includes("treinamento")) return "treinamento";
  if (t.includes("corretiva")) return "corretiva";
  if (t.includes("preventiva")) return "preventiva";
  return "outros";
}

// Horas que contam como CARGA DE MANUTENÇÃO nos KPIs e nos gráficos de taxa.
// Projeto/melhoria fica de fora por decisão de negócio: é investimento, não
// manutenção. Treinamento já é excluído antes, na origem (classifyTipo não
// devolve uma classe presente em selClasses).
// Atenção: os gráficos descritivos — empilhado de horas/mês e histograma de
// durações — NÃO usam este filtro, pois existem justamente para mostrar a
// composição, incluindo a barra roxa de projeto.
function contaComoManutencao(tipo: string | null | undefined): boolean {
  return classifyTipo(tipo) !== "projeto";
}

function extractFaina(tipo: string | null | undefined): string {
  return (tipo ?? "").replace(/\s*\((Corretiva|Preventiva)\)/gi, "").trim();
}

const COR_CLASSE: Record<string, string> = {
  corretiva:  "#DC2626",
  preventiva: "#16A34A",
  projeto:    "#8B5CF6",
  outros:     "#6B7280",
};

const LABEL_CLASSE: Record<string, string> = {
  corretiva:  "Corretiva",
  preventiva: "Preventiva",
  projeto:    "Projeto/Melhoria",
  outros:     "Outros",
};

const STATUS_COR: Record<string, string> = {
  ok:           "#16A34A",
  atencao:      "#F59E0B",
  critico:      "#DC2626",
  vencido:      "#991B1B",
  sem_registro: "#9CA3AF",
};

const STATUS_LABEL: Record<string, string> = {
  ok:           "OK",
  atencao:      "Atenção",
  critico:      "Crítico",
  vencido:      "Vencido",
  sem_registro: "Sem registro",
};

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ABR[parseInt(m) - 1]}/${y.slice(2)}`;
}

function horasNoMes(
  dataInicio: string,
  dataFim: string | null,
  duracaoHoras: number | null,
  monthStart: Date,
  monthEnd: Date,
): number {
  const s = new Date(dataInicio).getTime();
  let e: number;
  if (dataFim) {
    e = new Date(dataFim).getTime();
  } else if (duracaoHoras != null && duracaoHoras > 0) {
    e = s + duracaoHoras * 3_600_000;
  } else {
    return 0;
  }
  const cs = Math.max(s, monthStart.getTime());
  const ce = Math.min(e, monthEnd.getTime());
  if (cs >= ce) return 0;
  return (ce - cs) / 3_600_000;
}

function monthsInRange(de: string, ate: string): string[] {
  const months: string[] = [];
  const [startY, startM] = de.slice(0, 7).split("-").map(Number);
  const [endY,   endM  ] = ate.slice(0, 7).split("-").map(Number);
  let y = startY, m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

const BUCKETS = [
  { label: "<1h",  min: 0,   max: 1        },
  { label: "1–4h", min: 1,   max: 4        },
  { label: "4–8h", min: 4,   max: 8        },
  { label: "8–24h",min: 8,   max: 24       },
  { label: "1–3d", min: 24,  max: 72       },
  { label: "3–7d", min: 72,  max: 168      },
  { label: ">7d",  min: 168, max: Infinity  },
];

const todayStr    = new Date().toISOString().slice(0, 10);
const oneYearAgo  = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// Linha de detalhamento por lancha exibida abaixo do número da frota em cada
// scorecard. As cores vêm de LANCHA_COR para bater com o filtro e os gráficos.
function LanchaBreakdown({ items, fmt }: {
  items: Array<{ nome: string; cor: string; valor: number | null }>;
  fmt: (v: number) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border space-y-1">
      {items.map(i => (
        <div key={i.nome} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: i.cor }} />
            <span className="text-muted-foreground truncate">{i.nome}</span>
          </span>
          <span className="font-mono tabular-nums shrink-0">
            {i.valor != null ? fmt(i.valor) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ManutencaoPage() {
  const { data: ocorrencias }  = useOcorrencias();
  const { data: manobras }     = useManobras();
  const { data: indicadores }  = useIndicadoresOp();
  const { data: periodicas }   = useManutencoesPeriodicas();
  const { data: manutTipos }   = useManutencoesTipos();

  const [filterDe,      setFilterDe]      = useState(oneYearAgo);
  const [filterAte,     setFilterAte]     = useState(todayStr);
  const [selLanchas,    setSelLanchas]    = useState<number[]>([121, 1003, 117]);
  const [selClasses,    setSelClasses]    = useState<string[]>(["corretiva", "preventiva", "projeto", "outros"]);
  const [selFainas,     setSelFainas]     = useState<string[]>([]);  // vazio = todas
  const [filterEfeitos, setFilterEfeitos] = useState<string[]>([]);  // vazio = todos
  const [fainaSearch,   setFainaSearch]   = useState("");
  const [complianceSort, setComplianceSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "dias", dir: "asc" });

  function toggleLancha(cd: number) {
    setSelLanchas(prev =>
      prev.includes(cd) ? (prev.length > 1 ? prev.filter(x => x !== cd) : prev) : [...prev, cd]
    );
  }

  function toggleClasse(c: string) {
    setSelClasses(prev =>
      prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c]
    );
  }

  function toggleFaina(f: string) {
    setSelFainas(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  function toggleEfeito(e: string) {
    setFilterEfeitos(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const lanchasLabel = selLanchas.length === LANCHAS.length ? "Todas"
    : selLanchas.map(cd => LANCHA_NOME[cd]).join(", ");

  const classesLabel = selClasses.length === 4 ? "Todas"
    : selClasses.map(c => LABEL_CLASSE[c]).join(", ");

  const fainasLabel = selFainas.length === 0 ? "Todas"
    : selFainas.length === 1 ? (selFainas[0].length > 20 ? selFainas[0].slice(0, 19) + "…" : selFainas[0])
    : `${selFainas.length} fainas`;

  const efeitosLabel = filterEfeitos.length === 0 ? "Todos"
    : filterEfeitos.length === 1 ? filterEfeitos[0]
    : `${filterEfeitos.length} efeitos`;

  // ── Fainas dinâmicas ─────────────────────────────────────────────────────
  const allFainas = useMemo(() => {
    const s = new Set<string>();
    for (const o of (ocorrencias ?? []) as any[]) {
      const f = extractFaina(o.tipo_ocorrencia);
      if (f) s.add(f);
    }
    return [...s].sort();
  }, [ocorrencias]);

  const EFEITOS = ["Inoperante", "Operante com Restrições", "Operante", "Não Altera"];

  // ── Ocorrências filtradas ─────────────────────────────────────────────────
  // Sem pré-filtro de efeito para não excluir eventos classificados como 'outros'
  const ocFiltradas = useMemo(() => {
    return ((ocorrencias ?? []) as any[]).filter(o => {
      if (o.cd_lancha === null || !selLanchas.includes(o.cd_lancha)) return false;
      const d = (o.data_inicio ?? "").slice(0, 10);
      if (d < filterDe || d > filterAte) return false;
      if (!selClasses.includes(classifyTipo(o.tipo_ocorrencia))) return false;
      if (selFainas.length > 0 && !selFainas.includes(extractFaina(o.tipo_ocorrencia))) return false;
      if (filterEfeitos.length > 0 && !filterEfeitos.includes(o.efeito)) return false;
      return true;
    });
  }, [ocorrencias, filterDe, filterAte, selLanchas, selClasses, selFainas, filterEfeitos]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    // Somatórios da frota e por lancha usam exatamente a mesma fórmula, para
    // que o detalhamento das lanchas feche com o total exibido acima dele.
    const somaHoras = (lista: any[]) => lista
      .filter((o: any) => contaComoManutencao(o.tipo_ocorrencia))
      .reduce((s: number, o: any) => s + (Number(o.duracao_horas) || 0), 0);

    // Corretiva que tirou a lancha de operação. O recorte "Inoperante" segue o
    // mesmo critério já usado no gráfico de % Manut/Operada.
    const contaCorretivas = (lista: any[]) => lista.filter((o: any) =>
      classifyTipo(o.tipo_ocorrencia) === "corretiva" &&
      (o.efeito ?? "").trim() === "Inoperante"
    ).length;

    const noPeriodo = (d: string) => d >= filterDe && d <= filterAte;

    const horasOpDe = (cds: number[]) => ((indicadores ?? []) as any[])
      .filter(i => cds.includes(Number(i.cd_lancha)) && noPeriodo((i.dh_leitura ?? "").slice(0, 10)))
      .reduce((s: number, i: any) => s + (Number(i.dc_dif_be) || 0), 0);

    const manobrasDe = (cds: number[]) => ((manobras ?? []) as any[])
      .filter(m => cds.includes(Number(m.cd_lancha)) && noPeriodo((m.dh_manobra ?? "").slice(0, 10)))
      .length;

    const horasManut  = somaHoras(ocFiltradas);
    const horasOp     = horasOpDe(selLanchas);
    const nManobras   = manobrasDe(selLanchas);
    const corretivas  = contaCorretivas(ocFiltradas);

    // Detalhamento por lancha — só as selecionadas no filtro.
    const porLancha = LANCHAS.filter(l => selLanchas.includes(l.cd)).map(l => {
      const ocL       = (ocFiltradas as any[]).filter(o => Number(o.cd_lancha) === l.cd);
      const horasManutL = somaHoras(ocL);
      const horasOpL    = horasOpDe([l.cd]);
      const nManobrasL  = manobrasDe([l.cd]);
      const corretivasL = contaCorretivas(ocL);
      return {
        cd: l.cd,
        nome: l.nome,
        cor: LANCHA_COR[l.cd],
        horasManut:      horasManutL,
        ratioManutOp:    horasOpL   > 0 ? horasManutL / horasOpL * 100     : null,
        horasPorManobra: nManobrasL > 0 ? horasManutL / nManobrasL          : null,
        taxaCorretivas:  nManobrasL > 0 ? corretivasL / nManobrasL * 100    : null,
        nManobras:       nManobrasL,
      };
    });

    return {
      horasManut,
      horasOp,
      ratioManutOp:    horasOp > 0 ? (horasManut / horasOp * 100) : null,
      horasPorManobra: nManobras > 0 ? horasManut / nManobras : null,
      taxaCorretivas:  nManobras > 0 ? corretivas / nManobras * 100 : null,
      nManobras,
      porLancha,
    };
  }, [ocFiltradas, indicadores, manobras, filterDe, filterAte, selLanchas]);

  // ── Gráfico 1: Horas por mês empilhadas ──────────────────────────────────
  const dadosHorasMes = useMemo(() => {
    const months = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);
    return months.map(month => {
      const [my, mm] = month.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);
      const pt: Record<string, any> = { mes: fmtMes(month), corretiva: 0, preventiva: 0, projeto: 0, outros: 0 };
      for (const o of ocFiltradas as any[]) {
        if (!o.data_inicio) continue;
        const h = horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
        if (h <= 0) continue;
        const cls = classifyTipo(o.tipo_ocorrencia);
        pt[cls] = Math.round(((pt[cls] ?? 0) + h) * 10) / 10;
      }
      return pt;
    });
  }, [ocFiltradas, filterDe, filterAte]);

  // ── Gráfico 2: Ratio Manut/Op por mês por lancha ─────────────────────────
  const dadosRatioMes = useMemo(() => {
    const opMap = new Map<string, Map<number, number>>();
    for (const i of (indicadores ?? []) as any[]) {
      if (!selLanchas.includes(Number(i.cd_lancha))) continue;
      const d   = (i.dh_leitura ?? "").slice(0, 10);
      const mes = d.slice(0, 7);
      if (!mes || d < filterDe || d > filterAte) continue;
      if (!opMap.has(mes)) opMap.set(mes, new Map());
      const om = opMap.get(mes)!;
      om.set(Number(i.cd_lancha), (om.get(Number(i.cd_lancha)) ?? 0) + (Number(i.dc_dif_be) || 0));
    }
    const months = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);
    const allMeses = [...new Set([...months, ...[...opMap.keys()]])].sort();
    return allMeses.map(mes => {
      const [my, mm] = mes.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);
      const row: Record<string, any> = { mes: fmtMes(mes) };
      for (const { cd } of LANCHAS) {
        if (!selLanchas.includes(cd)) continue;
        let hManut = 0;
        for (const o of ocFiltradas as any[]) {
          if (Number(o.cd_lancha) !== cd || !o.data_inicio) continue;
          if ((o.efeito ?? "").trim() !== "Inoperante") continue;
          if (!contaComoManutencao(o.tipo_ocorrencia)) continue;
          hManut += horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
        }
        const hOp = opMap.get(mes)?.get(cd) ?? 0;
        row[LANCHA_NOME[cd]] = hOp > 0 ? Number((hManut / hOp * 100).toFixed(2)) : null;
      }
      return row;
    });
  }, [ocFiltradas, indicadores, selLanchas, filterDe, filterAte]);

  // ── Gráfico 3: h Manutenção / Manobra por mês ────────────────────────────
  const dadosManutManobra = useMemo(() => {
    const manutMap = new Map<string, number>();
    const months = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);
    for (const mes of months) {
      const [my, mm] = mes.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);
      let total = 0;
      for (const o of ocFiltradas as any[]) {
        if (!o.data_inicio) continue;
        if (!contaComoManutencao(o.tipo_ocorrencia)) continue;
        total += horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
      }
      if (total > 0) manutMap.set(mes, total);
    }
    const manobraMap = new Map<string, number>();
    for (const m of (manobras ?? []) as any[]) {
      if (!selLanchas.includes(Number(m.cd_lancha))) continue;
      const d   = (m.dh_manobra ?? "").slice(0, 10);
      const mes = d.slice(0, 7);
      if (!mes || d < filterDe || d > filterAte) continue;
      manobraMap.set(mes, (manobraMap.get(mes) ?? 0) + 1);
    }
    return [...manutMap.keys()].sort().map(mes => ({
      mes:         fmtMes(mes),
      horasManut:  Number((manutMap.get(mes) ?? 0).toFixed(1)),
      hPorManobra: (manobraMap.get(mes) ?? 0) > 0
        ? Number(((manutMap.get(mes) ?? 0) / manobraMap.get(mes)!).toFixed(2))
        : null,
    }));
  }, [ocFiltradas, manobras, selLanchas, filterDe, filterAte]);

  // ── Gráfico 4: Ocorrências por faina ─────────────────────────────────────
  const dadosFaina = useMemo(() => {
    const map = new Map<string, { corretiva: number; preventiva: number; projeto: number; outros: number }>();
    for (const o of ocFiltradas as any[]) {
      const f = extractFaina(o.tipo_ocorrencia) || "Sem tipo";
      if (!map.has(f)) map.set(f, { corretiva: 0, preventiva: 0, projeto: 0, outros: 0 });
      map.get(f)![classifyTipo(o.tipo_ocorrencia)] += 1;
    }
    return [...map.entries()]
      .map(([faina, v]) => ({ faina, ...v, total: v.corretiva + v.preventiva + v.projeto + v.outros }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [ocFiltradas]);

  // ── Gráfico 5: Histograma durações ────────────────────────────────────────
  const dadosHistograma = useMemo(() => {
    return BUCKETS.map(b => {
      const bucket = (ocFiltradas as any[]).filter(o => {
        const h = Number(o.duracao_horas) || 0;
        return h >= b.min && h < b.max;
      });
      return {
        label:      b.label,
        corretiva:  bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "corretiva").length,
        preventiva: bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "preventiva").length,
        projeto:    bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "projeto").length,
        outros:     bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "outros").length,
      };
    });
  }, [ocFiltradas]);

  // ── Compliance periódicas ─────────────────────────────────────────────────
  const complianceByLancha = useMemo(() => {
    void manutTipos; // cache warming
    const filtered = (periodicas ?? []).filter(p =>
      selLanchas.includes(LANCHA_UUID_TO_CD[p.lancha_id] ?? -1)
    );
    const byLancha = new Map<string, typeof filtered>();
    for (const p of filtered) {
      if (!byLancha.has(p.lancha_nome)) byLancha.set(p.lancha_nome, []);
      byLancha.get(p.lancha_nome)!.push(p);
    }
    return byLancha;
  }, [periodicas, selLanchas, manutTipos]);

  const complianceFlatSorted = useMemo(() => {
    const rows: any[] = [];
    for (const [, items] of complianceByLancha.entries()) {
      for (const item of items) rows.push(item);
    }
    const statusOrder: Record<string, number> = { vencido: 0, critico: 1, atencao: 2, ok: 3, sem_registro: 4 };
    return rows.sort((a, b) => {
      const dir = complianceSort.dir === "asc" ? 1 : -1;
      if (complianceSort.key === "dias") {
        const da = a.dias_restantes ?? Infinity;
        const db = b.dias_restantes ?? Infinity;
        return (da - db) * dir;
      }
      if (complianceSort.key === "nome")   return a.tipo_nome.localeCompare(b.tipo_nome)     * dir;
      if (complianceSort.key === "lancha") return a.lancha_nome.localeCompare(b.lancha_nome) * dir;
      return ((statusOrder[a.status_semaforo] ?? 5) - (statusOrder[b.status_semaforo] ?? 5)) * dir;
    });
  }, [complianceByLancha, complianceSort]);

  const vencidosCount = useMemo(
    () => complianceFlatSorted.filter(x => x.status_semaforo === "vencido" || x.status_semaforo === "critico").length,
    [complianceFlatSorted],
  );

  const fmtH    = (v: number) => `${v.toFixed(1)}h`;
  const fmtPct  = (v: number) => `${v.toFixed(1)}%`;
  const fmtH2   = (v: number) => `${v.toFixed(2)}h`;
  const fmtTaxa = (v: number) => v.toFixed(2);
  const fmtInt  = (v: number) => String(Math.round(v));

  const KPI_CARDS: Array<{
    label: string;
    value: string;
    fmt: (v: number) => string;
    pick: (l: (typeof kpis.porLancha)[number]) => number | null;
  }> = [
    {
      label: "Total h Manutenção",
      value: fmtH(kpis.horasManut),
      fmt: fmtH,   pick: l => l.horasManut,
    },
    {
      label: "% Manut / Operada",
      value: kpis.ratioManutOp !== null ? fmtPct(kpis.ratioManutOp) : "—",
      fmt: fmtPct, pick: l => l.ratioManutOp,
    },
    {
      label: "Corretivas / 100 Manobras",
      value: kpis.taxaCorretivas !== null ? fmtTaxa(kpis.taxaCorretivas) : "—",
      fmt: fmtTaxa, pick: l => l.taxaCorretivas,
    },
    {
      label: "h Manut / Manobra",
      value: kpis.horasPorManobra !== null ? fmtH2(kpis.horasPorManobra) : "—",
      fmt: fmtH2,  pick: l => l.horasPorManobra,
    },
    {
      label: "Nº Manobras",
      value: String(kpis.nManobras),
      fmt: fmtInt, pick: l => l.nManobras,
    },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manutenção</h1>
        <p className="text-sm text-accent">Análise de ocorrências e manutenções das lanchas</p>
      </div>

      {/* Banner — manutenções vencidas / críticas */}
      {vencidosCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-400">
            <strong>
              {vencidosCount} {vencidosCount === 1 ? "manutenção vencida ou crítica" : "manutenções vencidas ou críticas"}
            </strong>
            {" "}— verifique a tabela de Manutenções Periódicas abaixo.
          </span>
        </div>
      )}

      {/* Filtros — mesmo padrão visual de OperacoesPage */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">

            {/* Lanchas — Popover com checkboxes */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Lanchas</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{lanchasLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {LANCHAS.map(l => (
                    <label key={l.cd} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={selLanchas.includes(l.cd)} onCheckedChange={() => toggleLancha(l.cd)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[l.cd] }} />
                      <span className="text-sm">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Datas — input nativo igual OperacoesPage */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={filterDe} onChange={e => setFilterDe(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Até</span>
              <input type="date" value={filterAte} onChange={e => setFilterAte(e.target.value)} className={inputClass} />
            </div>

            {/* Classificação — Popover com checkboxes */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[150px]">
                  <span className="font-medium">Classificação</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{classesLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {(["corretiva", "preventiva", "projeto", "outros"] as const).map(c => (
                    <label key={c} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={selClasses.includes(c)} onCheckedChange={() => toggleClasse(c)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR_CLASSE[c] }} />
                      <span className="text-sm">{LABEL_CLASSE[c]}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Faina — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[150px]">
                  <span className="font-medium">Faina</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{fainasLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="pb-2">
                  <input
                    type="text"
                    placeholder="Buscar faina…"
                    value={fainaSearch}
                    onChange={e => setFainaSearch(e.target.value)}
                    className={inputClass + " w-full"}
                  />
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {allFainas
                    .filter(f => f.toLowerCase().includes(fainaSearch.toLowerCase()))
                    .map(f => (
                      <label key={f} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                        <Checkbox checked={selFainas.includes(f)} onCheckedChange={() => toggleFaina(f)} />
                        <span className="text-sm">{f}</span>
                      </label>
                    ))}
                  {allFainas.filter(f => f.toLowerCase().includes(fainaSearch.toLowerCase())).length === 0 && (
                    <p className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhuma faina encontrada</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Efeito — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Efeito</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{efeitosLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-2" align="start">
                <div className="space-y-1">
                  {EFEITOS.map(e => (
                    <label key={e} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterEfeitos.includes(e)} onCheckedChange={() => toggleEfeito(e)} />
                      <span className="text-sm">{e}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPI_CARDS.map(({ label, value, fmt, pick }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-0.5">{value}</p>
              <LanchaBreakdown
                items={kpis.porLancha.map(l => ({ nome: l.nome, cor: l.cor, valor: pick(l) }))}
                fmt={fmt}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico 1 — Horas de manutenção por mês (barras empilhadas) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horas de Manutenção por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          {dadosHorasMes.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosHorasMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `${v}h`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [
                  `${Number(v).toFixed(1)}h`, LABEL_CLASSE[name] ?? name,
                ]} />
                <Legend formatter={v => LABEL_CLASSE[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="corretiva"  stackId="a" fill={COR_CLASSE.corretiva}  />
                <Bar dataKey="preventiva" stackId="a" fill={COR_CLASSE.preventiva} />
                <Bar dataKey="projeto"    stackId="a" fill={COR_CLASSE.projeto}    />
                <Bar dataKey="outros"     stackId="a" fill={COR_CLASSE.outros}     radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gráficos 2 + 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Gráfico 2 — Ratio Manut/Op por mês */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">% Horas em Manutenção sobre Horas Operadas</CardTitle>
          </CardHeader>
          <CardContent>
            {dadosRatioMes.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dadosRatioMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, ""]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine
                    y={5} stroke="#F59E0B" strokeDasharray="4 4"
                    label={{ value: "5%", position: "insideTopRight", fontSize: 9, fill: "#F59E0B" }}
                  />
                  {LANCHAS.filter(l => selLanchas.includes(l.cd)).map(l => (
                    <Line
                      key={l.cd}
                      dataKey={l.nome}
                      stroke={LANCHA_COR[l.cd]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 3 — h Manutenção / Manobra */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Carga de Manutenção por Manobra</CardTitle>
          </CardHeader>
          <CardContent>
            {dadosManutManobra.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dadosManutManobra} margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="h"   orientation="left"  tickFormatter={v => `${v}h`} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="hpm" orientation="right" tickFormatter={v => `${Number(v).toFixed(1)}h`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any, name: string) => [
                    `${Number(v).toFixed(1)}h`,
                    name === "horasManut" ? "Total h Manut" : "h/Manobra",
                  ]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar  yAxisId="h"   dataKey="horasManut"  name="Total h Manut" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="hpm" dataKey="hPorManobra" name="h/Manobra"     stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráficos 4 + 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Gráfico 4 — Ocorrências por tipo de faina */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocorrências por Tipo de Faina</CardTitle>
          </CardHeader>
          <CardContent>
            {dadosFaina.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, dadosFaina.length * 30 + 50)}>
                <BarChart
                  data={dadosFaina}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="faina" type="category"
                    tick={{ fontSize: 9 }} width={130}
                    tickFormatter={v => v.length > 22 ? v.slice(0, 22) + "…" : v}
                  />
                  <Tooltip formatter={(v: number, name: string) => [v, LABEL_CLASSE[name] ?? name]} />
                  <Legend formatter={v => LABEL_CLASSE[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="corretiva"  stackId="a" fill={COR_CLASSE.corretiva}  />
                  <Bar dataKey="preventiva" stackId="a" fill={COR_CLASSE.preventiva} />
                  <Bar dataKey="projeto"    stackId="a" fill={COR_CLASSE.projeto}    />
                  <Bar dataKey="outros"     stackId="a" fill={COR_CLASSE.outros}     />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 5 — Distribuição de durações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição de Duração das Manutenções</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosHistograma} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [v, LABEL_CLASSE[name] ?? name]} />
                <Legend formatter={v => LABEL_CLASSE[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="corretiva"  stackId="a" fill={COR_CLASSE.corretiva}  />
                <Bar dataKey="preventiva" stackId="a" fill={COR_CLASSE.preventiva} />
                <Bar dataKey="projeto"    stackId="a" fill={COR_CLASSE.projeto}    />
                <Bar dataKey="outros"     stackId="a" fill={COR_CLASSE.outros}     radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 7 — Compliance Manutenções Periódicas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status das Manutenções Periódicas</CardTitle>
        </CardHeader>
        <CardContent>
          {complianceFlatSorted.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem dados de manutenções periódicas
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {([
                      { key: "nome",   label: "Tipo"       },
                      { key: "lancha", label: "Lancha"     },
                      { key: "status", label: "Status"     },
                      { key: "dias",   label: "Dias Rest." },
                    ] as const).map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => setComplianceSort(prev => ({
                          key,
                          dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
                        }))}
                        className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                      >
                        {label}
                        {complianceSort.key === key ? (complianceSort.dir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Próxima Data</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Periodicidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {complianceFlatSorted.map(item => {
                    const isOverdue = (item.dias_restantes ?? 0) < 0;
                    return (
                      <tr key={`${item.lancha_nome}-${item.tipo_id}`} className="hover:bg-muted/40">
                        <td className="px-3 py-2.5 font-medium">{item.tipo_nome}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.lancha_nome}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COR[item.status_semaforo] }} />
                            <span className="text-xs font-medium" style={{ color: STATUS_COR[item.status_semaforo] }}>
                              {STATUS_LABEL[item.status_semaforo]}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {item.dias_restantes === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : isOverdue ? (
                            <span className="text-red-600 font-semibold">{Math.abs(item.dias_restantes)}d vencido</span>
                          ) : (
                            <span className={item.dias_restantes <= 7 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                              {item.dias_restantes}d
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {item.proxima_data ? item.proxima_data.slice(0, 10).split("-").reverse().join("/") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {item.periodicidade_dias}d
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
