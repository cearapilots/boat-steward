import { useState, useMemo } from "react";
import { useManobras, useIndicadoresOp, useFainas, useOcorrencias, useAbastecimentos } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, ReferenceLine, ReferenceArea,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ── Constantes ───────────────────────────────────────────────────────────────

const LANCHA_NOME: Record<number, string> = { 121: "Flexeiras", 1003: "Fortim", 117: "Taíba" };
const LANCHA_COR: Record<number, string>  = { 121: "#2563EB", 1003: "#16A34A", 117: "#F97316" };
const LANCHAS = [
  { cd: 121,  nome: "Flexeiras" },
  { cd: 1003, nome: "Fortim"    },
  { cd: 117,  nome: "Taíba"     },
];

const POSTO_COR: Record<string, string> = {
  "BR DISTRIBUIDORA":  "#FBBF24",
  "VS TOP DIESEL":     "#60A5FA",
  "Bandeira Branca":   "#34D399",
  "JS Distribuidora":  "#A78BFA",
};
const POSTO_COR_DEFAULT = "#9CA3AF";

function normalizaPosto(p: string): string {
  const t = p.trim();
  if (t.toUpperCase() === "BANDEIRA BRANCA" || t === "Posto Bandeira Branca") return "Bandeira Branca";
  return t;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const FAINA_BUCKETS = [
  { label: "<1h30",     min: 0,     max: 1.5      },
  { label: "1h30–1h45", min: 1.5,   max: 1.75     },
  { label: "1h45–2h",   min: 1.75,  max: 2        },
  { label: "2h–2h15",   min: 2,     max: 2.25     },
  { label: "2h15–2h30", min: 2.25,  max: 2.5      },
  { label: "2h30–2h45", min: 2.5,   max: 2.75     },
  { label: "2h45–3h",   min: 2.75,  max: 3        },
  { label: "3h–3h15",   min: 3,     max: 3.25     },
  { label: "3h15–3h30", min: 3.25,  max: 3.5      },
  { label: ">3h30", min: 3.5,   max: Infinity },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES[parseInt(m) - 1]}/${y.slice(2)}`;
}

function fmtHours(h: number | null): string {
  if (h == null || isNaN(h)) return "—";
  return h.toFixed(2) + "h";
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function avgArr(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function fmtPeriodo(de: string, ate: string): string {
  const fmt = (s: string) => s.split("-").reverse().join("/");
  if (de && ate) return `${fmt(de)} — ${fmt(ate)}`;
  if (de) return `a partir de ${fmt(de)}`;
  if (ate) return `até ${fmt(ate)}`;
  return "todo o período";
}

function isInoperante(efeito: string | null | undefined): boolean {
  return (efeito ?? "").trim() === "Inoperante";
}

function isProjeto(tipo: string | null | undefined): boolean {
  const t = (tipo ?? "").toLowerCase();
  return t.includes("projeto") || t.includes("melhoria") || t.includes("modificação");
}

function isDowntimeTecnica(o: any): boolean {
  if (!isInoperante(o.efeito)) return false;
  const t = (o.tipo_ocorrencia ?? "").toLowerCase();
  return t.includes("corretiva") && !isProjeto(o.tipo_ocorrencia);
}

function mergeIntervals(intervals: { s: number; e: number }[]): { s: number; e: number }[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.s - b.s);
  const merged = [{ ...sorted[0] }];
  for (const cur of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (cur.s <= last.e) { if (cur.e > last.e) last.e = cur.e; }
    else merged.push({ ...cur });
  }
  return merged;
}

function calcDowntimeHours(
  ocorrencias: any[],
  cdLancha: number,
  periodStart: Date,
  periodEnd: Date,
): number {
  const ps = periodStart.getTime();
  const pe = periodEnd.getTime();
  const intervals = (ocorrencias ?? [])
    .filter(o => Number(o.cd_lancha) === cdLancha && isInoperante(o.efeito) && o.data_inicio)
    .map(o => {
    const s = new Date(o.data_inicio).getTime();
    let endMs: number;
    if (o.data_fim) {
      // Evento fechado: usar data_fim
      endMs = new Date(o.data_fim).getTime();
    } else if (o.duracao_horas != null && Number(o.duracao_horas) > 0) {
      // Sem data_fim mas com duração da API: calcular fim
      endMs = s + Number(o.duracao_horas) * 3_600_000;
    } else {
      // Sem data_fim e sem duração = evento órfão (nunca fechado no sistema)
      // Não contar: retornar intervalo nulo que será filtrado
      return { s: 0, e: 0 };
    }
    return { s: Math.max(s, ps), e: Math.min(endMs, pe) };
  })
  .filter(i => i.s < i.e)  // ← já existe, filtra os { s:0, e:0 } também
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.e - i.s) / 3_600_000, 0);
}

function calcDowntimeHoursCorretiva(
  ocorrencias: any[],
  cdLancha: number,
  periodStart: Date,
  periodEnd: Date,
): number {
  return calcDowntimeHours(
    (ocorrencias ?? []).filter(isDowntimeTecnica),
    cdLancha, periodStart, periodEnd,
  );
}

const todayStr    = new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();
const oneYearAgo  = `${currentYear - 1}-01-01`;

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// ── Tooltip manobras por mês ──────────────────────────────────────────────────

function ManobrasTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
  return (
    <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md space-y-0.5">
      <p className="font-semibold mb-1">{label} — Total: {total}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.stroke }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OperacoesPage() {
  const { data: manobras,        isLoading: loadingM } = useManobras();
  const { data: indicadores,     isLoading: loadingI } = useIndicadoresOp();
  const { data: fainas,          isLoading: loadingF } = useFainas();
  const { data: ocorrencias } = useOcorrencias();
  const { data: abastecimentos } = useAbastecimentos();

  const [selectedLanchas, setSelectedLanchas] = useState<number[]>([121, 1003, 117]);
  const [filterDe,   setFilterDe]   = useState(oneYearAgo);
  const [filterAte,  setFilterAte]  = useState(todayStr);
  const [filterPorto, setFilterPorto] = useState<"Todos" | "Mucuripe" | "Pecém">("Todos");
  const [deslocExpanded, setDeslocExpanded] = useState(false);

  const isLoading = loadingM || loadingI || loadingF;

  function toggleLancha(cd: number) {
    setSelectedLanchas(prev =>
      prev.includes(cd) ? prev.filter(c => c !== cd) : [...prev, cd]
    );
  }

  // ── Filtrados ──────────────────────────────────────────────────────────────

  const filteredManobras = useMemo(() => (manobras ?? []).filter((m: any) => {
    if (!selectedLanchas.includes(Number(m.cd_lancha))) return false;
    const d = (m.dh_manobra ?? "").slice(0, 10);
    if (filterDe  && d < filterDe)  return false;
    if (filterAte && d > filterAte) return false;
    if (filterPorto !== "Todos" && m.ds_porto !== filterPorto) return false;
    return true;
  }), [manobras, selectedLanchas, filterDe, filterAte, filterPorto]);

  const filteredIndicadores = useMemo(() => (indicadores ?? []).filter((i: any) => {
    if (!selectedLanchas.includes(Number(i.cd_lancha))) return false;
    const d = (i.dh_leitura ?? "").slice(0, 10);
    if (filterDe  && d < filterDe)  return false;
    if (filterAte && d > filterAte) return false;
    if (filterPorto !== "Todos" && i.porto != null && i.porto !== filterPorto) return false;
    return true;
  }), [indicadores, selectedLanchas, filterDe, filterAte, filterPorto]);

  const filteredFainas = useMemo(() => (fainas ?? []).filter((f: any) => {
    if (!selectedLanchas.includes(Number(f.cd_lancha))) return false;
    const d = (f.dh_inicio ?? "").slice(0, 10);
    if (filterDe  && d < filterDe)  return false;
    if (filterAte && d > filterAte) return false;
    return true;
  }), [fainas, selectedLanchas, filterDe, filterAte]);

  const filteredAbastecimentos = useMemo(() => (abastecimentos ?? []).filter((a: any) => {
    if (!selectedLanchas.includes(Number(a.cd_lancha))) return false;
    const d = (a.dh_abastecimento ?? "").slice(0, 10);
    if (filterDe  && d < filterDe)  return false;
    if (filterAte && d > filterAte) return false;
    return true;
  }), [abastecimentos, selectedLanchas, filterDe, filterAte]);

  // ── Gráfico 1: Manobras por mês ───────────────────────────────────────────

  const manobrasPorMes = useMemo(() => {
    const map = new Map<string, Record<number, number>>();
    for (const m of filteredManobras as any[]) {
      const month = (m.dh_manobra ?? "").slice(0, 7);
      if (!month) continue;
      if (!map.has(month)) map.set(month, {});
      const e = map.get(month)!;
      const cd = Number(m.cd_lancha);
      e[cd] = (e[cd] ?? 0) + 1;
    }
    return [...map.keys()].sort().map(month => {
      const e = map.get(month)!;
      const pt: Record<string, any> = { month: fmtMonth(month) };
      for (const cd of selectedLanchas) pt[LANCHA_NOME[cd]] = e[cd] ?? 0;
      return pt;
    });
  }, [filteredManobras, selectedLanchas]);

  // ── Gráfico 2: Horas de operação por mês ──────────────────────────────────

  const horasPorMes = useMemo(() => {
    const map = new Map<string, Record<number, number>>();
    for (const i of filteredIndicadores as any[]) {
      const month = (i.dh_leitura ?? "").slice(0, 7);
      if (!month) continue;
      const h = Number(i.dc_dif_be);
      if (!h || isNaN(h) || h <= 0) continue;
      if (!map.has(month)) map.set(month, {});
      const e = map.get(month)!;
      const cd = Number(i.cd_lancha);
      e[cd] = (e[cd] ?? 0) + h;
    }
    return [...map.keys()].sort().map(month => {
      const e = map.get(month)!;
      const pt: Record<string, any> = { month: fmtMonth(month) };
      for (const cd of selectedLanchas)
        pt[LANCHA_NOME[cd]] = e[cd] != null ? Math.round(e[cd] * 10) / 10 : 0;
      return pt;
    });
  }, [filteredIndicadores, selectedLanchas]);

  // ── Gráfico 3: Distribuição (donut) ───────────────────────────────────────

  const distribuicaoManobras = useMemo(() => {
    const cnt = new Map<number, number>();
    for (const m of filteredManobras as any[]) {
      const cd = Number(m.cd_lancha);
      cnt.set(cd, (cnt.get(cd) ?? 0) + 1);
    }
    return LANCHAS
      .filter(l => selectedLanchas.includes(l.cd))
      .map(l => ({ name: l.nome, value: cnt.get(l.cd) ?? 0, cd: l.cd }))
      .filter(d => d.value > 0);
  }, [filteredManobras, selectedLanchas]);

  // ── Gráfico 4: Manobras por porto ─────────────────────────────────────────

  const manobrasPorPorto = useMemo(() => {
    const map = new Map<string, Record<number, number>>();
    for (const m of filteredManobras as any[]) {
      const porto = m.ds_porto ?? "Outros";
      if (!map.has(porto)) map.set(porto, {});
      const e = map.get(porto)!;
      const cd = Number(m.cd_lancha);
      e[cd] = (e[cd] ?? 0) + 1;
    }
    return [...map.keys()].sort().map(porto => {
      const e = map.get(porto) ?? {};
      const pt: Record<string, any> = { porto };
      for (const cd of selectedLanchas) pt[LANCHA_NOME[cd]] = e[cd] ?? 0;
      return pt;
    });
  }, [filteredManobras, selectedLanchas]);

  // ── Disponibilidade ────────────────────────────────────────────────────────

  const disponibilidadePorLancha = useMemo(() => {
    const de  = new Date((filterDe  || oneYearAgo) + "T00:00:00");
    const ate = new Date((filterAte || todayStr)   + "T23:59:59");
    const totalH = (ate.getTime() - de.getTime()) / 3_600_000;
    return LANCHAS.map(l => {
      const downtimeH = calcDowntimeHours(ocorrencias ?? [], l.cd, de, ate);
      const disp = Math.max(0, Math.min(100, (totalH - downtimeH) / totalH * 100));
      return { cd: l.cd, nome: l.nome, disp };
    });
  }, [ocorrencias, filterDe, filterAte]);

  const disponibilidadeMensal = useMemo(() => {
    const de  = filterDe  || oneYearAgo;
    const ate = filterAte || todayStr;
    const months: string[] = [];
    const [startY, startM] = de.slice(0, 7).split("-").map(Number);
    const [endY,   endM  ] = ate.slice(0, 7).split("-").map(Number);
    let y = startY, m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const ocs    = ocorrencias ?? [];
    const ocsTec = (ocs as any[]).filter(isDowntimeTecnica);
    return months.map(month => {
      const [my, mm] = month.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);
      const horasMes   = (monthEnd.getTime() - monthStart.getTime()) / 3_600_000;
      const pt: Record<string, any> = { mes: fmtMonth(month) };
      for (const cd of selectedLanchas) {
        const downtimeOp  = calcDowntimeHours(ocs,    cd, monthStart, monthEnd);
        const downtimeTec = calcDowntimeHours(ocsTec, cd, monthStart, monthEnd);
        pt[LANCHA_NOME[cd]]          = Math.max(0, Math.min(100, Math.round((horasMes - downtimeOp)  / horasMes * 1000) / 10));
        pt[LANCHA_NOME[cd] + "_tec"] = Math.max(0, Math.min(100, Math.round((horasMes - downtimeTec) / horasMes * 1000) / 10));
      }
      return pt;
    });
  }, [ocorrencias, filterDe, filterAte, selectedLanchas]);

  const disponibilidadeTecnicaPorLancha = useMemo(() => {
    const de  = new Date((filterDe  || oneYearAgo) + "T00:00:00");
    const ate = new Date((filterAte || todayStr)   + "T23:59:59");
    const totalH = (ate.getTime() - de.getTime()) / 3_600_000;
    return LANCHAS.map(l => {
      const downtimeH = calcDowntimeHoursCorretiva(ocorrencias ?? [], l.cd, de, ate);
      const disp = Math.max(0, Math.min(100, (totalH - downtimeH) / totalH * 100));
      return { cd: l.cd, nome: l.nome, disp };
    });
  }, [ocorrencias, filterDe, filterAte]);

  // ── Gráfico 5: Eficiência (horas / manobra) ───────────────────────────────

  const eficienciaPorMes = useMemo(() => {
    const mMap = new Map<string, Record<number, number>>();
    for (const m of filteredManobras as any[]) {
      const month = (m.dh_manobra ?? "").slice(0, 7);
      if (!month) continue;
      if (!mMap.has(month)) mMap.set(month, {});
      const e = mMap.get(month)!;
      const cd = Number(m.cd_lancha);
      e[cd] = (e[cd] ?? 0) + 1;
    }
    const hMap = new Map<string, Record<number, number>>();
    for (const i of filteredIndicadores as any[]) {
      const month = (i.dh_leitura ?? "").slice(0, 7);
      if (!month) continue;
      const h = Number(i.dc_dif_be);
      if (!h || isNaN(h) || h <= 0) continue;
      if (!hMap.has(month)) hMap.set(month, {});
      const e = hMap.get(month)!;
      const cd = Number(i.cd_lancha);
      e[cd] = (e[cd] ?? 0) + h;
    }
    const months = [...new Set([...mMap.keys(), ...hMap.keys()])].sort();
    return months.map(month => {
      const pt: Record<string, any> = { month: fmtMonth(month) };
      for (const cd of selectedLanchas) {
        const h = hMap.get(month)?.[cd] ?? 0;
        const n = mMap.get(month)?.[cd] ?? 0;
        pt[LANCHA_NOME[cd]] = n > 0 ? Math.round((h / n) * 100) / 100 : null;
      }
      return pt;
    });
  }, [filteredManobras, filteredIndicadores, selectedLanchas]);


  // ── Deslocamentos ──────────────────────────────────────────────────────────

  const statsDeslocamentos = useMemo(() => {
    const all      = (filteredFainas as any[]).map(f => Number(f.dc_horas)).filter(h => !isNaN(h) && h > 0);
    const pecem2muc = (filteredFainas as any[])
      .filter(f => (f.ds_local_orig ?? "").toLowerCase().includes("pec"))
      .map(f => Number(f.dc_horas)).filter(h => !isNaN(h) && h > 0);
    const muc2pecem = (filteredFainas as any[])
      .filter(f => (f.ds_local_orig ?? "").toLowerCase().includes("mucuripe"))
      .map(f => Number(f.dc_horas)).filter(h => !isNaN(h) && h > 0);
    return { mediaGeral: avgArr(all), pecem2muc: avgArr(pecem2muc), muc2pecem: avgArr(muc2pecem) };
  }, [filteredFainas]);

  const ultimasFainas = useMemo(() =>
    [...(filteredFainas as any[])]
      .sort((a, b) => (b.dh_inicio ?? "").localeCompare(a.dh_inicio ?? ""))
      .slice(0, 10),
  [filteredFainas]);

  // ── Histograma de fainas ───────────────────────────────────────────────────

  const histogramaFainas = useMemo(() => {
    const horas = (filteredFainas as any[])
      .map((f: any) => Number(f.dc_horas))
      .filter(h => !isNaN(h) && h > 0)
      .sort((a, b) => a - b);
    const data = FAINA_BUCKETS.map(b => ({
      label: b.label,
      count: horas.filter(h => h >= b.min && h < b.max).length,
    }));
    const mediana = horas.length > 0 ? horas[Math.floor(horas.length / 2)]   : null;
    const p90     = horas.length > 0 ? horas[Math.floor(horas.length * 0.9)] : null;
    const medianaLabel = mediana != null ? FAINA_BUCKETS.find(b => mediana >= b.min && mediana < b.max)?.label ?? null : null;
    const p90Label     = p90     != null ? FAINA_BUCKETS.find(b => p90     >= b.min && p90     < b.max)?.label ?? null : null;
    return { data, mediana, p90, medianaLabel, p90Label, total: horas.length };
  }, [filteredFainas]);


  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalManobras = (filteredManobras as any[]).length;
    const horasTotais   = (filteredIndicadores as any[]).reduce((s: number, i: any) => s + (Number(i.dc_dif_be) || 0), 0);
    const periodDays    = filterDe && filterAte
      ? Math.max(1, Math.round((new Date(filterAte).getTime() - new Date(filterDe).getTime()) / 86400000) + 1)
      : 1;
    const cntMuc = (filteredManobras as any[]).filter((m: any) => m.ds_porto === "Mucuripe").length;
    const cntPec = (filteredManobras as any[]).filter((m: any) => m.ds_porto === "Pecém").length;
    const fainaMaisLonga = (filteredFainas as any[]).reduce((max: number, f: any) => {
      const h = Number(f.dc_horas); return !isNaN(h) && h > max ? h : max;
    }, 0);
    let deltaPct: number | null = null;
    if (filterDe && filterAte) {
      const periodMs = new Date(filterAte).getTime() - new Date(filterDe).getTime() + 86400000;
      const prevAte  = new Date(new Date(filterDe).getTime() - 86400000).toISOString().slice(0, 10);
      const prevDe   = new Date(new Date(filterDe).getTime() - periodMs).toISOString().slice(0, 10);
      const prev = (manobras ?? []).filter((m: any) => {
        const d = (m.dh_manobra ?? "").slice(0, 10);
        return d >= prevDe && d <= prevAte && selectedLanchas.includes(Number(m.cd_lancha));
      }).length;
      if (prev > 0) deltaPct = ((totalManobras - prev) / prev) * 100;
    }
    return {
      totalManobras, deltaPct, cntMuc, cntPec,
      horasTotais:    Math.round(horasTotais * 10) / 10,
      manobrasPorDia: Math.round((totalManobras / periodDays) * 10) / 10,
      fainaMaisLonga: fainaMaisLonga > 0 ? fainaMaisLonga : null,
    };
  }, [filteredManobras, filteredIndicadores, filteredFainas, manobras, filterDe, filterAte, selectedLanchas]);

  // ── Combustível ───────────────────────────────────────────────────────────

  const dadosPrecoLitro = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const a of filteredAbastecimentos as any[]) {
      const mes = (a.dh_abastecimento ?? "").slice(0, 7);
      const posto = normalizaPosto(a.ds_posto ?? "Outros");
      if (!mes || !a.vl_unitario) continue;
      if (!map.has(mes)) map.set(mes, new Map());
      const pm = map.get(mes)!;
      if (!pm.has(posto)) pm.set(posto, []);
      pm.get(posto)!.push(Number(a.vl_unitario));
    }
    const postos = [...new Set((filteredAbastecimentos as any[]).map((a: any) => normalizaPosto(a.ds_posto ?? "Outros")))];
    return [...map.keys()].sort().map(mes => {
      const pt: Record<string, any> = { mes: fmtMonth(mes) };
      for (const posto of postos) {
        const vals = map.get(mes)?.get(posto) ?? [];
        pt[posto] = vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 1000) / 1000 : null;
      }
      return pt;
    });
  }, [filteredAbastecimentos]);

  const postosUnicos = useMemo(() =>
    [...new Set((filteredAbastecimentos as any[]).map((a: any) => normalizaPosto(a.ds_posto ?? "Outros")))].sort(),
  [filteredAbastecimentos]);

  const dadosLitrosPorHora = useMemo(() => {
    const litMap = new Map<string, Record<number, number>>();
    for (const a of filteredAbastecimentos as any[]) {
      const mes = (a.dh_abastecimento ?? "").slice(0, 7);
      const cd = Number(a.cd_lancha);
      if (!mes || !a.dc_litros || !selectedLanchas.includes(cd)) continue;
      if (!litMap.has(mes)) litMap.set(mes, {});
      litMap.get(mes)![cd] = (litMap.get(mes)![cd] ?? 0) + Number(a.dc_litros);
    }
    const hMap = new Map<string, Record<number, number>>();
    for (const i of filteredIndicadores as any[]) {
      const mes = (i.dh_leitura ?? "").slice(0, 7);
      const cd = Number(i.cd_lancha);
      if (!mes || !i.dc_dif_be) continue;
      if (!hMap.has(mes)) hMap.set(mes, {});
      hMap.get(mes)![cd] = (hMap.get(mes)![cd] ?? 0) + Number(i.dc_dif_be);
    }
    const meses = [...new Set([...litMap.keys()])].sort();
    return meses.map(mes => {
      const pt: Record<string, any> = { mes: fmtMonth(mes) };
      for (const cd of selectedLanchas) {
        const lit = litMap.get(mes)?.[cd] ?? 0;
        const h   = hMap.get(mes)?.[cd]   ?? 0;
        pt[LANCHA_NOME[cd]] = lit > 0 && h > 0 ? Math.round((lit / h) * 10) / 10 : null;
      }
      return pt;
    });
  }, [filteredAbastecimentos, filteredIndicadores, selectedLanchas]);

  const dadosLitrosPorManobra = useMemo(() => {
    const litMap = new Map<string, Record<number, number>>();
    for (const a of filteredAbastecimentos as any[]) {
      const mes = (a.dh_abastecimento ?? "").slice(0, 7);
      const cd = Number(a.cd_lancha);
      if (!mes || !a.dc_litros || !selectedLanchas.includes(cd)) continue;
      if (!litMap.has(mes)) litMap.set(mes, {});
      litMap.get(mes)![cd] = (litMap.get(mes)![cd] ?? 0) + Number(a.dc_litros);
    }
    const mMap = new Map<string, Record<number, number>>();
    for (const m of filteredManobras as any[]) {
      const mes = (m.dh_manobra ?? "").slice(0, 7);
      const cd = Number(m.cd_lancha);
      if (!mes) continue;
      if (!mMap.has(mes)) mMap.set(mes, {});
      mMap.get(mes)![cd] = (mMap.get(mes)![cd] ?? 0) + 1;
    }
    const meses = [...new Set([...litMap.keys()])].sort();
    return meses.map(mes => {
      const pt: Record<string, any> = { mes: fmtMonth(mes) };
      for (const cd of selectedLanchas) {
        const lit = litMap.get(mes)?.[cd] ?? 0;
        const n   = mMap.get(mes)?.[cd]   ?? 0;
        pt[LANCHA_NOME[cd]] = lit > 0 && n > 0 ? Math.round((lit / n) * 10) / 10 : null;
      }
      return pt;
    });
  }, [filteredAbastecimentos, filteredManobras, selectedLanchas]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Operações</h1>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const lanchasLabel = selectedLanchas.length === LANCHAS.length ? "Todas"
    : selectedLanchas.length === 0 ? "Nenhuma"
    : selectedLanchas.map(cd => LANCHA_NOME[cd]).join(", ");

  const pctMuc = kpis.cntMuc + kpis.cntPec > 0
    ? Math.round((kpis.cntMuc / (kpis.cntMuc + kpis.cntPec)) * 100)
    : null;
  const pctPec = pctMuc != null ? 100 - pctMuc : null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Operações</h1>
        <p className="text-sm text-accent">Manobras, horas de operação e deslocamentos das lanchas</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
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
                      <Checkbox checked={selectedLanchas.includes(l.cd)} onCheckedChange={() => toggleLancha(l.cd)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[l.cd] }} />
                      <span className="text-sm">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={filterDe} onChange={e => setFilterDe(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Até</span>
              <input type="date" value={filterAte} onChange={e => setFilterAte(e.target.value)} className={inputClass} />
            </div>

            <Select value={filterPorto} onValueChange={v => setFilterPorto(v as any)}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos os portos</SelectItem>
                <SelectItem value="Mucuripe">Mucuripe</SelectItem>
                <SelectItem value="Pecém">Pecém</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Scorecards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Manobras</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{kpis.totalManobras}</p>
            {kpis.deltaPct != null && (
              <p className={`text-xs mt-0.5 font-medium ${kpis.deltaPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                {kpis.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(kpis.deltaPct).toFixed(1)}% vs período ant.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Horas Operadas</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{kpis.horasTotais.toFixed(0)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Manobras / Dia</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{kpis.manobrasPorDia}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Mucuripe vs Pecém</p>
            {pctMuc != null ? (
              <>
                <p className="text-base font-bold font-mono tabular-nums leading-snug">
                  Muc {pctMuc}% · Pec {pctPec}%
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpis.cntMuc} Muc · {kpis.cntPec} Pec</p>
              </>
            ) : <p className="text-2xl font-bold">—</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Deslocamento Mais Longo</p>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {kpis.fainaMaisLonga != null ? `${kpis.fainaMaisLonga.toFixed(1)}h` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 1 — Manobras por mês */}
      <Card>
        <CardHeader><CardTitle className="text-base">Manobras por Mês</CardTitle></CardHeader>
        <CardContent>
          {manobrasPorMes.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem dados de manobras para {fmtPeriodo(filterDe, filterAte)}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={manobrasPorMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, "auto"]}
                  label={{ value: "qtd", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                <Tooltip content={<ManobrasTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedLanchas.map(cd => (
                  <Area key={cd} type="monotone" dataKey={LANCHA_NOME[cd]}
                    stroke={LANCHA_COR[cd]} fill={LANCHA_COR[cd]} fillOpacity={0.3} strokeWidth={2} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gráfico 2 + 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Horas de Operação por Mês</CardTitle></CardHeader>
          <CardContent>
            {horasPorMes.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Nenhum dado no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={horasPorMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }}
                    label={{ value: "h", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                  <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}h`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedLanchas.map(cd => (
                    <Bar key={cd} dataKey={LANCHA_NOME[cd]} stackId="a" fill={LANCHA_COR[cd]}>
                      <LabelList dataKey={LANCHA_NOME[cd]} position="inside"
                        content={(props: any) => {
                          const { x, y, width, height, value } = props;
                          if (!value || Number(value) <= 20) return null;
                          return (
                            <text x={x + width / 2} y={y + height / 2} fill="#fff"
                              textAnchor="middle" dominantBaseline="central" fontSize={9}>
                              {`${Number(value).toFixed(0)}h`}
                            </text>
                          );
                        }} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Distribuição de Manobras</CardTitle></CardHeader>
          <CardContent>
            {distribuicaoManobras.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={distribuicaoManobras} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                    dataKey="value" nameKey="name"
                    label={({ name, value, percent }) => `${name} ${value} (${(percent * 100).toFixed(1)}%)`} labelLine>
                    {distribuicaoManobras.map(entry => (
                      <Cell key={entry.cd} fill={LANCHA_COR[entry.cd]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [`${v} manobras`, name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── SEÇÃO: Disponibilidade ─────────────────────────────── */}
      <TooltipProvider>
        <div className="space-y-4">

          {/* KPI cards — Técnica + Operacional lado a lado */}
          <div className="grid grid-cols-2 gap-4">

            {/* KPI Disponibilidade Técnica (só corretivas, excl. projetos) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  Disponibilidade Técnica
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Considera apenas horas de inoperância por manutenção <strong>corretiva</strong>, excluindo projetos de melhoria. Meta ≥ 95%.
                    </TooltipContent>
                  </UITooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {disponibilidadeTecnicaPorLancha.map(d => {
                  const cor = d.disp >= 95 ? "#16A34A" : "#DC2626";
                  return (
                    <div key={d.cd} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[d.cd] }} />
                          <span className="text-xs font-medium">{d.nome}</span>
                        </div>
                        <span className="text-sm font-bold font-mono" style={{ color: cor }}>
                          {d.disp.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${d.disp}%`, backgroundColor: cor }} />
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const media = disponibilidadeTecnicaPorLancha.reduce((s, d) => s + d.disp, 0) / Math.max(1, disponibilidadeTecnicaPorLancha.length);
                  return (
                    <div className="pt-2 border-t border-border flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">Média frota</span>
                      <span className="text-xs font-mono font-semibold text-muted-foreground">{media.toFixed(1)}%</span>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground">Meta: ≥ 95%</p>
              </CardContent>
            </Card>

            {/* KPI Disponibilidade Operacional (tudo inoperante) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  Disponibilidade Operacional
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Considera todas as horas de inoperância, independentemente do tipo de manutenção (corretiva, preventiva ou outros). Meta ≥ 85%.
                    </TooltipContent>
                  </UITooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {disponibilidadePorLancha.map(d => {
                  const cor = d.disp >= 85 ? "#16A34A" : "#DC2626";
                  return (
                    <div key={d.cd} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[d.cd] }} />
                          <span className="text-xs font-medium">{d.nome}</span>
                        </div>
                        <span className="text-sm font-bold font-mono" style={{ color: cor }}>
                          {d.disp.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${d.disp}%`, backgroundColor: cor }} />
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const media = disponibilidadePorLancha.reduce((s, d) => s + d.disp, 0) / Math.max(1, disponibilidadePorLancha.length);
                  return (
                    <div className="pt-2 border-t border-border flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">Média frota</span>
                      <span className="text-xs font-mono font-semibold text-muted-foreground">{media.toFixed(1)}%</span>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground">Meta: ≥ 85%</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico combinado — linha sólida=Operacional, tracejada=Técnica */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Disponibilidade por Período — Operacional (sólida) × Técnica (tracejada)</CardTitle>
            </CardHeader>
            <CardContent>
              {disponibilidadeMensal.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={disponibilidadeMensal} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 85, 95, 100]}
                      tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                    <ReferenceArea y1={0} y2={85} fill="#FEF3C7" fillOpacity={0.15} />
                    <ReferenceLine y={85} stroke="#9CA3AF" strokeDasharray="3 3"
                      label={{ value: "85% op.", position: "insideTopRight", fontSize: 9, fill: "#9CA3AF" }} />
                    <ReferenceLine y={95} stroke="#9CA3AF" strokeDasharray="3 3"
                      label={{ value: "95% tec.", position: "insideTopRight", fontSize: 9, fill: "#9CA3AF" }} />
                    <Tooltip formatter={(v: any, n: string) => [`${Number(v).toFixed(1)}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedLanchas.map(cd => (
                      <Line key={`${cd}_op`} type="monotone" dataKey={LANCHA_NOME[cd]}
                        stroke={LANCHA_COR[cd]} strokeWidth={2}
                        name={`${LANCHA_NOME[cd]} operacional`}
                        dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                    ))}
                    {selectedLanchas.map(cd => (
                      <Line key={`${cd}_tec`} type="monotone" dataKey={LANCHA_NOME[cd] + "_tec"}
                        stroke={LANCHA_COR[cd]} strokeWidth={1.5}
                        strokeDasharray="5 3"
                        name={`${LANCHA_NOME[cd]} técnica`}
                        dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

        </div>
      </TooltipProvider>
      {/* ── FIM SEÇÃO Disponibilidade ─────────────────────────── */}

      {/* Manobras por Porto — card compacto + gráfico de barras lado a lado */}
      <div className="grid grid-cols-4 gap-4">

        {/* Card compacto Manobras por Porto */}
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">
              Manobras por Porto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {LANCHAS.filter(l => selectedLanchas.includes(l.cd)).map(l => {
              const man = (filteredManobras as any[]).filter(m => Number(m.cd_lancha) === l.cd);
              const mucuripe = man.filter(m => m.ds_porto === "Mucuripe").length;
              const pecem    = man.filter(m => (m.ds_porto ?? "").includes("Pec")).length;
              const total    = man.length;
              return (
                <div key={l.cd} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[l.cd] }} />
                    <span className="text-xs font-medium">{l.nome}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{total} man.</span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                    <div style={{ width: `${total ? (mucuripe / total) * 100 : 0}%`, backgroundColor: "#0891B2" }} />
                    <div style={{ width: `${total ? (pecem / total) * 100 : 0}%`, backgroundColor: "#7C3AED" }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Mucuripe {total ? Math.round((mucuripe / total) * 100) : 0}%</span>
                    <span>Pecém {total ? Math.round((pecem / total) * 100) : 0}%</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Gráfico de barras Manobras por Porto */}
        <Card className="col-span-3">
          <CardHeader><CardTitle className="text-base">Manobras por Porto</CardTitle></CardHeader>
          <CardContent>
            {manobrasPorPorto.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">
                Sem dados de manobras para {fmtPeriodo(filterDe, filterAte)}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={manobrasPorPorto} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="porto" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }}
                    label={{ value: "qtd", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedLanchas.map(cd => (
                    <Bar key={cd} dataKey={LANCHA_NOME[cd]} fill={LANCHA_COR[cd]}>
                      <LabelList dataKey={LANCHA_NOME[cd]} position="inside"
                        content={(props: any) => {
                          const { x, y, width, height, value } = props;
                          if (!value || Number(value) < 5) return null;
                          return (
                            <text x={x + width / 2} y={y + height / 2} fill="#fff"
                              textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
                              {value}
                            </text>
                          );
                        }} />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 5 — Eficiência horas/manobra */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eficiência — Horas por Manobra</CardTitle>
        </CardHeader>
        <CardContent>
          {eficienciaPorMes.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={eficienciaPorMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }}
                  label={{ value: "h/man.", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                <Tooltip formatter={(v: any, name: string) => [
                  v != null ? `${Number(v).toFixed(2)}h` : "—", name
                ]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedLanchas.map(cd => (
                  <Line key={cd} type="monotone" dataKey={LANCHA_NOME[cd]}
                    stroke={LANCHA_COR[cd]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Deslocamentos */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Deslocamentos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Período: {fmtPeriodo(filterDe, filterAte)}</p>
        </div>

        {/* Cards médias */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Duração Média Geral", value: statsDeslocamentos.mediaGeral },
            { label: "Pecém → Mucuripe",    value: statsDeslocamentos.pecem2muc  },
            { label: "Mucuripe → Pecém",    value: statsDeslocamentos.muc2pecem  },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-3xl font-bold font-mono tabular-nums">
                  {value != null ? `${value.toFixed(2)}h` : "—"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Histograma */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição de Duração dos Deslocamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {histogramaFainas.total === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Sem fainas no período</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={histogramaFainas.data} margin={{ top: 16, right: 20, bottom: 60, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      interval={0}
                      tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={4} textAnchor="end" fill="hsl(var(--muted-foreground))"
                            fontSize={9} transform="rotate(-40)">
                            {payload.value}
                          </text>
                        </g>
                      )}
                    />
                    <YAxis tick={{ fontSize: 10 }}
                      label={{ value: "qtd", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                    <Tooltip formatter={(v: any) => [`${v} fainas`, "Quantidade"]} />
                    <Bar dataKey="count" fill="#6366f1" name="Fainas" radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                    {histogramaFainas.medianaLabel && (
                      <ReferenceLine x={histogramaFainas.medianaLabel} stroke="#f59e0b" strokeDasharray="4 2"
                        label={{ value: `Md ${histogramaFainas.mediana?.toFixed(1)}h`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
                    )}
                    {histogramaFainas.p90Label && histogramaFainas.p90Label !== histogramaFainas.medianaLabel && (
                      <ReferenceLine x={histogramaFainas.p90Label} stroke="#ef4444" strokeDasharray="4 2"
                        label={{ value: `P90 ${histogramaFainas.p90?.toFixed(1)}h`, position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground text-right mt-1">
                  {histogramaFainas.total} fainas · Mediana {histogramaFainas.mediana?.toFixed(2)}h · P90 {histogramaFainas.p90?.toFixed(2)}h
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Tabela últimas fainas — colapsável */}
        <Card>
          <button
            className="w-full text-left"
            onClick={() => setDeslocExpanded(v => !v)}
          >
            <CardHeader className="pb-2 hover:bg-accent/40 transition-colors rounded-t-lg">
              <CardTitle className="text-sm flex items-center gap-2">
                Últimos 10 Deslocamentos
                <span className="text-xs text-muted-foreground font-normal">{fmtPeriodo(filterDe, filterAte)}</span>
                <ChevronDown
                  className={`h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 ${deslocExpanded ? "rotate-180" : ""}`}
                />
              </CardTitle>
            </CardHeader>
          </button>
          {deslocExpanded && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="text-right">Duração</TableHead>
                      <TableHead>Lancha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ultimasFainas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          Sem deslocamentos no período
                        </TableCell>
                      </TableRow>
                    ) : ultimasFainas.map((f: any) => (
                      <TableRow key={f.cd_faina_lancha}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDatetime(f.dh_inicio)}</TableCell>
                        <TableCell className="text-sm">{f.ds_local_orig ?? "—"}</TableCell>
                        <TableCell className="text-sm">{f.ds_local_dest ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtHours(Number(f.dc_horas))}</TableCell>
                        <TableCell className="text-sm">{LANCHA_NOME[Number(f.cd_lancha)] ?? f.ds_lancha ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* ── SEÇÃO: Combustível ─────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Combustível</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Abastecimentos diesel — {fmtPeriodo(filterDe, filterAte)}
          </p>
        </div>

        {/* Gráfico A — Preço do litro por mês por fornecedor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preço do Litro por Mês — por Fornecedor</CardTitle>
          </CardHeader>
          <CardContent>
            {dadosPrecoLitro.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados de abastecimento para {fmtPeriodo(filterDe, filterAte)}</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dadosPrecoLitro} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `R$${Number(v).toFixed(3)}`} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v: any) => [`R$ ${Number(v).toFixed(3)}/L`, ""]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {postosUnicos.map(posto => (
                    <Line key={posto} type="monotone" dataKey={posto}
                      stroke={POSTO_COR[posto] ?? POSTO_COR_DEFAULT}
                      strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráficos B + C lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Gráfico B — Litros/hora */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consumo — Litros por Hora Operada</CardTitle>
            </CardHeader>
            <CardContent>
              {dadosLitrosPorHora.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dadosLitrosPorHora} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => `${v}L/h`} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip formatter={(v: any, n: string) => [`${Number(v).toFixed(1)} L/h`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedLanchas.map(cd => (
                      <Line key={cd} type="monotone" dataKey={LANCHA_NOME[cd]}
                        stroke={LANCHA_COR[cd]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico C — Litros/manobra */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consumo — Litros por Manobra</CardTitle>
            </CardHeader>
            <CardContent>
              {dadosLitrosPorManobra.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dadosLitrosPorManobra} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => `${v}L`} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip formatter={(v: any, n: string) => [`${Number(v).toFixed(1)} L/manobra`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedLanchas.map(cd => (
                      <Line key={cd} type="monotone" dataKey={LANCHA_NOME[cd]}
                        stroke={LANCHA_COR[cd]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {/* ── FIM SEÇÃO Combustível ───────────────────────────────── */}
    </div>
  );
}
