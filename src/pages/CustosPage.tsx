import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useDespesas, useFaturamentoCusto, useManobras } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Treemap,
} from "recharts";
import { Upload, ChevronDown } from "lucide-react";

// ── Constantes exportadas ─────────────────────────────────────────────────────

export const NORM_CENTRO: Record<string, string> = {
  "Lancha Flexeiras":   "Flexeiras",
  "Lancha Taíba III":   "Taíba",
  "Lancha Jeri":        "Jeri",
  "Conteiner de Apoio": "Container de Apoio",
};

export const LANCHAS_OPERACIONAIS = ["Flexeiras", "Fortim", "Taíba"];

const ALL_CENTROS = ["Flexeiras", "Fortim", "Taíba", "Lancha Nova", "Jeri", "Container de Apoio"];

const COR_CENTRO: Record<string, string> = {
  Flexeiras:            "#2563EB",
  Fortim:               "#16A34A",
  Taíba:                "#F97316",
  "Lancha Nova":        "#8B5CF6",
  Jeri:                 "#06B6D4",
  "Container de Apoio": "#6B7280",
};

const TIPO_CORES = [
  "#6366F1", "#EC4899", "#F59E0B", "#10B981",
  "#3B82F6", "#EF4444", "#8B5CF6", "#14B8A6",
  "#F97316", "#6B7280", "#84CC16", "#A855F7",
];

const TREEMAP_CORES = [
  "#2563EB", "#16A34A", "#F97316", "#8B5CF6", "#06B6D4",
  "#EC4899", "#F59E0B", "#10B981", "#EF4444", "#6B7280",
  "#3B82F6", "#84CC16",
];

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ABR[parseInt(m) - 1]}/${y.slice(2)}`;
}

function fmtBRL(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2).replace(".", ",")} Mi`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")} Mil`;
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function normCentro(c: string): string {
  return NORM_CENTRO[c?.trim()] ?? c?.trim() ?? "";
}

// ── Treemap custom cell ───────────────────────────────────────────────────────

