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
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Treemap,
} from "recharts";
import { Upload } from "lucide-react";

// ── Constantes exportadas ─────────────────────────────────────────────────────

export const NORM_CENTRO: Record<string, string> = {
  "Lancha Flexeiras":   "Flexeiras",
  "Lancha Taíba III":   "Taíba",
  "Lancha Jeri":        "Jeri",
  "Conteiner de Apoio": "Container de Apoio",
};

export const LANCHAS_OPERACIONAIS = ["Flexeiras", "Fortim", "Taíba"];

const ALL_CENTROS = ["Todas", "Flexeiras", "Fortim", "Taíba", "Lancha Nova", "Jeri", "Container de Apoio"];

// cd_lancha para uso no filtro de manobras
const CENTRO_TO_CD: Record<string, number[]> = {
  Flexeiras: [121],
  Fortim:    [1003],
  Taíba:     [117],
};

// ── Grupos do pie tipo ────────────────────────────────────────────────────────

const GRUPOS_TIPO = [
  "Combustíveis e Lubrificantes",
  "Imobilizado em Andamento",
  "Manutenções e Reparos",
  "Embarcações",
  "Outros",
] as const;

const GRUPO_TIPO_COR: Record<string, string> = {
  "Combustíveis e Lubrificantes": "#F97316",
  "Imobilizado em Andamento":     "#2563EB",
  "Manutenções e Reparos":        "#16A34A",
  "Embarcações":                  "#06B6D4",
  "Outros":                       "#6B7280",
};

// Tipos que mapeiam para cada grupo (case-sensitive)
const TIPO_TO_GRUPO: Record<string, string> = {
  "Combustíveis e Lubrificantes": "Combustíveis e Lubrificantes",
  "Imobilizado em Andamento":     "Imobilizado em Andamento",
  "Manutenções e Reparos":        "Manutenções e Reparos",
  "Manutenção e Reparos":         "Manutenções e Reparos",
  "Embarcações":                  "Embarcações",
};

function grupoTipo(tipo: string | null | undefined): string {
  return TIPO_TO_GRUPO[(tipo ?? "").trim()] ?? "Outros";
}

// ── Treemap cores ─────────────────────────────────────────────────────────────

