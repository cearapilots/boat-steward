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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { Pencil, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [search,       setSearch]       = useState("");
  const [filterAno,    setFilterAno]    = useState("Todos");
  const [filterCentro, setFilterCentro] = useState("Todos");
  const [filterTipo,   setFilterTipo]   = useState("Todos");
  const [page, setPage] = useState(0);

  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of despesas ?? []) if (d.ano_mes) s.add(d.ano_mes.slice(0, 4));
    return ["Todos", ...[...s].sort().reverse()];
  }, [despesas]);

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

  const filteredDespesas = useMemo(() => {
    const q = search.toLowerCase();
    return (despesas ?? []).filter(d => {
      if (filterAno    !== "Todos" && !d.ano_mes?.startsWith(filterAno))       return false;
      if (filterCentro !== "Todos" && d.centro_resultado !== filterCentro)      return false;
      if (filterTipo   !== "Todos" && d.tipo_despesa     !== filterTipo)        return false;
      if (q && !`${d.fornecedor} ${d.historico}`.toLowerCase().includes(q))    return false;
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
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ano</span>
          <Select value={filterAno} onValueChange={v => { setFilterAno(v); resetPage(); }}>
            <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Centro</span>
          <Select value={filterCentro} onValueChange={v => { setFilterCentro(v); resetPage(); }}>
            <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{centros.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <Select value={filterTipo} onValueChange={v => { setFilterTipo(v); resetPage(); }}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
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