function TreemapContent(props: any) {
  const { x, y, width, height, name, size, index } = props;
  const color = TREEMAP_CORES[index % TREEMAP_CORES.length];
  if (!width || !height || width < 20 || height < 15) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={2} />
      {width > 60 && height > 28 && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (height > 48 ? 8 : 0)}
          textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}
        >
          {name && name.length > 14 ? name.slice(0, 13) + "…" : name}
        </text>
      )}
      {width > 60 && height > 48 && (
        <text
          x={x + width / 2} y={y + height / 2 + 10}
          textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}
        >
          {fmtBRL(size ?? 0)}
        </text>
      )}
    </g>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CustosPage() {
  const qc = useQueryClient();
  const { data: despesas } = useDespesas();
  const { data: faturamento } = useFaturamentoCusto();
  const { data: manobras } = useManobras();

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [filterAno, setFilterAno] = useState<string>("Todos");
  const [filterCentros, setFilterCentros] = useState<string[]>([...ALL_CENTROS]);
  const [filterTipos, setFilterTipos] = useState<string[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Upload state
  const [fileFat, setFileFat] = useState<File | null>(null);
  const [fileDesp, setFileDesp] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.ano_mes) s.add(d.ano_mes.slice(0, 4));
    for (const f of faturamento ?? []) if (f.ano_mes) s.add(f.ano_mes.slice(0, 4));
    return ["Todos", ...[...s].sort().reverse()];
  }, [despesas, faturamento]);

  const todosTipos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.tipo_despesa) s.add(d.tipo_despesa);
    return [...s].sort();
  }, [despesas]);

  const activeTipos = filterTipos ?? todosTipos;

  const filteredDespesas = useMemo(() => {
    return (despesas ?? []).filter(d => {
      if (filterAno !== "Todos" && !d.ano_mes?.startsWith(filterAno)) return false;
      if (!filterCentros.includes(d.centro_resultado)) return false;
      if (!activeTipos.includes(d.tipo_despesa)) return false;
      return true;
    });
  }, [despesas, filterAno, filterCentros, activeTipos]);

  const filtFaturamento = useMemo(() => {
    return (faturamento ?? []).filter(f =>
      filterAno === "Todos" || f.ano_mes?.startsWith(filterAno)
    );
  }, [faturamento, filterAno]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const custosLanchas = filteredDespesas.reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const custoTotal = filtFaturamento.reduce((s, f) => s + (Number(f.custo_total) || 0), 0);
    const fat = filtFaturamento.reduce((s, f) => s + (Number(f.faturamento) || 0), 0);
    const pctCustoFat = fat > 0 ? (custosLanchas / fat) * 100 : null;
    const manobrasNoPeriodo = (manobras ?? []).filter((m: any) =>
      filterAno === "Todos" || (m.dh_manobra ?? "").startsWith(filterAno)
    );
    const custoManobra = manobrasNoPeriodo.length > 0 ? custosLanchas / manobrasNoPeriodo.length : null;
    return { custosLanchas, custoTotal, fat, pctCustoFat, custoManobra };
  }, [filteredDespesas, filtFaturamento, manobras, filterAno]);

  // ── Dados dos gráficos ────────────────────────────────────────────────────

  const donutCentro = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filteredDespesas) {
      const c = d.centro_resultado || "Outros";
      map.set(c, (map.get(c) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredDespesas]);

  const donutTipo = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filteredDespesas) {
      const t = d.tipo_despesa || "Sem Tipo";
      map.set(t, (map.get(t) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredDespesas]);

  const dadosMensais = useMemo(() => {
    const custoByMes = new Map<string, number>();
    for (const d of filteredDespesas) {
      if (d.ano_mes) custoByMes.set(d.ano_mes, (custoByMes.get(d.ano_mes) ?? 0) + (Number(d.valor) || 0));
    }
    const fatByMes = new Map<string, { faturamento: number; custo_total: number }>();
    for (const f of filtFaturamento) {
      if (f.ano_mes) fatByMes.set(f.ano_mes, { faturamento: f.faturamento, custo_total: f.custo_total });
    }
    const allMonths = [...new Set([...custoByMes.keys(), ...fatByMes.keys()])].sort();
    return allMonths.map(mes => {
      const custo = custoByMes.get(mes) ?? 0;
      const fat = fatByMes.get(mes);
      const pct_fat = fat?.faturamento ? Math.round((custo / fat.faturamento) * 1000) / 10 : null;
      const pct_custo_total = fat?.custo_total ? Math.round((custo / fat.custo_total) * 1000) / 10 : null;
      return { mes: fmtMes(mes), custo, pct_fat, pct_custo_total };
    });
  }, [filteredDespesas, filtFaturamento]);

  const treemapData = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filteredDespesas) {
      const forn = d.fornecedor || "Desconhecido";
      map.set(forn, (map.get(forn) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .map(([name, size]) => ({ name, size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 20);
  }, [filteredDespesas]);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function processarArquivos() {
    setUploading(true);
    setUploadResult(null);
    try {
      if (fileFat) {
        const buf = await fileFat.arrayBuffer();
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const fatData = rows.slice(1)
          .filter(r => r[0] && r[1] != null && r[2] != null)
          .map(r => {
            const dt = r[0] instanceof Date
              ? r[0]
              : new Date(Math.round((Number(r[0]) - 25569) * 86400 * 1000));
            const ano_mes = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            return { ano_mes, faturamento: Number(r[1]), custo_total: Number(r[2]) };
          });
        const { error } = await (supabase as any)
          .from("faturamento_custo_mensal")
          .upsert(fatData, { onConflict: "ano_mes" });
        if (error) throw new Error("Erro faturamento: " + error.message);
      }

      if (fileDesp) {
        const buf = await fileDesp.arrayBuffer();
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const despData = rows.slice(1)
          .filter(r => r[0])
          .map(r => {
            const dt = r[0] instanceof Date
              ? r[0]
              : new Date(Math.round((Number(r[0]) - 25569) * 86400 * 1000));
            const data = dt.toISOString().slice(0, 10);
            const ano_mes = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            const forn = (r[1] ?? "").toString().trim();
            const centro = normCentro((r[2] ?? "").toString());
            let tipo = (r[3] ?? "").toString().trim();
            if (!tipo && forn.toUpperCase().includes("BR DISTRIBU")) {
              tipo = "Combustíveis e Lubrificantes";
            }
            const valor = Number((r[4] ?? 0).toString().replace(",", "."));
            const hist = (r[5] ?? "").toString().trim();
            return { data, fornecedor: forn, centro_resultado: centro, tipo_despesa: tipo, valor, historico: hist, ano_mes };
          });
        const meses = [...new Set(despData.map(d => d.ano_mes))];
        for (const mes of meses) {
          await (supabase as any).from("despesas").delete().eq("ano_mes", mes);
        }
        const { error } = await (supabase as any).from("despesas").insert(despData);
        if (error) throw new Error("Erro despesas: " + error.message);
      }

      qc.invalidateQueries({ queryKey: ["faturamento_custo"] });
      qc.invalidateQueries({ queryKey: ["despesas"] });
      setUploadResult("✅ Processado com sucesso!");
    } catch (e: any) {
      setUploadResult("❌ " + (e?.message ?? String(e)));
    } finally {
      setUploading(false);
    }
  }

  // ── Labels dos popovers ───────────────────────────────────────────────────
  const centroLabel = filterCentros.length === ALL_CENTROS.length ? "Todos"
    : filterCentros.length === 0 ? "Nenhum"
    : filterCentros.length <= 2 ? filterCentros.join(", ")
    : `${filterCentros.length} centros`;

  const tipoLabel = activeTipos.length === todosTipos.length ? "Todos"
    : activeTipos.length === 0 ? "Nenhum"
    : activeTipos.length === 1 ? activeTipos[0]
    : `${activeTipos.length} tipos`;

  const KPI_CARDS = [
    { label: "Custo Lanchas",  value: fmtBRL(kpis.custosLanchas) },
    { label: "Custo Total",    value: fmtBRL(kpis.custoTotal) },
    { label: "Faturamento",    value: fmtBRL(kpis.fat) },
    { label: "Custo/Manobra",  value: kpis.custoManobra != null ? fmtBRL(kpis.custoManobra) : "—" },
    { label: "% Custo/Fat",    value: kpis.pctCustoFat != null ? `${kpis.pctCustoFat.toFixed(1)}%` : "—" },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custos</h1>
          <p className="text-sm text-accent">Análise de despesas operacionais e faturamento</p>
        </div>
        <Button onClick={() => { setUploadResult(null); setFileFat(null); setFileDesp(null); setModalOpen(true); }} className="gap-2">
          <Upload className="h-4 w-4" />
          Atualizar Dados
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterAno} onValueChange={setFilterAno}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Centro</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{centroLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <div className="space-y-1">
                  {ALL_CENTROS.map(c => (
                    <label key={c} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={filterCentros.includes(c)}
                        onCheckedChange={() =>
                          setFilterCentros(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
                        }
                      />
                      <span className="text-sm">{c}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Tipo</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{tipoLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2 max-h-64 overflow-y-auto" align="start">
                <div className="space-y-1">
                  {todosTipos.map(t => (
                    <label key={t} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={activeTipos.includes(t)}
                        onCheckedChange={() =>
                          setFilterTipos(prev => {
                            const cur = prev ?? todosTipos;
                            return cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
                          })
                        }
                      />
                      <span className="text-sm">{t}</span>
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
        {KPI_CARDS.map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico 1 + 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Distribuição por Centro</CardTitle></CardHeader>
          <CardContent>
            {donutCentro.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={donutCentro} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    labelLine>
                    {donutCentro.map((entry, i) => (
                      <Cell key={entry.name} fill={COR_CENTRO[entry.name] ?? TIPO_CORES[i % TIPO_CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [fmtBRL(Number(v)), name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Custo Mensal vs Representatividade</CardTitle></CardHeader>
          <CardContent>
            {dadosMensais.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dadosMensais} margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => fmtBRL(v)}
                    label={{ value: "R$", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
                    tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(v: any, name: string) =>
                      name === "Custo Lanchas"
                        ? [fmtBRL(Number(v)), name]
                        : [v != null ? `${Number(v).toFixed(1)}%` : "—", name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="custo" name="Custo Lanchas" fill="#6366F1" opacity={0.8} />
                  <Line yAxisId="right" type="monotone" dataKey="pct_fat" name="% Custo/Fat"
                    stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="pct_custo_total" name="% Custo/Total"
                    stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 3 + 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Distribuição por Tipo de Despesa</CardTitle></CardHeader>
          <CardContent>
            {donutTipo.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={donutTipo} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                    dataKey="value" nameKey="name"
                    label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                    labelLine>
                    {donutTipo.map((entry, i) => (
                      <Cell key={entry.name} fill={TIPO_CORES[i % TIPO_CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [fmtBRL(Number(v)), name]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Top 20 Fornecedores</CardTitle></CardHeader>
          <CardContent>
            {treemapData.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  aspectRatio={16 / 9}
                  stroke="#fff"
                  content={(props: any) => <TreemapContent {...props} />}
                >
                  <Tooltip
                    content={({ payload }: any) => {
                      const item = payload?.[0]?.payload;
                      if (!item) return null;
                      return (
                        <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold">{item.name}</p>
                          <p>{fmtBRL(item.size ?? item.value ?? 0)}</p>
                        </div>
                      );
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Upload */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Dados de Custos</DialogTitle>
            <DialogDescription>
              Selecione os arquivos Excel recebidos do financeiro.
              Os dados do(s) mês(es) contido(s) no arquivo serão substituídos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Faturamento e Custo Mensal (.xlsx)</Label>
              <Input type="file" accept=".xlsx,.xls" className="mt-1.5"
                onChange={e => setFileFat(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground mt-1">
                Colunas: Mês | Faturamento Total | Custo Total
              </p>
            </div>
            <div>
              <Label>Despesas — Lanchas (.xlsx)</Label>
              <Input type="file" accept=".xlsx,.xls" className="mt-1.5"
                onChange={e => setFileDesp(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground mt-1">
                Colunas: Data | Fornecedor | Centro de Resultado | Tipo de despesa | Valor | Histórico
              </p>
            </div>
            {uploadResult && (
              <p className={`text-sm font-medium ${uploadResult.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
                {uploadResult}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={processarArquivos} disabled={uploading || (!fileFat && !fileDesp)}>
              {uploading ? "Processando..." : "Processar e Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
