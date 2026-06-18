import { useState, useMemo } from "react";
import { useDespesas, useFaturamentoCusto } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PAGE_SIZE = 50;

function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ABR[parseInt(m) - 1]}/${y}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CustosDetalhesPage() {
  const { data: despesas } = useDespesas();
  const { data: faturamento } = useFaturamentoCusto();

  // ── Filtros aba Despesas ───────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterAno, setFilterAno] = useState("Todos");
  const [filterCentro, setFilterCentro] = useState("Todos");
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [page, setPage] = useState(0);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.ano_mes) s.add(d.ano_mes.slice(0, 4));
    for (const f of faturamento ?? []) if (f.ano_mes) s.add(f.ano_mes.slice(0, 4));
    return ["Todos", ...[...s].sort().reverse()];
  }, [despesas, faturamento]);

  const centros = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.centro_resultado) s.add(d.centro_resultado);
    return ["Todos", ...[...s].sort()];
  }, [despesas]);

  const tipos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.tipo_despesa) s.add(d.tipo_despesa);
    return ["Todos", ...[...s].sort()];
  }, [despesas]);

  // ── Aba 1: Faturamento ────────────────────────────────────────────────────
  const fatRows = useMemo(() => {
    return [...(faturamento ?? [])].sort((a, b) => b.ano_mes.localeCompare(a.ano_mes));
  }, [faturamento]);

  const fatTotals = useMemo(() => ({
    faturamento: fatRows.reduce((s, f) => s + (Number(f.faturamento) || 0), 0),
    custo_total: fatRows.reduce((s, f) => s + (Number(f.custo_total) || 0), 0),
  }), [fatRows]);

  // ── Aba 2: Despesas ───────────────────────────────────────────────────────
  const filteredDespesas = useMemo(() => {
    const q = search.toLowerCase();
    return (despesas ?? []).filter(d => {
      if (filterAno !== "Todos" && !d.ano_mes?.startsWith(filterAno)) return false;
      if (filterCentro !== "Todos" && d.centro_resultado !== filterCentro) return false;
      if (filterTipo !== "Todos" && d.tipo_despesa !== filterTipo) return false;
      if (q && !`${d.fornecedor} ${d.historico}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [despesas, filterAno, filterCentro, filterTipo, search]);

  const totalPages = Math.ceil(filteredDespesas.length / PAGE_SIZE);
  const pageDespesas = filteredDespesas.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalFiltrado = filteredDespesas.reduce((s, d) => s + (Number(d.valor) || 0), 0);

  function resetPage() { setPage(0); }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custos — Detalhes</h1>
        <p className="text-sm text-accent">Tabelas detalhadas de faturamento e despesas</p>
      </div>

      <Tabs defaultValue="faturamento">
        <TabsList>
          <TabsTrigger value="faturamento">Faturamento Mensal</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
        </TabsList>

        {/* ── Aba 1: Faturamento ─────────────────────────────────────────── */}
        <TabsContent value="faturamento" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faturamento e Custo Mensal</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Custo Total</TableHead>
                      <TableHead className="text-right">% Custo/Fat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fatRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Sem dados. Faça upload via "Atualizar Dados" na página de Custos.
                        </TableCell>
                      </TableRow>
                    ) : fatRows.map(f => {
                      const pct = f.faturamento > 0 ? (f.custo_total / f.faturamento) * 100 : null;
                      return (
                        <TableRow key={f.ano_mes}>
                          <TableCell className="font-medium">{fmtMes(f.ano_mes)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtBRL(Number(f.faturamento))}</TableCell>
                          <TableCell className="text-right font-mono">{fmtBRL(Number(f.custo_total))}</TableCell>
                          <TableCell className="text-right font-mono">
                            {pct != null ? `${pct.toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {fatRows.length > 0 && (
                <div className="border-t px-6 py-3 flex justify-between text-sm font-semibold text-foreground">
                  <span>Total</span>
                  <div className="flex gap-16">
                    <span className="font-mono">{fmtBRL(fatTotals.faturamento)}</span>
                    <span className="font-mono">{fmtBRL(fatTotals.custo_total)}</span>
                    <span className="font-mono">
                      {fatTotals.faturamento > 0
                        ? `${((fatTotals.custo_total / fatTotals.faturamento) * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba 2: Despesas ────────────────────────────────────────────── */}
        <TabsContent value="despesas" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Buscar fornecedor ou histórico..."
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
              className="h-9 w-64"
            />
            <Select value={filterAno} onValueChange={v => { setFilterAno(v); resetPage(); }}>
              <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCentro} onValueChange={v => { setFilterCentro(v); resetPage(); }}>
              <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {centros.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={v => { setFilterTipo(v); resetPage(); }}>
              <SelectTrigger className="h-9 w-56 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Centro</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Histórico</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageDespesas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Sem despesas no filtro selecionado
                        </TableCell>
                      </TableRow>
                    ) : pageDespesas.map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(d.data)}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate" title={d.fornecedor}>
                          {d.fornecedor || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{d.centro_resultado || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.tipo_despesa || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtBRL(Number(d.valor))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={d.historico}>
                          {d.historico || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {filteredDespesas.length} registros · Total:{" "}
                  <span className="font-semibold font-mono text-foreground">{fmtBRL(totalFiltrado)}</span>
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
