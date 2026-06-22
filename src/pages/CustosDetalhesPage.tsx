import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDespesas } from "@/hooks/useFleetData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type DespRow = {
  id: string; data: string; fornecedor: string; centro_resultado: string;
  tipo_despesa: string; valor: number; historico: string; ano_mes: string;
};

export default function CustosDetalhesPage() {
  const qc = useQueryClient();
  const { data: despesas } = useDespesas();

  // ── Edição despesas ───────────────────────────────────────────────────────
  const [editDesp, setEditDesp] = useState<DespRow | null>(null);
  const [editDespForm, setEditDespForm] = useState<Omit<DespRow, "id" | "ano_mes">>({
    data: "", fornecedor: "", centro_resultado: "", tipo_despesa: "", valor: 0, historico: "",
  });
  const [deleteDespId, setDeleteDespId] = useState<string | null>(null);
  const [savingDesp, setSavingDesp] = useState(false);

  function openEditDesp(row: DespRow) {
    setEditDesp(row);
    setEditDespForm({
      data: row.data, fornecedor: row.fornecedor, centro_resultado: row.centro_resultado,
      tipo_despesa: row.tipo_despesa, valor: row.valor, historico: row.historico,
    });
  }

  async function saveEditDesp() {
    if (!editDesp) return;
    setSavingDesp(true);
    try {
      const ano_mes = editDespForm.data.slice(0, 7);
      const { error } = await (supabase as any)
        .from("despesas")
        .update({ ...editDespForm, valor: Number(editDespForm.valor), ano_mes })
        .eq("id", editDesp.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["despesas"] });
      toast.success("Despesa atualizada");
      setEditDesp(null);
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message ?? String(e)));
    } finally {
      setSavingDesp(false);
    }
  }

  async function confirmDeleteDesp() {
    if (!deleteDespId) return;
    try {
      const { error } = await (supabase as any)
        .from("despesas")
        .delete()
        .eq("id", deleteDespId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["despesas"] });
      toast.success("Despesa excluída");
    } catch (e: any) {
      toast.error("Erro ao excluir: " + (e?.message ?? String(e)));
    } finally {
      setDeleteDespId(null);
    }
  }

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [filterAnos,    setFilterAnos]    = useState<string[]>([]);
  const [filterCentros, setFilterCentros] = useState<string[]>([]);
  const [filterTipos,   setFilterTipos]   = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.ano_mes) s.add(d.ano_mes.slice(0, 4));
    return [...s].sort().reverse();
  }, [despesas]);

  const centros = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.centro_resultado) s.add(d.centro_resultado);
    return [...s].sort();
  }, [despesas]);

  const tipos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.tipo_despesa) s.add(d.tipo_despesa);
    return [...s].sort();
  }, [despesas]);

  function toggleAno(a: string)    { setFilterAnos(p    => p.includes(a) ? p.filter(x => x !== a) : [...p, a]);    setPage(0); }
  function toggleCentro(c: string) { setFilterCentros(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]); setPage(0); }
  function toggleTipo(t: string)   { setFilterTipos(p   => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);   setPage(0); }

  const anosLabel    = filterAnos.length    === 0 ? "Todos"   : filterAnos.length    <= 2 ? filterAnos.join(", ")    : `${filterAnos.length} anos`;
  const centrosLabel = filterCentros.length === 0 ? "Todos"   : filterCentros.length === 1 ? filterCentros[0]        : `${filterCentros.length} centros`;
  const tiposLabel   = filterTipos.length   === 0 ? "Todos"   : filterTipos.length   === 1
    ? (filterTipos[0].length > 22 ? filterTipos[0].slice(0, 21) + "…" : filterTipos[0])
    : `${filterTipos.length} tipos`;

  const filteredDespesas = useMemo(() => {
    const q = search.toLowerCase();
    return (despesas ?? []).filter(d => {
      if (filterAnos.length    > 0 && !filterAnos.includes(d.ano_mes?.slice(0, 4) ?? ""))  return false;
      if (filterCentros.length > 0 && !filterCentros.includes(d.centro_resultado))          return false;
      if (filterTipos.length   > 0 && !filterTipos.includes(d.tipo_despesa))                return false;
      if (q && !`${d.fornecedor} ${d.historico}`.toLowerCase().includes(q))                 return false;
      return true;
    });
  }, [despesas, filterAnos, filterCentros, filterTipos, search]);

  const totalPages = Math.ceil(filteredDespesas.length / PAGE_SIZE);
  const pageDespesas = filteredDespesas.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalFiltrado = filteredDespesas.reduce((s, d) => s + (Number(d.valor) || 0), 0);

  function resetPage() { setPage(0); }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custos Detalhado</h1>
        <p className="text-sm text-accent">Tabela detalhada de despesas operacionais</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Buscar fornecedor ou histórico..."
          value={search}
          onChange={e => { setSearch(e.target.value); resetPage(); }}
          className="h-9 w-64"
        />

        {/* Ano */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[120px]">
              <span className="font-medium">Ano</span>
              <span className="text-muted-foreground text-xs flex-1 text-right truncate">{anosLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-2" align="start">
            <div className="space-y-1">
              {anos.map(a => (
                <label key={a} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                  <Checkbox checked={filterAnos.includes(a)} onCheckedChange={() => toggleAno(a)} />
                  <span className="text-sm font-mono">{a}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Centro */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
              <span className="font-medium">Centro</span>
              <span className="text-muted-foreground text-xs flex-1 text-right truncate">{centrosLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {centros.map(c => (
                <label key={c} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                  <Checkbox checked={filterCentros.includes(c)} onCheckedChange={() => toggleCentro(c)} />
                  <span className="text-sm">{c}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Tipo de Despesa */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[160px]">
              <span className="font-medium">Tipo</span>
              <span className="text-muted-foreground text-xs flex-1 text-right truncate">{tiposLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {tipos.map(t => (
                <label key={t} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                  <Checkbox checked={filterTipos.includes(t)} onCheckedChange={() => toggleTipo(t)} />
                  <span className="text-sm">{t}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Tabela */}
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
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageDespesas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Sem despesas no filtro selecionado
                    </TableCell>
                  </TableRow>
                ) : pageDespesas.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(d.data)}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate" title={d.fornecedor}>
                      {d.fornecedor || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{d.centro_resultado || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={d.tipo_despesa}>
                      {d.tipo_despesa || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtBRL(Number(d.valor))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                      <span className="line-clamp-2" title={d.historico}>{d.historico || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar"
                          onClick={() => openEditDesp(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
                <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
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

      {/* Dialog edição despesa */}
      <Dialog open={!!editDesp} onOpenChange={o => !o && setEditDesp(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" className="mt-1.5"
                  value={editDespForm.data}
                  onChange={e => setEditDespForm(f => ({ ...f, data: e.target.value }))} />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" className="mt-1.5"
                  value={editDespForm.valor}
                  onChange={e => setEditDespForm(f => ({ ...f, valor: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Input className="mt-1.5"
                value={editDespForm.fornecedor}
                onChange={e => setEditDespForm(f => ({ ...f, fornecedor: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Centro de Resultado</Label>
                <Input className="mt-1.5"
                  value={editDespForm.centro_resultado}
                  onChange={e => setEditDespForm(f => ({ ...f, centro_resultado: e.target.value }))} />
              </div>
              <div>
                <Label>Tipo de Despesa</Label>
                <Input className="mt-1.5"
                  value={editDespForm.tipo_despesa}
                  onChange={e => setEditDespForm(f => ({ ...f, tipo_despesa: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Histórico</Label>
              <Textarea className="mt-1.5" rows={3}
                value={editDespForm.historico}
                onChange={e => setEditDespForm(f => ({ ...f, historico: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="destructive"
              onClick={() => { setDeleteDespId(editDesp?.id ?? null); setEditDesp(null); }}>
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditDesp(null)}>Cancelar</Button>
              <Button onClick={saveEditDesp} disabled={savingDesp}>
                {savingDesp ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deleteDespId} onOpenChange={o => !o && setDeleteDespId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente o registro. Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDesp} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