const TREEMAP_CORES = [
  "#2563EB", "#16A34A", "#F97316", "#8B5CF6", "#06B6D4",
  "#EC4899", "#F59E0B", "#10B981", "#EF4444", "#6B7280",
  "#3B82F6", "#84CC16",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

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

function TreemapCell(props: any) {
  const { x, y, width, height, name, size, index, selected, onSelect } = props;
  const isSelected = selected === name;
  const dimmed = selected && !isSelected;
  const color = TREEMAP_CORES[index % TREEMAP_CORES.length];
  if (!width || !height || width < 20 || height < 15) return null;
  return (
    <g onClick={() => onSelect?.(name)} style={{ cursor: "pointer" }}>
      <rect
        x={x} y={y} width={width} height={height}
        fill={color}
        stroke={isSelected ? "#fff" : "#fff"}
        strokeWidth={isSelected ? 3 : 2}
        opacity={dimmed ? 0.35 : 1}
      />
      {width > 60 && height > 28 && (
        <text x={x + width / 2} y={y + height / 2 - (height > 48 ? 8 : 0)}
          textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}>
          {name && name.length > 14 ? name.slice(0, 13) + "…" : name}
        </text>
      )}
      {width > 60 && height > 48 && (
        <text x={x + width / 2} y={y + height / 2 + 10}
          textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={9}>
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
  const [filterLancha, setFilterLancha] = useState<string>("Todas");
  const [filterTipo, setFilterTipo] = useState<string>("Todos");
  const [selectedFornecedor, setSelectedFornecedor] = useState<string | null>(null);
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
    return ["Todos", ...[...s].sort()];
  }, [despesas]);

  const filteredDespesas = useMemo(() => {
    return (despesas ?? []).filter(d => {
      if (filterAno !== "Todos" && !d.ano_mes?.startsWith(filterAno)) return false;
      if (filterLancha !== "Todas" && d.centro_resultado !== filterLancha) return false;
      if (filterTipo !== "Todos" && d.tipo_despesa !== filterTipo) return false;
      if (selectedFornecedor && d.fornecedor !== selectedFornecedor) return false;
      return true;
    });
  }, [despesas, filterAno, filterLancha, filterTipo, selectedFornecedor]);

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
    const manobrasNoPeriodo = (manobras ?? []).filter((m: any) => {
      if (filterAno !== "Todos" && !(m.dh_manobra ?? "").startsWith(filterAno)) return false;
      if (filterLancha !== "Todas") {
        const cds = CENTRO_TO_CD[filterLancha];
        if (cds && !cds.includes(Number(m.cd_lancha))) return false;
      }
      return true;
    });
    const custoManobra = manobrasNoPeriodo.length > 0 ? custosLanchas / manobrasNoPeriodo.length : null;
    return { custosLanchas, custoTotal, fat, pctCustoFat, custoManobra };
  }, [filteredDespesas, filtFaturamento, manobras, filterAno, filterLancha]);

  // ── Chart data ────────────────────────────────────────────────────────────

  const donutCentro = useMemo(() => {
    const COR_CENTRO: Record<string, string> = {
      Flexeiras: "#2563EB", Fortim: "#16A34A", Taíba: "#F97316",
      "Lancha Nova": "#8B5CF6", Jeri: "#06B6D4", "Container de Apoio": "#6B7280",
    };
    const TIPO_CORES = ["#6366F1","#EC4899","#F59E0B","#10B981","#3B82F6","#EF4444"];
    const map = new Map<string, number>();
    for (const d of filteredDespesas) {
      const c = d.centro_resultado || "Outros";
      map.set(c, (map.get(c) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .map(([name, value], i) => ({ name, value, fill: COR_CENTRO[name] ?? TIPO_CORES[i % TIPO_CORES.length] }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredDespesas]);

  const donutTipo = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filteredDespesas) {
      const g = grupoTipo(d.tipo_despesa);
      map.set(g, (map.get(g) ?? 0) + (Number(d.valor) || 0));
    }
    return GRUPOS_TIPO
      .map(g => ({ name: g, value: map.get(g) ?? 0, fill: GRUPO_TIPO_COR[g] }))
      .filter(d => d.value > 0);
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
    // manobras por mês filtradas
    const manByMes = new Map<string, number>();
    for (const m of (manobras ?? []) as any[]) {
      if (filterAno !== "Todos" && !(m.dh_manobra ?? "").startsWith(filterAno)) continue;
      if (filterLancha !== "Todas") {
        const cds = CENTRO_TO_CD[filterLancha];
        if (cds && !cds.includes(Number(m.cd_lancha))) continue;
      }
      const mes = (m.dh_manobra ?? "").slice(0, 7);
      if (mes) manByMes.set(mes, (manByMes.get(mes) ?? 0) + 1);
    }

    const allMonths = [...new Set([...custoByMes.keys(), ...fatByMes.keys()])].sort();
    return allMonths.map(mes => {
      const custo = custoByMes.get(mes) ?? 0;
      const fat = fatByMes.get(mes);
      const nMan = manByMes.get(mes) ?? 0;
      const pct_fat = fat?.faturamento ? Math.round((custo / fat.faturamento) * 1000) / 10 : null;
      const pct_total = fat?.custo_total ? Math.round((custo / fat.custo_total) * 1000) / 10 : null;
      const custo_manobra = nMan > 0 ? Math.round(custo / nMan) : null;
      return { mes: fmtMes(mes), pct_fat, pct_total, custo_manobra };
    });
  }, [filteredDespesas, filtFaturamento, manobras, filterAno, filterLancha]);

  const treemapData = useMemo(() => {
    const base = selectedFornecedor ? (despesas ?? []).filter(d => {
      if (filterAno !== "Todos" && !d.ano_mes?.startsWith(filterAno)) return false;
      if (filterLancha !== "Todas" && d.centro_resultado !== filterLancha) return false;
      if (filterTipo !== "Todos" && d.tipo_despesa !== filterTipo) return false;
      return true;
    }) : filteredDespesas;
    const map = new Map<string, number>();
    for (const d of base) {
      const forn = d.fornecedor || "Desconhecido";
      map.set(forn, (map.get(forn) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .map(([name, size]) => ({ name, size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 20);
  }, [despesas, filteredDespesas, filterAno, filterLancha, filterTipo, selectedFornecedor]);

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
            if (!tipo && forn.toUpperCase().includes("BR DISTRIBU")) tipo = "Combustíveis e Lubrificantes";
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

  function handleFornecedorClick(name: string) {
    setSelectedFornecedor(prev => prev === name ? null : name);
  }

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
          <h1 className="text-2xl font-bold text-foreground">Custos — Estatísticas</h1>
          <p className="text-sm text-accent">Análise de despesas operacionais e faturamento</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setUploadResult(null); setFileFat(null); setFileDesp(null); setModalOpen(true); }}
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          Atualizar Dados
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder="Tipo de Despesa" /></SelectTrigger>
              <SelectContent>
                {todosTipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterLancha} onValueChange={setFilterLancha}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Lancha" /></SelectTrigger>
              <SelectContent>
                {ALL_CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterAno} onValueChange={setFilterAno}>
              <SelectTrigger className="h-9 w-28 text-sm"><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>
                {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            {selectedFornecedor && (
              <button
                onClick={() => setSelectedFornecedor(null)}
                className="h-9 px-3 rounded-md border border-orange-300 bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100 transition-colors flex items-center gap-1"
              >
                Fornecedor: {selectedFornecedor} ✕
              </button>
            )}
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
                    {donutCentro.map(entry => (
                      <Cell key={entry.name} fill={entry.fill} />
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
                  <YAxis yAxisId="esq" tick={{ fontSize: 10 }} tickFormatter={v => fmtBRL(v)}
                    label={{ value: "R$/man.", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 9 } }} />
                  <YAxis yAxisId="dir" orientation="right" domain={[0, 100]}
                    tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(v: any, name: string) =>
                      name === "Custo/Manobra"
                        ? [v != null ? fmtBRL(Number(v)) : "—", name]
                        : [v != null ? `${Number(v).toFixed(1)}%` : "—", name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="esq" type="monotone" dataKey="custo_manobra" name="Custo/Manobra"
                    stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="dir" type="monotone" dataKey="pct_fat" name="Custo Lancha / Faturamento"
                    stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="dir" type="monotone" dataKey="pct_total" name="Custo Lancha / Custo Total"
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
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={donutTipo} cx="50%" cy="45%" innerRadius={55} outerRadius={85}
                    dataKey="value" nameKey="name"
                    label={({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(1)}%` : ""}
                    labelLine>
                    {donutTipo.map(entry => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [fmtBRL(Number(v)), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Top 20 Fornecedores
              {selectedFornecedor && (
                <span className="text-xs font-normal text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">
                  Clique novamente para desfiltrar
                </span>
              )}
            </CardTitle>
          </CardHeader>
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
                  content={<TreemapCell selected={selectedFornecedor} onSelect={handleFornecedorClick} />}
                >
                  <Tooltip
                    content={({ payload }: any) => {
                      const item = payload?.[0]?.payload;
                      if (!item) return null;
                      return (
                        <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold">{item.name}</p>
                          <p>{fmtBRL(item.size ?? item.value ?? 0)}</p>
                          <p className="text-muted-foreground mt-0.5">Clique para filtrar</p>
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
