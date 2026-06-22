import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useDespesas, useManobras } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
import SankeyFluxo from "@/components/SankeyFluxo";

// ── Constantes exportadas ─────────────────────────────────────────────────────

export const NORM_CENTRO: Record<string, string> = {
  "Lancha Flexeiras":   "Flexeiras",
  "Lancha Taíba III":   "Taíba",
  "Lancha Jeri":        "Jeri",
  "Conteiner de Apoio": "Container de Apoio",
};

export const LANCHAS_OPERACIONAIS = ["Flexeiras", "Fortim", "Taíba"];

const ALL_CENTROS = ["Flexeiras", "Fortim", "Taíba", "Lancha Nova", "Jeri", "Container de Apoio"];

const CENTRO_TO_CD: Record<string, number[]> = {
  Flexeiras: [121],
  Fortim:    [1003],
  Taíba:     [117],
};

// ── Cores ─────────────────────────────────────────────────────────────────────

const COR_CENTRO: Record<string, string> = {
  Flexeiras: "#2563EB", Fortim: "#16A34A", Taíba: "#F97316",
  "Lancha Nova": "#8B5CF6", Jeri: "#06B6D4", "Container de Apoio": "#6B7280",
};

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

function toggle<T>(setter: (v: T | null) => void, atual: T | null, novo: T) {
  setter(atual === novo ? null : novo);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CustosPage() {
  const qc = useQueryClient();
  const { data: despesas } = useDespesas();
  const { data: manobras } = useManobras();

  // ── Filtros multi-select ──────────────────────────────────────────────────
  // Arrays vazios = sem filtro (mostra tudo)
  const [filterAnos,    setFilterAnos]    = useState<string[]>([]);
  const [filterLanchas, setFilterLanchas] = useState<string[]>([]);
  const [filterTipos,   setFilterTipos]   = useState<string[]>([]);

  // ── Cross-filters ─────────────────────────────────────────────────────────
  const [cfCentro,     setCfCentro]     = useState<string | null>(null);
  const [cfTipo,       setCfTipo]       = useState<string | null>(null);
  const [cfMes,        setCfMes]        = useState<string | null>(null);
  const [cfFornecedor, setCfFornecedor] = useState<string | null>(null);

  // ── Upload ────────────────────────────────────────────────────────────────
  const [modalOpen,    setModalOpen]    = useState(false);
  const [fileDesp,     setFileDesp]     = useState<File | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // ── Listas de opções ──────────────────────────────────────────────────────
  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.ano_mes) s.add(d.ano_mes.slice(0, 4));
    return [...s].sort().reverse();
  }, [despesas]);

  const todosTipos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.tipo_despesa) s.add(d.tipo_despesa);
    return [...s].sort();
  }, [despesas]);

  // ── Toggles multi-select ──────────────────────────────────────────────────
  function toggleAno(ano: string) {
    setFilterAnos(prev => prev.includes(ano) ? prev.filter(x => x !== ano) : [...prev, ano]);
    setCfMes(null);
  }

  function toggleLancha(l: string) {
    setFilterLanchas(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
    setCfCentro(null);
  }

  function toggleTipo(t: string) {
    setFilterTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    setCfTipo(null);
  }

  // ── Labels dos popovers ───────────────────────────────────────────────────
  const anosLabel = filterAnos.length === 0 ? "Todos"
    : filterAnos.length <= 2 ? filterAnos.join(", ")
    : `${filterAnos.length} anos`;

  const lanchasLabel = filterLanchas.length === 0 ? "Todas"
    : filterLanchas.length === 1 ? filterLanchas[0]
    : `${filterLanchas.length} lanchas`;

  const tiposLabel = filterTipos.length === 0 ? "Todos"
    : filterTipos.length === 1 ? (filterTipos[0].length > 20 ? filterTipos[0].slice(0, 19) + "…" : filterTipos[0])
    : `${filterTipos.length} tipos`;

  // ── Helpers de filtro ─────────────────────────────────────────────────────
  const despesasFiltradas = useMemo(() => {
    return (despesas ?? []).filter(d => {
      if (filterAnos.length > 0    && !filterAnos.includes(d.ano_mes.slice(0, 4)))   return false;
      if (filterLanchas.length > 0 && !filterLanchas.includes(d.centro_resultado))   return false;
      if (filterTipos.length > 0   && !filterTipos.includes(d.tipo_despesa))         return false;
      if (cfCentro     && d.centro_resultado !== cfCentro) return false;
      if (cfTipo       && d.tipo_despesa     !== cfTipo)   return false;
      if (cfMes        && d.ano_mes          !== cfMes)    return false;
      if (cfFornecedor && d.fornecedor       !== cfFornecedor) return false;
      return true;
    });
  }, [despesas, filterAnos, filterLanchas, filterTipos, cfCentro, cfTipo, cfMes, cfFornecedor]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = despesasFiltradas.reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const lanchas = despesasFiltradas
      .filter(d => LANCHAS_OPERACIONAIS.includes(d.centro_resultado))
      .reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const mesesFiltrados = new Set(despesasFiltradas.map(d => d.ano_mes));
    const totalManobras = (manobras ?? []).filter((m: any) =>
      mesesFiltrados.has((m.dh_manobra ?? "").slice(0, 7))
    ).length;
    return {
      total,
      lanchas,
      custoPorManobra: totalManobras > 0 ? lanchas / totalManobras : null,
      mediaMensal: total / Math.max(1, mesesFiltrados.size),
      nTransacoes: despesasFiltradas.length,
    };
  }, [despesasFiltradas, manobras]);

  // ── Gráfico 1: donut centro (ignora cfCentro) ─────────────────────────────
  const dadosCentro = useMemo(() => {
    const base = (despesas ?? []).filter(d => {
      if (filterAnos.length > 0    && !filterAnos.includes(d.ano_mes.slice(0, 4)))   return false;
      if (filterLanchas.length > 0 && !filterLanchas.includes(d.centro_resultado))   return false;
      if (filterTipos.length > 0   && !filterTipos.includes(d.tipo_despesa))         return false;
      if (cfTipo       && d.tipo_despesa !== cfTipo)       return false;
      if (cfMes        && d.ano_mes      !== cfMes)        return false;
      if (cfFornecedor && d.fornecedor   !== cfFornecedor) return false;
      return true;
    });
    const map = new Map<string, number>();
    for (const d of base) {
      const c = d.centro_resultado || "Outros";
      map.set(c, (map.get(c) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, valor]) => ({ nome, valor }));
  }, [despesas, filterAnos, filterLanchas, filterTipos, cfTipo, cfMes, cfFornecedor]);

  // ── Gráfico 2: barras mensais + custo/manobra (ignora cfMes) ─────────────
  const dadosMensal = useMemo(() => {
    const base = (despesas ?? []).filter(d => {
      if (filterAnos.length > 0    && !filterAnos.includes(d.ano_mes.slice(0, 4)))   return false;
      if (filterLanchas.length > 0 && !filterLanchas.includes(d.centro_resultado))   return false;
      if (filterTipos.length > 0   && !filterTipos.includes(d.tipo_despesa))         return false;
      if (cfCentro     && d.centro_resultado !== cfCentro) return false;
      if (cfTipo       && d.tipo_despesa     !== cfTipo)   return false;
      if (cfFornecedor && d.fornecedor       !== cfFornecedor) return false;
      return true;
    });
    const custoMap = new Map<string, number>();
    for (const d of base) {
      if (d.ano_mes) custoMap.set(d.ano_mes, (custoMap.get(d.ano_mes) ?? 0) + (Number(d.valor) || 0));
    }
    const manobraMap = new Map<string, number>();
    const cdsFiltro = filterLanchas.flatMap(l => CENTRO_TO_CD[l] ?? []);
    for (const m of (manobras ?? []) as any[]) {
      const mes = (m.dh_manobra ?? "").slice(0, 7);
      if (!mes) continue;
      if (filterAnos.length > 0 && !filterAnos.includes(mes.slice(0, 4))) continue;
      if (cdsFiltro.length > 0 && !cdsFiltro.includes(Number(m.cd_lancha))) continue;
      manobraMap.set(mes, (manobraMap.get(mes) ?? 0) + 1);
    }
    return [...custoMap.keys()].sort().map(mes => ({
      mes: fmtMes(mes),
      mesKey: mes,
      custo: Math.round(custoMap.get(mes) ?? 0),
      custoPorManobra: (manobraMap.get(mes) ?? 0) > 0
        ? Math.round((custoMap.get(mes) ?? 0) / manobraMap.get(mes)!)
        : null,
    }));
  }, [despesas, manobras, filterAnos, filterLanchas, filterTipos, cfCentro, cfTipo, cfFornecedor]);

  // ── Gráfico 3: donut tipo (ignora cfTipo) ─────────────────────────────────
  const dadosTipo = useMemo(() => {
    const base = (despesas ?? []).filter(d => {
      if (filterAnos.length > 0    && !filterAnos.includes(d.ano_mes.slice(0, 4)))   return false;
      if (filterLanchas.length > 0 && !filterLanchas.includes(d.centro_resultado))   return false;
      if (filterTipos.length > 0   && !filterTipos.includes(d.tipo_despesa))         return false;
      if (cfCentro     && d.centro_resultado !== cfCentro) return false;
      if (cfMes        && d.ano_mes          !== cfMes)    return false;
      if (cfFornecedor && d.fornecedor       !== cfFornecedor) return false;
      return true;
    });
    const map = new Map<string, number>();
    for (const d of base) {
      const g = grupoTipo(d.tipo_despesa);
      map.set(g, (map.get(g) ?? 0) + (Number(d.valor) || 0));
    }
    return GRUPOS_TIPO
      .map(g => ({ nome: g, valor: map.get(g) ?? 0, fill: GRUPO_TIPO_COR[g] }))
      .filter(d => d.valor > 0);
  }, [despesas, filterAnos, filterLanchas, filterTipos, cfCentro, cfMes, cfFornecedor]);

  // ── Gráfico 4: treemap fornecedor (ignora cfFornecedor) ───────────────────
  const dadosFornecedor = useMemo(() => {
    const base = (despesas ?? []).filter(d => {
      if (filterAnos.length > 0    && !filterAnos.includes(d.ano_mes.slice(0, 4)))   return false;
      if (filterLanchas.length > 0 && !filterLanchas.includes(d.centro_resultado))   return false;
      if (filterTipos.length > 0   && !filterTipos.includes(d.tipo_despesa))         return false;
      if (cfCentro && d.centro_resultado !== cfCentro) return false;
      if (cfTipo   && d.tipo_despesa     !== cfTipo)   return false;
      if (cfMes    && d.ano_mes          !== cfMes)    return false;
      return true;
    });
    const map = new Map<string, number>();
    for (const d of base) {
      const f = d.fornecedor || "Desconhecido";
      map.set(f, (map.get(f) ?? 0) + (Number(d.valor) || 0));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, size]) => ({
        name,
        size,
        shortName: name.length > 25 ? name.slice(0, 24) + "…" : name,
      }));
  }, [despesas, filterAnos, filterLanchas, filterTipos, cfCentro, cfTipo, cfMes]);

  // ── Upload ────────────────────────────────────────────────────────────────
  async function processarArquivos() {
    setUploading(true);
    setUploadResult(null);
    try {
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
      qc.invalidateQueries({ queryKey: ["despesas"] });
      setUploadResult("✅ Processado com sucesso!");
    } catch (e: any) {
      setUploadResult("❌ " + (e?.message ?? String(e)));
    } finally {
      setUploading(false);
    }
  }

  const hasCf = !!(cfCentro || cfTipo || cfMes || cfFornecedor);
  function clearAllCf() { setCfCentro(null); setCfTipo(null); setCfMes(null); setCfFornecedor(null); }

  const KPI_CARDS = [
    { label: "Custo Total",   value: fmtBRL(kpis.total) },
    { label: "Custo Lanchas", value: fmtBRL(kpis.lanchas) },
    { label: "Custo/Manobra", value: kpis.custoPorManobra != null ? fmtBRL(kpis.custoPorManobra) : "—" },
    { label: "Média Mensal",  value: fmtBRL(kpis.mediaMensal) },
    { label: "Transações",    value: kpis.nTransacoes.toLocaleString("pt-BR") },
  ];

  // ── Treemap content ───────────────────────────────────────────────────────
  function treemapContent(props: any) {
    const { x, y, width, height, name, value } = props;
    const fullName = dadosFornecedor.find(d => d.shortName === name)?.name ?? name;
    const isSelected = cfFornecedor === fullName;
    const opacity = cfFornecedor && !isSelected ? 0.3 : 1;
    if (!width || !height || width < 20 || height < 15) return null;
    return (
      <g style={{ cursor: "pointer" }}>
        <rect
          x={x} y={y} width={width} height={height}
          fill={isSelected ? "#1D4ED8" : "#3B82F6"}
          stroke="#fff" strokeWidth={2} opacity={opacity} rx={3}
        />
        {width > 60 && height > 30 && (
          <text x={x + 6} y={y + 16} fontSize={10} fill="#fff" opacity={opacity}>{name}</text>
        )}
        {width > 60 && height > 45 && (
          <text x={x + 6} y={y + 30} fontSize={9} fill="rgba(255,255,255,0.8)" opacity={opacity}>
            {`R$ ${(Number(value) / 1000).toFixed(0)}k`}
          </text>
        )}
      </g>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custos — Estatísticas</h1>
          <p className="text-sm text-accent">Análise de despesas operacionais</p>
        </div>
        <Button onClick={() => { setUploadResult(null); setFileDesp(null); setModalOpen(true); }}>
          <Upload className="h-4 w-4 mr-2" />
          Atualizar Dados
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">

            {/* Anos — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[130px]">
                  <span className="font-medium">Ano</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{anosLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2" align="start">
                <div className="space-y-1">
                  {anos.map(ano => (
                    <label key={ano} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterAnos.includes(ano)} onCheckedChange={() => toggleAno(ano)} />
                      <span className="text-sm font-mono">{ano}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Lanchas — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[150px]">
                  <span className="font-medium">Lancha</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{lanchasLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  {ALL_CENTROS.map(c => (
                    <label key={c} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterLanchas.includes(c)} onCheckedChange={() => toggleLancha(c)} />
                      {COR_CENTRO[c] && (
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR_CENTRO[c] }} />
                      )}
                      <span className="text-sm">{c}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Tipo de Despesa — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[180px]">
                  <span className="font-medium">Tipo de Despesa</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{tiposLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {todosTipos.map(t => (
                    <label key={t} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterTipos.includes(t)} onCheckedChange={() => toggleTipo(t)} />
                      <span className="text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

          </div>

          {hasCf && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtros ativos:</span>
              {cfCentro && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setCfCentro(null)}>
                  Centro: {cfCentro} ✕
                </Badge>
              )}
              {cfTipo && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setCfTipo(null)}>
                  Tipo: {cfTipo} ✕
                </Badge>
              )}
              {cfMes && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setCfMes(null)}>
                  Mês: {fmtMes(cfMes)} ✕
                </Badge>
              )}
              {cfFornecedor && (
                <Badge variant="secondary" className="cursor-pointer" onClick={() => setCfFornecedor(null)}>
                  Fornecedor: {cfFornecedor.length > 30 ? cfFornecedor.slice(0, 29) + "…" : cfFornecedor} ✕
                </Badge>
              )}
              <button onClick={clearAllCf} className="text-xs underline text-muted-foreground ml-1">
                Limpar todos
              </button>
            </div>
          )}
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
        {/* Donut: por centro */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Distribuição por Centro</CardTitle></CardHeader>
          <CardContent>
            {dadosCentro.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={dadosCentro}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    dataKey="valor" nameKey="nome"
                    onClick={(entry: any) => toggle(setCfCentro, cfCentro, entry.nome)}
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(1)}%` : ""}
                    labelLine
                  >
                    {dadosCentro.map(entry => (
                      <Cell
                        key={entry.nome}
                        fill={COR_CENTRO[entry.nome] ?? "#6B7280"}
                        opacity={cfCentro && cfCentro !== entry.nome ? 0.3 : 1}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [fmtBRL(Number(v)), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Barras: custo mensal + custo/manobra */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Custo Mensal
              <span className="text-xs font-normal text-muted-foreground">clique na barra para filtrar o mês</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dadosMensal.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={dadosMensal}
                  margin={{ top: 5, right: 30, bottom: 5, left: 0 }}
                  onClick={(e: any) => {
                    const mesKey = e?.activePayload?.[0]?.payload?.mesKey;
                    if (mesKey) toggle(setCfMes, cfMes, mesKey);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} style={{ cursor: "pointer" }} />
                  <YAxis yAxisId="custo" orientation="left"
                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="manobra" orientation="right"
                    tickFormatter={v => `R$${Number(v).toLocaleString("pt-BR")}`} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: any, name: string) => [
                      name === "Custo Total"
                        ? `R$ ${Number(v).toLocaleString("pt-BR")}`
                        : `R$ ${Number(v).toLocaleString("pt-BR")}/man`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="custo" dataKey="custo" name="Custo Total" radius={[3, 3, 0, 0]}>
                    {dadosMensal.map(d => (
                      <Cell
                        key={d.mesKey}
                        fill="#2563EB"
                        opacity={cfMes && cfMes !== d.mesKey ? 0.3 : 1}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="manobra" dataKey="custoPorManobra" name="Custo/Manobra"
                    type="monotone" stroke="#F97316" strokeWidth={2}
                    dot={{ r: 4 }} connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 3 + 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Donut: por tipo */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Distribuição por Tipo de Despesa</CardTitle></CardHeader>
          <CardContent>
            {dadosTipo.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dadosTipo}
                    cx="50%" cy="45%"
                    innerRadius={55} outerRadius={85}
                    dataKey="valor" nameKey="nome"
                    onClick={(entry: any) => toggle(setCfTipo, cfTipo, entry.nome)}
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(1)}%` : ""}
                    labelLine
                  >
                    {dadosTipo.map(entry => (
                      <Cell
                        key={entry.nome}
                        fill={entry.fill}
                        opacity={cfTipo && cfTipo !== entry.nome ? 0.3 : 1}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [fmtBRL(Number(v)), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Treemap: top fornecedores */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Top 20 Fornecedores
              <span className="text-xs font-normal text-muted-foreground">clique para filtrar</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dadosFornecedor.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <Treemap
                  data={dadosFornecedor}
                  dataKey="size"
                  nameKey="shortName"
                  onClick={(node: any) => toggle(setCfFornecedor, cfFornecedor, node.name)}
                  content={treemapContent as any}
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

      {/* Sankey: Fluxo de Custos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo de Custos Detalhado</CardTitle>
          <p className="text-xs text-muted-foreground">
            Valor Total → Tipo de Despesa → Fornecedor{cfFornecedor ? " → Histórico" : ""}
          </p>
        </CardHeader>
        <CardContent>
          <SankeyFluxo
            despesas={despesasFiltradas.map(d => ({
              tipo_despesa: d.tipo_despesa,
              fornecedor:   d.fornecedor,
              historico:    d.historico,
              valor:        Number(d.valor) || 0,
            }))}
            cfTipo={cfTipo}
            cfFornecedor={cfFornecedor}
            onSelectTipo={setCfTipo}
            onSelectFornecedor={setCfFornecedor}
          />
        </CardContent>
      </Card>

      {/* Modal Upload */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Dados de Despesas</DialogTitle>
            <DialogDescription>
              Selecione o arquivo Excel de despesas recebido do financeiro.
              Os dados do(s) mês(es) contido(s) no arquivo serão substituídos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <Button onClick={processarArquivos} disabled={uploading || !fileDesp}>
              {uploading ? "Processando..." : "Processar e Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
