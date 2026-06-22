import { useState, useMemo } from "react";
import {
  useOcorrencias, useManobras, useIndicadoresOp,
  useManutencoesPeriodicas, useManutencoesTipos,
} from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
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

function classifyTipo(tipo: string | null | undefined): "corretiva" | "preventiva" | "outros" {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("corretiva")) return "corretiva";
  if (t.includes("preventiva") || t.includes("treinamento")) return "preventiva";
  return "outros";
}

function extractFaina(tipo: string | null | undefined): string {
  return (tipo ?? "").replace(/\s*\((Corretiva|Preventiva)\)/gi, "").trim();
}

const COR_CLASSE: Record<string, string> = {
  corretiva:  "#DC2626",
  preventiva: "#16A34A",
  outros:     "#6B7280",
};

const LABEL_CLASSE: Record<string, string> = {
  corretiva:  "Corretiva",
  preventiva: "Preventiva",
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
  const [selClasses,    setSelClasses]    = useState<string[]>(["corretiva", "preventiva", "outros"]);
  const [selFainas,     setSelFainas]     = useState<string[]>([]);  // vazio = todas
  const [filterEfeitos, setFilterEfeitos] = useState<string[]>([]);  // vazio = todos

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

  const classesLabel = selClasses.length === 3 ? "Todas"
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
    const horasManut   = ocFiltradas.reduce((s: number, o: any) => s + (Number(o.duracao_horas) || 0), 0);
    const nOcorrencias = ocFiltradas.length;

    const horasOp = ((indicadores ?? []) as any[]).filter(i => {
      if (!selLanchas.includes(Number(i.cd_lancha))) return false;
      const d = (i.dh_leitura ?? "").slice(0, 10);
      return d >= filterDe && d <= filterAte;
    }).reduce((s: number, i: any) => s + (Number(i.dc_dif_be) || 0), 0);

    const nManobras = ((manobras ?? []) as any[]).filter(m => {
      if (!selLanchas.includes(Number(m.cd_lancha))) return false;
      const d = (m.dh_manobra ?? "").slice(0, 10);
      return d >= filterDe && d <= filterAte;
    }).length;

    const corretivas = ocFiltradas.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "corretiva");
    const mttr = corretivas.length > 0
      ? corretivas.reduce((s: number, o: any) => s + (Number(o.duracao_horas) || 0), 0) / corretivas.length
      : null;

    return {
      horasManut,
      horasOp,
      ratioManutOp:    horasOp > 0 ? (horasManut / horasOp * 100) : null,
      nOcorrencias,
      horasPorManobra: nManobras > 0 ? horasManut / nManobras : null,
      mttr,
      nManobras,
    };
  }, [ocFiltradas, indicadores, manobras, filterDe, filterAte, selLanchas]);

  // ── Gráfico 1: Horas por mês empilhadas ──────────────────────────────────
  const dadosHorasMes = useMemo(() => {
    const map = new Map<string, { corretiva: number; preventiva: number; outros: number }>();
    for (const o of ocFiltradas as any[]) {
      const mes = (o.data_inicio ?? "").slice(0, 7);
      if (!mes) continue;
      if (!map.has(mes)) map.set(mes, { corretiva: 0, preventiva: 0, outros: 0 });
      const cls = classifyTipo(o.tipo_ocorrencia);
      map.get(mes)![cls] += Number(o.duracao_horas) || 0;
    }
    return [...map.keys()].sort().map(mes => ({ mes: fmtMes(mes), ...map.get(mes)! }));
  }, [ocFiltradas]);

  // ── Gráfico 2: Ratio Manut/Op por mês por lancha ─────────────────────────
  const dadosRatioMes = useMemo(() => {
    const manutMap = new Map<string, Map<number, number>>();
    for (const o of ocFiltradas as any[]) {
      const mes = (o.data_inicio ?? "").slice(0, 7);
      if (!mes || o.cd_lancha === null) continue;
      if (!manutMap.has(mes)) manutMap.set(mes, new Map());
      const lm = manutMap.get(mes)!;
      lm.set(o.cd_lancha, (lm.get(o.cd_lancha) ?? 0) + (Number(o.duracao_horas) || 0));
    }
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
    const allMeses = [...new Set([...manutMap.keys(), ...opMap.keys()])].sort();
    return allMeses.map(mes => {
      const row: Record<string, any> = { mes: fmtMes(mes) };
      for (const { cd } of LANCHAS) {
        if (!selLanchas.includes(cd)) continue;
        const hManut = manutMap.get(mes)?.get(cd) ?? 0;
        const hOp    = opMap.get(mes)?.get(cd)    ?? 0;
        row[LANCHA_NOME[cd]] = hOp > 0 ? Number((hManut / hOp * 100).toFixed(2)) : null;
      }
      return row;
    });
  }, [ocFiltradas, indicadores, selLanchas, filterDe, filterAte]);

  // ── Gráfico 3: h Manutenção / Manobra por mês ────────────────────────────
  const dadosManutManobra = useMemo(() => {
    const manutMap   = new Map<string, number>();
    for (const o of ocFiltradas as any[]) {
      const mes = (o.data_inicio ?? "").slice(0, 7);
      if (!mes) continue;
      manutMap.set(mes, (manutMap.get(mes) ?? 0) + (Number(o.duracao_horas) || 0));
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
    const map = new Map<string, { corretiva: number; preventiva: number; outros: number }>();
    for (const o of ocFiltradas as any[]) {
      const f = extractFaina(o.tipo_ocorrencia) || "Sem tipo";
      if (!map.has(f)) map.set(f, { corretiva: 0, preventiva: 0, outros: 0 });
      map.get(f)![classifyTipo(o.tipo_ocorrencia)] += 1;
    }
    return [...map.entries()]
      .map(([faina, v]) => ({ faina, ...v, total: v.corretiva + v.preventiva + v.outros }))
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
        outros:     bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "outros").length,
      };
    });
  }, [ocFiltradas]);

  // ── Gráfico 6: MTBF por faina ─────────────────────────────────────────────
  const dadosMTBF = useMemo(() => {
    const corretivas = (ocFiltradas as any[])
      .filter(o => classifyTipo(o.tipo_ocorrencia) === "corretiva" && o.data_inicio)
      .sort((a: any, b: any) => a.data_inicio.localeCompare(b.data_inicio));

    const porFaina = new Map<string, Date[]>();
    for (const o of corretivas) {
      const f = extractFaina(o.tipo_ocorrencia) || "Sem tipo";
      if (!porFaina.has(f)) porFaina.set(f, []);
      porFaina.get(f)!.push(new Date(o.data_inicio));
    }

    return [...porFaina.entries()]
      .map(([faina, datas]) => {
        if (datas.length < 2) return null;
        const intervalos = datas.slice(1).map((d, i) =>
          (d.getTime() - datas[i].getTime()) / 86400000
        );
        const mtbf = intervalos.reduce((s, v) => s + v, 0) / intervalos.length;
        return { faina, mtbf: Number(mtbf.toFixed(1)), n: datas.length };
      })
      .filter(Boolean)
      .sort((a, b) => a!.mtbf - b!.mtbf) as Array<{ faina: string; mtbf: number; n: number }>;
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

  function mtbfColor(mtbf: number): string {
    if (mtbf < 30) return "#DC2626";
    if (mtbf < 90) return "#F59E0B";
    return "#16A34A";
  }

  const KPI_CARDS = [
    { label: "Total h Manutenção",   value: `${kpis.horasManut.toFixed(1)}h` },
    { label: "% Manut / Operada",    value: kpis.ratioManutOp !== null ? `${kpis.ratioManutOp.toFixed(1)}%` : "—" },
    { label: "Nº Ocorrências",       value: kpis.nOcorrencias.toString() },
    { label: "h Manut / Manobra",    value: kpis.horasPorManobra !== null ? `${kpis.horasPorManobra.toFixed(2)}h` : "—" },
    { label: "MTTR — Corretivas",    value: kpis.mttr !== null ? `${kpis.mttr.toFixed(1)}h` : "—" },
    { label: "Nº Manobras",          value: kpis.nManobras.toString() },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manutenção</h1>
        <p className="text-sm text-accent">Análise de ocorrências e manutenções das lanchas</p>
      </div>

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
                  {(["corretiva", "preventiva", "outros"] as const).map(c => (
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
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {allFainas.map(f => (
                    <label key={f} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={selFainas.includes(f)} onCheckedChange={() => toggleFaina(f)} />
                      <span className="text-sm">{f}</span>
                    </label>
                  ))}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_CARDS.map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-0.5">{value}</p>
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
                <Bar dataKey="outros"     stackId="a" fill={COR_CLASSE.outros}     radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 6 — MTBF por Faina */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MTBF por Faina — Tempo Médio entre Falhas Corretivas</CardTitle>
        </CardHeader>
        <CardContent>
          {dadosMTBF.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem dados suficientes (requer ≥ 2 ocorrências corretivas por faina)
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(200, dadosMTBF.length * 32 + 50)}>
                <BarChart
                  data={dadosMTBF}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}d`} />
                  <YAxis
                    dataKey="faina" type="category"
                    tick={{ fontSize: 9 }} width={150}
                    tickFormatter={v => v.length > 24 ? v.slice(0, 24) + "…" : v}
                  />
                  <Tooltip
                    content={({ payload, label }: any) => {
                      if (!payload?.length) return null;
                      const item = dadosMTBF.find(x => x.faina === label);
                      return (
                        <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold mb-1">{label}</p>
                          <p>Em média, falha a cada <strong>{payload[0]?.value} dias</strong></p>
                          {item && <p className="text-muted-foreground mt-1">{item.n} ocorrências analisadas</p>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="mtbf" radius={[0, 3, 3, 0]}>
                    {dadosMTBF.map((entry, i) => (
                      <Cell key={i} fill={mtbfColor(entry.mtbf)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-5 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full inline-block bg-red-600" />
                  &lt;30d (crítico)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full inline-block bg-amber-500" />
                  30–90d (atenção)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full inline-block bg-green-600" />
                  &gt;90d (bom)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Gráfico 7 — Compliance Manutenções Periódicas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status das Manutenções Periódicas</CardTitle>
        </CardHeader>
        <CardContent>
          {complianceByLancha.size === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem dados de manutenções periódicas
            </p>
          ) : (
            <div className="space-y-6">
              {[...complianceByLancha.entries()].map(([lanchaNome, items]) => (
                <div key={lanchaNome}>
                  <h3 className="text-sm font-semibold mb-2 text-foreground">{lanchaNome}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {items.map(item => (
                      <div
                        key={item.tipo_id}
                        className="rounded-lg border p-2.5"
                        style={{ borderColor: STATUS_COR[item.status_semaforo] + "66" }}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <p className="text-xs font-medium leading-tight">{item.tipo_nome}</p>
                          <span
                            className="shrink-0 w-2.5 h-2.5 rounded-full mt-0.5"
                            style={{ backgroundColor: STATUS_COR[item.status_semaforo] }}
                          />
                        </div>
                        <p className="text-xs" style={{ color: STATUS_COR[item.status_semaforo] }}>
                          {STATUS_LABEL[item.status_semaforo]}
                        </p>
                        {item.dias_restantes !== null && (
                          <p className="text-xs mt-0.5 font-mono text-muted-foreground">
                            {item.dias_restantes >= 0
                              ? `${item.dias_restantes}d restantes`
                              : `${Math.abs(item.dias_restantes)}d vencido`}
                          </p>
                        )}
                        {item.proxima_data && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Próxima:{" "}
                            {item.proxima_data.slice(0, 10).split("-").reverse().join("/")}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Cada {item.periodicidade_dias}d
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
