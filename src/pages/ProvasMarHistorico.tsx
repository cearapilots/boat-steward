import { useState, useMemo, useEffect } from "react";
import { useProvasMar, useUpdateProvaMar, useLanchas, type ProvaMar } from "@/hooks/useFleetData";
import { DESCRICOES_PROVA } from "@/lib/provas-mar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

const PORTOS = ["Mucuripe", "Pecém"];

const inputClass =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function BoolCell({ v }: { v: boolean | null }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  return <span>{v ? "✅" : "❌"}</span>;
}

function boatColorClass(nome: string | null | undefined) {
  if (!nome) return "font-medium";
  const n = nome.toLowerCase();
  if (n.includes("flexeiras")) return "text-boat-flexeiras font-medium";
  if (n.includes("fortim")) return "text-boat-fortim font-medium";
  if (n.includes("taíba") || n.includes("taiba")) return "text-boat-taiba font-medium";
  return "font-medium";
}

function TruncCell({ text, limit = 50 }: { text: string | null; limit?: number }) {
  if (!text) return <span className="text-muted-foreground">—</span>;
  if (text.length <= limit) return <span className="text-muted-foreground">{text}</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-muted-foreground">{text.slice(0, limit) + "…"}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-wrap">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type EditForm = {
  velocidade: string;
  rpm: string;
  consumo: string;
  peso: string;
  qtd_odm: string;
  mestre: string;
  horimetro: string;
  porto: string;
  vento_popa: boolean;
  mar_calmo: boolean;
  observacao: string;
  descricao: string;
};

function toEditForm(p: ProvaMar): EditForm {
  return {
    velocidade: p.velocidade != null ? String(p.velocidade) : "",
    rpm: p.rpm != null ? String(p.rpm) : "",
    consumo: p.consumo_lts_hora != null ? String(p.consumo_lts_hora) : "",
    peso: p.peso_kg != null ? String(p.peso_kg) : "",
    qtd_odm: p.qtd_odm_lts != null ? String(p.qtd_odm_lts) : "",
    mestre: p.mestre ?? "",
    horimetro: p.horimetro != null ? String(p.horimetro) : "",
    porto: p.porto ?? "",
    vento_popa: p.vento_de_popa ?? false,
    mar_calmo: p.mar_calmo ?? false,
    observacao: p.observacao ?? "",
    descricao: p.descricao ?? "",
  };
}

function DetalheModal({
  prova,
  startEdit = false,
  onClose,
}: {
  prova: ProvaMar | null;
  startEdit?: boolean;
  onClose: () => void;
}) {
  const updateProvaMar = useUpdateProvaMar();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  useEffect(() => {
    if (prova) {
      setForm(toEditForm(prova));
      setEditing(startEdit);
    }
  }, [prova, startEdit]);

  if (!prova || !form) return null;

  function setF<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function handleSave() {
    if (!prova || !form) return;
    const toNum = (v: string) => (v !== "" ? Number(v) : null);
    updateProvaMar.mutate(
      {
        id: prova.id,
        lancha_id: prova.lancha_id,
        data: prova.data,
        descricao: form.descricao,
        velocidade: toNum(form.velocidade),
        rpm: toNum(form.rpm),
        consumo_lts_hora: toNum(form.consumo),
        peso_kg: toNum(form.peso),
        qtd_odm_lts: toNum(form.qtd_odm),
        mestre: form.mestre || null,
        horimetro: toNum(form.horimetro),
        porto: form.porto || null,
        vento_de_popa: form.vento_popa,
        mar_calmo: form.mar_calmo,
        observacao: form.observacao || null,
      },
      {
        onSuccess: () => {
          toast.success("Prova atualizada");
          setEditing(false);
          onClose();
        },
        onError: (e) =>
          toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`),
      }
    );
  }

  const lanchaNome = prova.lanchas?.nome ?? "—";

  return (
    <Dialog open={!!prova} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lanchaNome} — {fmtDate(prova.data)} — {prova.descricao}
          </DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm py-2">
            {[
              ["Lancha", lanchaNome],
              ["Data", fmtDate(prova.data)],
              ["Descrição", prova.descricao],
              ["Velocidade", prova.velocidade != null ? `${fmtNum(prova.velocidade)} nós` : "—"],
              ["RPM", prova.rpm != null ? fmtNum(prova.rpm) : "—"],
              ["Consumo", prova.consumo_lts_hora != null ? `${fmtNum(prova.consumo_lts_hora)} Lts/h` : "—"],
              ["Peso", prova.peso_kg != null ? `${fmtNum(prova.peso_kg)} Kg` : "—"],
              ["Qtd ODM", prova.qtd_odm_lts != null ? `${fmtNum(prova.qtd_odm_lts)} Lts` : "—"],
              ["Mestre", prova.mestre ?? "—"],
              ["Horímetro", prova.horimetro != null ? `${fmtNum(prova.horimetro)}h` : "—"],
              ["Porto", prova.porto ?? "—"],
              ["Vento de popa", prova.vento_de_popa === true ? "Sim" : prova.vento_de_popa === false ? "Não" : "—"],
              ["Mar calmo", prova.mar_calmo === true ? "Sim" : prova.mar_calmo === false ? "Não" : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
                <dd className="mt-0.5">{value}</dd>
              </div>
            ))}
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground font-medium">Observação</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{prova.observacao ?? "—"}</dd>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Select value={form.descricao} onValueChange={(v) => setF("descricao", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DESCRICOES_PROVA.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Velocidade (nós)</Label>
                <Input type="number" step="0.1" value={form.velocidade} onChange={(e) => setF("velocidade", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>RPM</Label>
                <Input type="number" step="1" value={form.rpm} onChange={(e) => setF("rpm", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Consumo (Lts/h)</Label>
                <Input type="number" step="0.1" value={form.consumo} onChange={(e) => setF("consumo", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Peso (Kg)</Label>
                <Input type="number" step="0.1" value={form.peso} onChange={(e) => setF("peso", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Qtd ODM (Lts)</Label>
                <Input type="number" step="0.1" value={form.qtd_odm} onChange={(e) => setF("qtd_odm", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Mestre</Label>
                <Input type="text" value={form.mestre} onChange={(e) => setF("mestre", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Horímetro</Label>
                <Input type="number" step="0.1" value={form.horimetro} onChange={(e) => setF("horimetro", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Porto</Label>
                <Select value={form.porto} onValueChange={(v) => setF("porto", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {PORTOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Label>Vento de popa?</Label>
                <Switch checked={form.vento_popa} onCheckedChange={(v) => setF("vento_popa", v)} />
                <span className="text-sm text-muted-foreground">{form.vento_popa ? "Sim" : "Não"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Label>Mar calmo?</Label>
                <Switch checked={form.mar_calmo} onCheckedChange={(v) => setF("mar_calmo", v)} />
                <span className="text-sm text-muted-foreground">{form.mar_calmo ? "Sim" : "Não"}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={form.observacao} onChange={(e) => setF("observacao", e.target.value)} rows={3} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setForm(toEditForm(prova)); }}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={updateProvaMar.isPending}>
                {updateProvaMar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" />Editar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProvasMarHistorico() {
  const { data: provas, isLoading } = useProvasMar();
  const { data: lanchas } = useLanchas();

  const [filterLanchas,    setFilterLanchas]    = useState<string[]>([]);
  const [filterDescricoes, setFilterDescricoes] = useState<string[]>([]);
  const [filterDe,  setFilterDe]  = useState("");
  const [filterAte, setFilterAte] = useState("");
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState<{ prova: ProvaMar; edit: boolean } | null>(null);

  function toggleLancha(nome: string) {
    setFilterLanchas(p => p.includes(nome) ? p.filter(x => x !== nome) : [...p, nome]);
  }
  function toggleDescricao(d: string) {
    setFilterDescricoes(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  }

  const lanchasLabel    = filterLanchas.length    === 0 ? "Todas"   : filterLanchas.join(", ");
  const descricaoLabel  = filterDescricoes.length === 0 ? "Todas"
    : filterDescricoes.length === 1 ? filterDescricoes[0]
    : `${filterDescricoes.length} tipos`;

  const filtered = useMemo(() => {
    return (provas ?? []).filter((p) => {
      if (filterLanchas.length    > 0 && !filterLanchas.includes(p.lanchas?.nome ?? ""))  return false;
      if (filterDescricoes.length > 0 && !filterDescricoes.includes(p.descricao))         return false;
      if (filterDe  && p.data < filterDe)  return false;
      if (filterAte && p.data > filterAte) return false;
      return true;
    });
  }, [provas, filterLanchas, filterDescricoes, filterDe, filterAte]);

  useEffect(() => { setPage(1); }, [filterLanchas, filterDescricoes, filterDe, filterAte]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = filterLanchas.length > 0 || filterDescricoes.length > 0 || filterDe !== "" || filterAte !== "";

  function clearFilters() {
    setFilterLanchas([]);
    setFilterDescricoes([]);
    setFilterDe("");
    setFilterAte("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Provas de Mar</h1>
        <p className="text-sm text-accent">Registros históricos de corridas de velocidade</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">

            {/* Lancha — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Lancha</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{lanchasLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {(lanchas ?? []).map((l: any) => (
                    <label key={l.id} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterLanchas.includes(l.nome)} onCheckedChange={() => toggleLancha(l.nome)} />
                      <span className="text-sm">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Descrição — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[160px]">
                  <span className="font-medium">Descrição</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{descricaoLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="space-y-1">
                  {DESCRICOES_PROVA.map((d) => (
                    <label key={d} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterDescricoes.includes(d)} onCheckedChange={() => toggleDescricao(d)} />
                      <span className="text-sm">{d}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Datas */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={filterDe} onChange={(e) => setFilterDe(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Até</span>
              <input type="date" value={filterAte} onChange={(e) => setFilterAte(e.target.value)} className={inputClass} />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  Exibindo {paginated.length} de {filtered.length} registros
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                      Próximo
                    </Button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Lancha</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Veloc. (nós)</TableHead>
                      <TableHead className="text-right">RPM</TableHead>
                      <TableHead className="text-right">Consumo</TableHead>
                      <TableHead>Porto</TableHead>
                      <TableHead className="text-center">Vento</TableHead>
                      <TableHead className="text-center">Mar</TableHead>
                      <TableHead>Mestre</TableHead>
                      <TableHead className="text-right">Horímetro</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((p) => {
                      const lanchaNome = p.lanchas?.nome ?? "—";
                      return (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setDetalhe({ prova: p, edit: false })}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(p.data)}</TableCell>
                          <TableCell className={boatColorClass(lanchaNome)}>{lanchaNome}</TableCell>
                          <TableCell className="text-sm">{p.descricao}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.velocidade != null ? fmtNum(p.velocidade) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.rpm != null ? fmtNum(p.rpm) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.consumo_lts_hora != null ? fmtNum(p.consumo_lts_hora) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{p.porto ?? "—"}</TableCell>
                          <TableCell className="text-center"><BoolCell v={p.vento_de_popa} /></TableCell>
                          <TableCell className="text-center"><BoolCell v={p.mar_calmo} /></TableCell>
                          <TableCell className="text-sm">{p.mestre ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.horimetro != null ? `${fmtNum(p.horimetro)}h` : "—"}
                          </TableCell>
                          <TableCell className="max-w-[180px]" onClick={(e) => e.stopPropagation()}>
                            <TruncCell text={p.observacao} limit={40} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setDetalhe({ prova: p, edit: true })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {paginated.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                          Nenhuma prova encontrada para os filtros selecionados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                    Próximo
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <DetalheModal
        prova={detalhe?.prova ?? null}
        startEdit={detalhe?.edit ?? false}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}
