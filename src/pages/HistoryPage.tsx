import { useState, useMemo, useEffect } from "react";
import { useManutencoes, useOcorrenciasWebpilot, OcorrenciaWebpilot } from "@/hooks/useFleetData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const typeLabels: Record<string, string> = {
  troca_oleo: "Troca de óleo",
  overhaul: "Overhaul",
  troca_posicao: "Troca de posição",
  revisao: "Revisão",
  revisao_rolamentos: "Revisão de rolamentos",
  revisao_geral: "Revisão geral",
  falha: "Falha",
  outro: "Outro",
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function boatColorClass(nome: string | null | undefined) {
  if (!nome) return "font-medium";
  const n = nome.toLowerCase();
  if (n.includes("flexeiras")) return "text-boat-flexeiras font-medium";
  if (n.includes("fortim")) return "text-boat-fortim font-medium";
  if (n.includes("taíba") || n.includes("taiba")) return "text-boat-taiba font-medium";
  return "font-medium";
}

function EfeitoBadge({ efeito }: { efeito: string | null }) {
  if (!efeito) return null;
  if (efeito === "Inoperante")
    return <Badge className="bg-status-danger/10 text-status-danger border border-status-danger/30 hover:bg-status-danger/10">{efeito}</Badge>;
  if (efeito === "Operante com Restrições")
    return <Badge className="bg-status-warn/10 text-status-warn border border-status-warn/30 hover:bg-status-warn/10">{efeito}</Badge>;
  if (efeito === "Operante")
    return <Badge className="bg-status-ok/10 text-status-ok border border-status-ok/30 hover:bg-status-ok/10">{efeito}</Badge>;
  return <Badge variant="secondary">{efeito}</Badge>;
}

