import { useState, useMemo, useEffect } from "react";
import { useProvasMar, useUpdateProvaMar, useLanchas, type ProvaMar } from "@/hooks/useFleetData";
import { DESCRICOES_PROVA } from "@/pages/ProvasMarRegistrar";
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
import { Pencil } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

const PORTOS = ["Mucuripe", "Pecém"];

const inputClass =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
    consumo: p.consumo != null ? String(p.consumo) : "",
    peso: p.peso != null ? String(p.peso) : "",
    qtd_odm: p.qtd_odm != null ? String(p.qtd_odm) : "",
    mestre: p.mestre ?? "",
    horimetro: p.horimetro != null ? String(p.horimetro) : "",
    porto: p.porto ?? "",
    vento_popa: p.vento_popa ?? false,
    mar_calmo: p.mar_calmo ?? false,
    observacao: p.observacao ?? "",
    descricao: p.descricao ?? "",
  };
}

function DetalheModal({
  prova,
  onClose,
}: {
  prova: ProvaMar | null;
  onClose: () => void;
}) {
  const updateProvaMar = useUpdateProvaMar();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);

  useEffect(() => {
    if (prova) {
      setForm(toEditForm(prova));
      setEditing(false);
    }
  }, [prova]);

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
        consumo: toNum(form.consumo),
        peso: toNum(form.peso),
        qtd_odm: toNum(form.qtd_odm),
        mestre: form.mestre || null,
        horimetro: toNum(form.horimetro),
        porto: form.porto || null,
        vento_popa: form.vento_popa,
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
              ["Velocidade", prova.velocidade != null ? `${prova.velocidade} nós` : "—"],
              ["RPM", prova.rpm != null ? String(prova.rpm) : "—"],
              ["Consumo", prova.consumo != null ? `${prova.consumo} Lts/h` : "—"],
              ["Peso", prova.peso != null ? `${prova.peso} Kg` : "—"],
              ["Qtd ODM", prova.qtd_odm != null ? `${prova.qtd_odm} Lts` : "—"],
              ["Mestre", prova.mestre ?? "—"],
              ["Horímetro", prova.horimetro != null ? String(prova.horimetro) : "—"],
              ["Porto", prova.porto ?? "—"],
              ["Vento de popa", prova.vento_popa === true ? "Sim" : prova.vento_popa === false ? "Não" : "—"],
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

  const [filterLancha, setFilterLancha] = useState("__all__");
  const [filterDescricao, setFilterDescricao] = useState("__all__");
  const [filterDe, setFilterDe] = useState("");
  const [filterAte, setFilterAte] = useState("");
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState<ProvaMar | null>(null);

  const filtered = useMemo(() => {
    return (provas ?? []).filter((p) => {
      if (filterLancha !== "__all__" && p.lanchas?.nome !== filterLancha) return false;
      if (filterDescricao !== "__all__" && p.descricao !== filterDescricao) return false;
      if (filterDe && p.data < filterDe) return false;
      if (filterAte && p.data > filterAte) return false;
      return true;
    });
  }, [provas, filterLancha, filterDescricao, filterDe, filterAte]);

  useEffect(() => { setPage(1); }, [filterLancha, filterDescricao, filterDe, filterAte]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = filterLancha !== "__all__" || filterDescricao !== "__all__" || filterDe !== "" || filterAte !== "";

  function clearFilters() {
    setFilterLancha("__all__");
    setFilterDescricao("__all__");
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
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Lancha</span>
              <Select value={filterLancha} onValueChange={setFilterLancha}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(lanchas ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.nome}>{l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Descrição</span>
              <Select value={filterDescricao} onValueChange={setFilterDescricao}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {DESCRICOES_PROVA.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">De</span>
              <input
                type="date"
                value={filterDe}
                onChange={(e) => setFilterDe(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Até</span>
              <input
                type="date"
                value={filterAte}
                onChange={(e) => setFilterAte(e.target.value)}
                className={inputClass}
              />
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end">
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
                          onClick={() => setDetalhe(p)}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(p.data)}</TableCell>
                          <TableCell className={boatColorClass(lanchaNome)}>{lanchaNome}</TableCell>
                          <TableCell className="text-sm">{p.descricao}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.velocidade != null ? p.velocidade.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.rpm != null ? p.rpm.toLocaleString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.consumo != null ? `${p.consumo.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{p.porto ?? "—"}</TableCell>
                          <TableCell className="text-center"><BoolCell v={p.vento_popa} /></TableCell>
                          <TableCell className="text-center"><BoolCell v={p.mar_calmo} /></TableCell>
                          <TableCell className="text-sm">{p.mestre ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {p.horimetro != null ? p.horimetro.toLocaleString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="max-w-[180px]" onClick={(e) => e.stopPropagation()}>
                            <TruncCell text={p.observacao} limit={40} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setDetalhe(p)}
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

      <DetalheModal prova={detalhe} onClose={() => setDetalhe(null)} />
    </div>
  );
}
