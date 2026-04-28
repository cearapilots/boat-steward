import { useMemo, useState } from "react";
import { useHistoricoCompleto, HistoricoCompletoRow } from "@/hooks/useFleetData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wrench, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const boatColorPalette = [
  "bg-boat-flexeiras",
  "bg-boat-fortim",
  "bg-boat-taiba",
  "bg-boat-reserva",
  "bg-primary",
  "bg-accent",
];
function colorForBoat(name: string | null) {
  if (!name) return "bg-muted";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return boatColorPalette[h % boatColorPalette.length];
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function efeitoBadge(efeito: string | null) {
  if (!efeito) return null;
  const e = efeito.toLowerCase();
  let cls = "bg-muted text-muted-foreground";
  if (e === "inoperante") cls = "bg-red-500 text-white";
  else if (e === "operante") cls = "bg-green-600 text-white";
  else if (e.includes("restri")) cls = "bg-yellow-500 text-black";
  else if (e.includes("não altera") || e.includes("nao altera")) cls = "bg-gray-400 text-white";
  return <Badge className={cn("border-transparent", cls)}>{efeito}</Badge>;
}

function truncate(s: string | null, n: number) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function HistoryPage() {
  const { data, isLoading } = useHistoricoCompleto();

  const [fLancha, setFLancha] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fEfeito, setFEfeito] = useState("all");
  const [fFonte, setFFonte] = useState("all");
  const [fDataIni, setFDataIni] = useState("");
  const [fDataFim, setFDataFim] = useState("");
  const [page, setPage] = useState(1);

  const all = data ?? [];

  const tiposUnicos = useMemo(() => {
    const s = new Set<string>();
    all.forEach((r) => r.tipo && s.add(r.tipo));
    return Array.from(s).sort();
  }, [all]);

  const lanchasUnicas = useMemo(() => {
    const s = new Set<string>();
    all.forEach((r) => r.lancha_nome && s.add(r.lancha_nome));
    return Array.from(s).sort();
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((r) => {
      if (fLancha !== "all" && r.lancha_nome !== fLancha) return false;
      if (fTipo !== "all" && r.tipo !== fTipo) return false;
      if (fEfeito !== "all" && (r.efeito ?? "") !== fEfeito) return false;
      if (fFonte !== "all" && r.fonte !== fFonte) return false;
      if (fDataIni) {
        if (!r.data_inicio || new Date(r.data_inicio) < new Date(fDataIni)) return false;
      }
      if (fDataFim) {
        if (!r.data_inicio || new Date(r.data_inicio) > new Date(fDataFim + "T23:59:59")) return false;
      }
      return true;
    });
  }, [all, fLancha, fTipo, fEfeito, fFonte, fDataIni, fDataFim]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const clearFilters = () => {
    setFLancha("all"); setFTipo("all"); setFEfeito("all"); setFFonte("all");
    setFDataIni(""); setFDataFim(""); setPage(1);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Manutenções</h1>
          <p className="text-sm text-accent">Log completo de eventos da frota</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Lancha</label>
                <Select value={fLancha} onValueChange={(v) => { setFLancha(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {lanchasUnicas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select value={fTipo} onValueChange={(v) => { setFTipo(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {tiposUnicos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Efeito</label>
                <Select value={fEfeito} onValueChange={(v) => { setFEfeito(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Inoperante">Inoperante</SelectItem>
                    <SelectItem value="Operante">Operante</SelectItem>
                    <SelectItem value="Operante com Restrições">Operante com Restrições</SelectItem>
                    <SelectItem value="Não Altera">Não Altera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fonte</label>
                <Select value={fFonte} onValueChange={(v) => { setFFonte(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="historico">Manutenções</SelectItem>
                    <SelectItem value="webpilot">Ocorrências WebPilot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Data início</label>
                <Input type="date" value={fDataIni} onChange={(e) => { setFDataIni(e.target.value); setPage(1); }} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Data fim</label>
                <Input type="date" value={fDataFim} onChange={(e) => { setFDataFim(e.target.value); setPage(1); }} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Exibindo <span className="font-semibold text-foreground">{filtered.length}</span> de{" "}
                <span className="font-semibold text-foreground">{all.length}</span> registros
              </p>
              <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>
            </div>

            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lancha</TableHead>
                      <TableHead>Equipamento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead className="text-right">Duração</TableHead>
                      <TableHead>Efeito</TableHead>
                      <TableHead className="text-center">Fonte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.lancha_nome ? (
                            <div className="flex items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full", colorForBoat(r.lancha_nome))} />
                              <span className="font-medium">{r.lancha_nome}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{r.ativo_nome ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary">{r.tipo}</Badge></TableCell>
                        <TableCell className="max-w-[300px]">
                          {r.descricao ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm cursor-help">{truncate(r.descricao, 80)}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md"><p className="text-xs">{r.descricao}</p></TooltipContent>
                            </Tooltip>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(r.data_inicio)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(r.data_fim)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.duracao_horas != null ? `${Math.round(Number(r.duracao_horas))}h` : "—"}
                        </TableCell>
                        <TableCell>{efeitoBadge(r.efeito)}</TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                {r.fonte === "webpilot"
                                  ? <Globe className="h-4 w-4 text-accent" />
                                  : <Wrench className="h-4 w-4 text-muted-foreground" />}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">
                                {r.fonte === "webpilot" ? "Ocorrência sincronizada do WebPilot" : "Manutenção registrada manualmente"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {paged.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Paginação */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Página {pageSafe} de {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próximo</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