const inputClass =
  "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function HistoryPage() {
  const { data, isLoading } = useManutencoes();
  const { data: ocorrencias, isLoading: loadingOcorrencias } = useOcorrenciasWebpilot();

  const [filterLancha, setFilterLancha] = useState("__all__");
  const [filterTipo, setFilterTipo] = useState("__all__");
  const [filterEfeito, setFilterEfeito] = useState("__all__");
  const [filterDe, setFilterDe] = useState("");
  const [filterAte, setFilterAte] = useState("");
  const [page, setPage] = useState(1);

  const tiposUnicos = useMemo(() => {
    const set = new Set<string>();
    (ocorrencias ?? []).forEach((o) => { if (o.tipo_ocorrencia) set.add(o.tipo_ocorrencia); });
    return Array.from(set).sort();
  }, [ocorrencias]);

  const filtered = useMemo(() => {
    return (ocorrencias ?? []).filter((o) => {
      if (filterLancha !== "__all__" && (o.lanchas as any)?.nome !== filterLancha) return false;
      if (filterTipo !== "__all__" && o.tipo_ocorrencia !== filterTipo) return false;
      if (filterEfeito !== "__all__" && o.efeito !== filterEfeito) return false;
      if (filterDe && o.data_inicio.slice(0, 10) < filterDe) return false;
      if (filterAte && o.data_inicio.slice(0, 10) > filterAte) return false;
      return true;
    });
  }, [ocorrencias, filterLancha, filterTipo, filterEfeito, filterDe, filterAte]);

  useEffect(() => { setPage(1); }, [filterLancha, filterTipo, filterEfeito, filterDe, filterAte]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = filterLancha !== "__all__" || filterTipo !== "__all__" || filterEfeito !== "__all__" || filterDe !== "" || filterAte !== "";

  function clearFilters() {
    setFilterLancha("__all__");
    setFilterTipo("__all__");
    setFilterEfeito("__all__");
    setFilterDe("");
    setFilterAte("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Manutenções</h1>
        <p className="text-sm text-accent">Log completo de eventos da frota</p>
      </div>

      <Tabs defaultValue="manutencoes">
        <TabsList>
          <TabsTrigger value="manutencoes">Manutenções</TabsTrigger>
          <TabsTrigger value="ocorrencias">Ocorrências Operacionais</TabsTrigger>
        </TabsList>

        {/* ── ABA 1: Manutenções (conteúdo original intacto) ── */}
        <TabsContent value="manutencoes">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Lancha</TableHead>
                        <TableHead>Posição</TableHead>
                        <TableHead>Ativo</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Horímetro</TableHead>
                        <TableHead>Observação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data ?? []).map((r: any) => {
                        const extras = r.dados_extras ?? {};
                        const hLancha = extras.horimetro_lancha ?? extras.horimetro;
                        const hEquip = extras.horimetro_equipamento;
                        return (
                          <TableRow key={r.id}>
                            <TableCell>{r.data_evento ? new Date(r.data_evento).toLocaleDateString("pt-BR") : "—"}</TableCell>
                            <TableCell className="font-medium">{r.lancha?.nome ?? "—"}</TableCell>
                            <TableCell>{r.ativo?.posicao ?? "—"}</TableCell>
                            <TableCell>{r.ativo?.nome ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{typeLabels[r.tipo_evento] ?? r.tipo_evento}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {hLancha != null ? `${Number(hLancha).toLocaleString("pt-BR")}h (lancha) ` : ""}
                              {hEquip != null ? `${Number(hEquip).toLocaleString("pt-BR")}h (equip)` : ""}
                              {hLancha == null && hEquip == null ? "—" : ""}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.descricao ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {(data ?? []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            Nenhuma manutenção registrada
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA 2: Ocorrências Operacionais ── */}
        <TabsContent value="ocorrencias" className="space-y-4">

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
                      <SelectItem value="Flexeiras">Flexeiras</SelectItem>
                      <SelectItem value="Fortim">Fortim</SelectItem>
                      <SelectItem value="Taíba">Taíba</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <Select value={filterTipo} onValueChange={setFilterTipo}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {tiposUnicos.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Efeito</span>
                  <Select value={filterEfeito} onValueChange={setFilterEfeito}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="Inoperante">Inoperante</SelectItem>
                      <SelectItem value="Operante com Restrições">Operante com Restrições</SelectItem>
                      <SelectItem value="Operante">Operante</SelectItem>
                      <SelectItem value="Não Altera">Não Altera</SelectItem>
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
              {loadingOcorrencias ? (
                <p className="text-muted-foreground">Carregando ocorrências...</p>
              ) : (
                <>
                  {/* Contador + paginação topo */}
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
                          <TableHead className="whitespace-nowrap">Início</TableHead>
                          <TableHead className="whitespace-nowrap">Fim</TableHead>
                          <TableHead>Duração</TableHead>
                          <TableHead>Lancha</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Efeito</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginated.map((o) => {
                          const lanchaNome = (o.lanchas as any)?.nome ?? "—";
                          const descFull = o.descricao ?? "";
                          const descTrunc = descFull.length > 80 ? descFull.slice(0, 80) + "…" : descFull;
                          return (
                            <TableRow key={o.id}>
                              <TableCell className="font-mono text-xs whitespace-nowrap">
                                {fmtDateTime(o.data_inicio)}
                              </TableCell>
                              <TableCell className="font-mono text-xs whitespace-nowrap">
                                {fmtDateTime(o.data_fim)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {o.duracao_horas != null
                                  ? `${o.duracao_horas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`
                                  : "—"}
                              </TableCell>
                              <TableCell className={boatColorClass(lanchaNome)}>
                                {lanchaNome}
                              </TableCell>
                              <TableCell className="text-sm">{o.tipo_ocorrencia ?? "—"}</TableCell>
                              <TableCell className="text-sm max-w-[260px]">
                                {descFull.length > 80 ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help text-muted-foreground">{descTrunc}</span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-sm whitespace-pre-wrap">{descFull}</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground">{descFull || "—"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <EfeitoBadge efeito={o.efeito} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {paginated.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Nenhuma ocorrência encontrada para os filtros selecionados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Paginação rodapé */}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
