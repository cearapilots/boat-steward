import { useState, useMemo } from "react";
import { useManobras, useIndicadoresOp, useFainas } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
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

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

const todayStr = new Date().toISOString().slice(0, 10);
const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// ── Tooltip customizado para Gráfico 1 ───────────────────────────────────────

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
  const { data: manobras,    isLoading: loadingM } = useManobras();
  const { data: indicadores, isLoading: loadingI } = useIndicadoresOp();
  const { data: fainas,      isLoading: loadingF } = useFainas();

  const [selectedLanchas, setSelectedLanchas] = useState<number[]>([121, 1003, 117]);
  const [filterDe,  setFilterDe]  = useState(oneYearAgo);
  const [filterAte, setFilterAte] = useState(todayStr);
  const [filterPorto, setFilterPorto] = useState<"Todos" | "Mucuripe" | "Pecém">("Todos");

  const isLoading = loadingM || loadingI || loadingF;

  function toggleLancha(cd: number) {
    setSelectedLanchas(prev =>
      prev.includes(cd) ? prev.filter(c => c !== cd) : [...prev, cd]
    );
  }

  // ── Dados filtrados ────────────────────────────────────────────────────────

  const filteredManobras = useMemo(() => {
    return (manobras ?? []).filter((m: any) => {
      if (!selectedLanchas.includes(Number(m.cd_lancha))) return false;
      const date = (m.dh_manobra ?? "").slice(0, 10);
      if (filterDe  && date < filterDe)  return false;
      if (filterAte && date > filterAte) return false;
      if (filterPorto !== "Todos" && m.ds_porto !== filterPorto) return false;
      return true;
    });
  }, [manobras, selectedLanchas, filterDe, filterAte, filterPorto]);

  const filteredIndicadores = useMemo(() => {
    return (indicadores ?? []).filter((i: any) => {
      if (!selectedLanchas.includes(Number(i.cd_lancha))) return false;
      const date = (i.dh_leitura ?? "").slice(0, 10);
      if (filterDe  && date < filterDe)  return false;
      if (filterAte && date > filterAte) return false;
      // Porto: só filtra registros que têm porto definido; null sempre passa
      if (filterPorto !== "Todos" && i.porto != null && i.porto !== filterPorto) return false;
      return true;
    });
  }, [indicadores, selectedLanchas, filterDe, filterAte, filterPorto]);

  const filteredFainas = useMemo(() => {
    return (fainas ?? []).filter((f: any) => {
      if (!selectedLanchas.includes(Number(f.cd_lancha))) return false;
      const date = (f.dh_inicio ?? "").slice(0, 10);
      if (filterDe  && date < filterDe)  return false;
      if (filterAte && date > filterAte) return false;
      // Porto NÃO se aplica a fainas
      return true;
    });
  }, [fainas, selectedLanchas, filterDe, filterAte]);

  // ── Gráfico 1: Manobras por mês ───────────────────────────────────────────

  const manobrasPorMes = useMemo(() => {
    const map = new Map<string, Record<number, number>>();
    for (const m of filteredManobras as any[]) {
      const month = (m.dh_manobra ?? "").slice(0, 7);
      if (!month) continue;
      if (!map.has(month)) map.set(month, {});
      const entry = map.get(month)!;
      const cd = Number(m.cd_lancha);
      entry[cd] = (entry[cd] ?? 0) + 1;
    }
    return [...map.keys()].sort().map(month => {
      const entry = map.get(month)!;
      const pt: Record<string, any> = { month: fmtMonth(month) };
      for (const cd of selectedLanchas) pt[LANCHA_NOME[cd]] = entry[cd] ?? 0;
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
      const entry = map.get(month)!;
      const cd = Number(i.cd_lancha);
      entry[cd] = (entry[cd] ?? 0) + h;
    }
    return [...map.keys()].sort().map(month => {
      const entry = map.get(month)!;
      const pt: Record<string, any> = { month: fmtMonth(month) };
      for (const cd of selectedLanchas) {
        pt[LANCHA_NOME[cd]] = entry[cd] != null ? Math.round(entry[cd] * 10) / 10 : 0;
      }
      return pt;
    });
  }, [filteredIndicadores, selectedLanchas]);

  // ── Gráfico 3: Distribuição manobras por lancha (donut) ───────────────────

  const distribuicaoManobras = useMemo(() => {
    const countByCd = new Map<number, number>();
    for (const m of filteredManobras as any[]) {
      const cd = Number(m.cd_lancha);
      countByCd.set(cd, (countByCd.get(cd) ?? 0) + 1);
    }
    return LANCHAS
      .filter(l => selectedLanchas.includes(l.cd))
      .map(l => ({ name: l.nome, value: countByCd.get(l.cd) ?? 0, cd: l.cd }))
      .filter(d => d.value > 0);
  }, [filteredManobras, selectedLanchas]);

  // ── Gráfico 4: Manobras por porto ─────────────────────────────────────────

  const manobrasPorPorto = useMemo(() => {
    const map = new Map<string, Record<number, number>>();
    for (const m of filteredManobras as any[]) {
      const porto = m.ds_porto ?? "Outros";
      if (!map.has(porto)) map.set(porto, {});
      const entry = map.get(porto)!;
      const cd = Number(m.cd_lancha);
      entry[cd] = (entry[cd] ?? 0) + 1;
    }
    return [...map.keys()].sort().map(porto => {
      const entry = map.get(porto) ?? {};
      const pt: Record<string, any> = { porto };
      for (const cd of selectedLanchas) pt[LANCHA_NOME[cd]] = entry[cd] ?? 0;
      return pt;
    });
  }, [filteredManobras, selectedLanchas]);

  // ── Deslocamentos ──────────────────────────────────────────────────────────

  const statsDeslocamentos = useMemo(() => {
    const all = (filteredFainas as any[])
      .map(f => Number(f.dc_horas)).filter(h => !isNaN(h) && h > 0);
    const pecem2muc = (filteredFainas as any[])
      .filter(f => {
        const orig = (f.ds_local_orig ?? "").toLowerCase();
        return orig.includes("pec") && (orig.includes("m") || orig.includes("pecem") || orig.includes("pecém"));
      })
      .map(f => Number(f.dc_horas)).filter(h => !isNaN(h) && h > 0);
    const muc2pecem = (filteredFainas as any[])
      .filter(f => (f.ds_local_orig ?? "").toLowerCase().includes("mucuripe"))
      .map(f => Number(f.dc_horas)).filter(h => !isNaN(h) && h > 0);
    return {
      mediaGeral: avgArr(all),
      pecem2muc:  avgArr(pecem2muc),
      muc2pecem:  avgArr(muc2pecem),
    };
  }, [filteredFainas]);

  const ultimasFainas = useMemo(() =>
    [...(filteredFainas as any[])]
      .sort((a, b) => (b.dh_inicio ?? "").localeCompare(a.dh_inicio ?? ""))
      .slice(0, 10),
    [filteredFainas]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Operações</h1>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const lanchasLabel = selectedLanchas.length === LANCHAS.length
    ? "Todas"
    : selectedLanchas.length === 0
    ? "Nenhuma"
    : selectedLanchas.map(cd => LANCHA_NOME[cd]).join(", ");

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
            {/* Lanchas */}
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
                      <Checkbox
                        checked={selectedLanchas.includes(l.cd)}
                        onCheckedChange={() => toggleLancha(l.cd)}
                      />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[l.cd] }} />
                      <span className="text-sm">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Período */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={filterDe} onChange={e => setFilterDe(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Até</span>
              <input type="date" value={filterAte} onChange={e => setFilterAte(e.target.value)} className={inputClass} />
            </div>

            {/* Porto */}
            <Select value={filterPorto} onValueChange={v => setFilterPorto(v as any)}>
              <SelectTrigger className="h-9 w-40 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos os portos</SelectItem>
                <SelectItem value="Mucuripe">Mucuripe</SelectItem>
                <SelectItem value="Pecém">Pecém</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico 1 — Manobras por mês */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manobras por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          {manobrasPorMes.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Nenhuma manobra no período selecionado
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={manobrasPorMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }} domain={[0, "auto"]}
                  label={{ value: "qtd", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                />
                <Tooltip content={<ManobrasTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedLanchas.map(cd => (
                  <Area
                    key={cd}
                    type="monotone"
                    dataKey={LANCHA_NOME[cd]}
                    stroke={LANCHA_COR[cd]}
                    fill={LANCHA_COR[cd]}
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gráfico 2 + 3 lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Gráfico 2 — Horas de operação por mês (60%) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Horas de Operação por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            {horasPorMes.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Nenhum dado no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={horasPorMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    label={{ value: "h", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                  />
                  <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}h`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {selectedLanchas.map(cd => (
                    <Bar key={cd} dataKey={LANCHA_NOME[cd]} stackId="a" fill={LANCHA_COR[cd]}>
                      <LabelList
                        dataKey={LANCHA_NOME[cd]}
                        position="inside"
                        content={(props: any) => {
                          const { x, y, width, height, value } = props;
                          if (!value || Number(value) <= 20) return null;
                          return (
                            <text
                              x={x + width / 2} y={y + height / 2}
                              fill="#fff" textAnchor="middle"
                              dominantBaseline="central" fontSize={9}
                            >
                              {`${Number(value).toFixed(0)}h`}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 3 — Donut distribuição manobras (40%) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Distribuição de Manobras</CardTitle>
          </CardHeader>
          <CardContent>
            {distribuicaoManobras.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={distribuicaoManobras}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    labelLine
                  >
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

      {/* Gráfico 4 — Manobras por porto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manobras por Porto</CardTitle>
        </CardHeader>
        <CardContent>
          {manobrasPorPorto.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Nenhuma manobra no período selecionado
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={manobrasPorPorto} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="porto" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  label={{ value: "qtd", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedLanchas.map(cd => (
                  <Bar key={cd} dataKey={LANCHA_NOME[cd]} fill={LANCHA_COR[cd]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Deslocamentos */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Deslocamentos</h2>

        {/* Cards de média */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Duração Média Geral",  value: statsDeslocamentos.mediaGeral },
            { label: "Pecém → Mucuripe",      value: statsDeslocamentos.pecem2muc  },
            { label: "Mucuripe → Pecém",      value: statsDeslocamentos.muc2pecem  },
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

        {/* Tabela últimas fainas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Últimas 10 Fainas</CardTitle>
          </CardHeader>
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
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {fmtDatetime(f.dh_inicio)}
                      </TableCell>
                      <TableCell className="text-sm">{f.ds_local_orig ?? "—"}</TableCell>
                      <TableCell className="text-sm">{f.ds_local_dest ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtHours(Number(f.dc_horas))}
                      </TableCell>
                      <TableCell className="text-sm">
                        {LANCHA_NOME[Number(f.cd_lancha)] ?? f.ds_lancha ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
