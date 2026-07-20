import { useState, useMemo, useEffect } from "react";
import { useManutencoes, useOcorrenciasWebpilot } from "@/hooks/useFleetData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, ChevronDown } from "lucide-react";
import { HistoricoDetalheModal } from "@/components/HistoricoDetalheModal";

const PAGE_SIZE = 50;

const typeLabels: Record<string, string> = {
  troca_oleo:          "Troca de óleo",
  overhaul:            "Overhaul",
  troca_posicao:       "Troca de posição",
  revisao:             "Revisão",
  revisao_rolamentos:  "Revisão de rolamentos",
  revisao_geral:       "Revisão geral",
  falha:               "Falha",
  outro:               "Outro",
};

const LANCHAS_OC = ["Flexeiras", "Fortim", "Taíba"];
const EFEITOS    = ["Inoperante", "Operante com Restrições", "Operante", "Não Altera"];

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
  if (n.includes("fortim"))    return "text-boat-fortim font-medium";
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

// ── Popover multi-select genérico ─────────────────────────────────────────────
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  minWidth = 140,
  popoverWidth = 52,
}: {
  label: string;
  options: { value: string; label?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  minWidth?: number;
  popoverWidth?: number;
}) {
  const displayLabel =
    selected.length === 0 ? "Todos"
    : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} selecionados`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          style={{ minWidth }}
        >
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground text-xs flex-1 text-right truncate">{displayLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-2" align="start" style={{ width: popoverWidth * 4 }}>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
              <span className="text-sm">{o.label ?? o.value}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { data, isLoading }                          = useManutencoes();
  const { data: ocorrencias, isLoading: loadingOc } = useOcorrenciasWebpilot();

  // ── Estado filtros — Ocorrências ──────────────────────────────────────────
  const [ocLanchas,   setOcLanchas]   = useState<string[]>([]);
  const [ocTipos,     setOcTipos]     = useState<string[]>([]);
  const [ocEfeitos,   setOcEfeitos]   = useState<string[]>([]);
  const [ocDe,        setOcDe]        = useState("");
  const [ocAte,       setOcAte]       = useState("");
  const [ocPage,      setOcPage]      = useState(1);

  // ── Estado filtros — Manutenções ──────────────────────────────────────────
  const [mLanchas,    setMLanchas]    = useState<string[]>([]);
  const [mTipos,      setMTipos]      = useState<string[]>([]);
  const [mDe,         setMDe]         = useState("");
  const [mAte,        setMAte]        = useState("");
  const [mPage,       setMPage]       = useState(1);

  const [detalhe, setDetalhe] = useState<{ mode: "historico" | "ocorrencia"; record: any } | null>(null);

  // ── Opções dinâmicas — Ocorrências ───────────────────────────────────────
  const tiposOcOptions = useMemo(() => {
    const s = new Set<string>();
    (ocorrencias ?? []).forEach(o => { if (o.tipo_ocorrencia) s.add(o.tipo_ocorrencia); });
    return [...s].sort().map(v => ({ value: v }));
  }, [ocorrencias]);

  // ── Opções dinâmicas — Manutenções ───────────────────────────────────────
  const lanchaMOptions = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r: any) => { if (r.lancha?.nome) s.add(r.lancha.nome); });
    return [...s].sort().map(v => ({ value: v }));
  }, [data]);

  const tipoMOptions = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r: any) => { if (r.tipo_evento) s.add(r.tipo_evento); });
    return [...s].sort().map(v => ({ value: v, label: typeLabels[v] ?? v }));
  }, [data]);

  // ── Filtered — Ocorrências ────────────────────────────────────────────────
  const filteredOc = useMemo(() => {
    return (ocorrencias ?? []).filter(o => {
      const nome = (o.lanchas as any)?.nome ?? "";
      if (ocLanchas.length  > 0 && !ocLanchas.includes(nome))              return false;
      if (ocTipos.length    > 0 && !ocTipos.includes(o.tipo_ocorrencia))   return false;
      if (ocEfeitos.length  > 0 && !ocEfeitos.includes(o.efeito))          return false;
      if (ocDe  && o.data_inicio.slice(0, 10) < ocDe)                      return false;
      if (ocAte && o.data_inicio.slice(0, 10) > ocAte)                     return false;
      return true;
    });
  }, [ocorrencias, ocLanchas, ocTipos, ocEfeitos, ocDe, ocAte]);

  // ── Filtered — Manutenções ────────────────────────────────────────────────
  const filteredM = useMemo(() => {
    return (data ?? []).filter((r: any) => {
      if (mLanchas.length > 0 && !mLanchas.includes(r.lancha?.nome ?? ""))  return false;
      if (mTipos.length   > 0 && !mTipos.includes(r.tipo_evento ?? ""))     return false;
      const d = (r.data_evento ?? "").slice(0, 10);
      if (mDe  && d < mDe)  return false;
      if (mAte && d > mAte) return false;
      return true;
    });
  }, [data, mLanchas, mTipos, mDe, mAte]);

  useEffect(() => { setOcPage(1); }, [ocLanchas, ocTipos, ocEfeitos, ocDe, ocAte]);
  useEffect(() => { setMPage(1); },  [mLanchas, mTipos, mDe, mAte]);

  // ── Paginação — Ocorrências ───────────────────────────────────────────────
  const ocTotalPages = Math.max(1, Math.ceil(filteredOc.length / PAGE_SIZE));
  const ocPaginated  = filteredOc.slice((ocPage - 1) * PAGE_SIZE, ocPage * PAGE_SIZE);
  const hasOcFilters = ocLanchas.length > 0 || ocTipos.length > 0 || ocEfeitos.length > 0 || ocDe !== "" || ocAte !== "";

  function clearOcFilters() { setOcLanchas([]); setOcTipos([]); setOcEfeitos([]); setOcDe(""); setOcAte(""); }

  // ── Paginação — Manutenções ───────────────────────────────────────────────
  const mTotalPages = Math.max(1, Math.ceil(filteredM.length / PAGE_SIZE));
  const mPaginated  = filteredM.slice((mPage - 1) * PAGE_SIZE, mPage * PAGE_SIZE);
  const hasMFilters = mLanchas.length > 0 || mTipos.length > 0 || mDe !== "" || mAte !== "";

  function clearMFilters() { setMLanchas([]); setMTipos([]); setMDe(""); setMAte(""); }

  // ── Helpers toggle ────────────────────────────────────────────────────────
  function tog(setter: React.Dispatch<React.SetStateAction<string[]>>) {
    return (v: string) => setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
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

        {/* ── ABA 1: Manutenções ── */}
        <TabsContent value="manutencoes" className="space-y-4">

          {/* Filtros */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-center">

                <MultiSelect
                  label="Lancha"
                  options={lanchaMOptions}
                  selected={mLanchas}
                  onToggle={tog(setMLanchas)}
                  minWidth={140}
                  popoverWidth={48}
                />

                <MultiSelect
                  label="Tipo"
                  options={tipoMOptions}
                  selected={mTipos}
                  onToggle={tog(setMTipos)}
                  minWidth={150}
                  popoverWidth={56}
                />

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">De</span>
                  <input type="date" value={mDe} onChange={e => setMDe(e.target.value)} className={inputClass} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Até</span>
                  <input type="date" value={mAte} onChange={e => setMAte(e.target.value)} className={inputClass} />
                </div>

                {hasMFilters && (
                  <Button variant="ghost" size="sm" onClick={clearMFilters}>Limpar filtros</Button>
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
                      Exibindo {mPaginated.length} de {filteredM.length} registros
                    </p>
                    {mTotalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={mPage === 1} onClick={() => setMPage(p => p - 1)}>
                          Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">Página {mPage} de {mTotalPages}</span>
                        <Button variant="outline" size="sm" disabled={mPage === mTotalPages} onClick={() => setMPage(p => p + 1)}>
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
                          <TableHead>Posição</TableHead>
                          <TableHead>Ativo</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Horímetro</TableHead>
                          <TableHead>Observação</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mPaginated.map((r: any) => {
                          const extras = r.dados_extras ?? {};
                          // Gerador tem contador próprio: h_lancha e h_equip são o mesmo
                          // número, então exibimos apenas o do equipamento.
                          const isGerador = r.ativo?.tipo === "gerador";
                          const hLancha = isGerador ? null : (extras.horimetro_lancha ?? extras.horimetro);
                          const hEquip  = isGerador
                            ? (extras.horimetro_equipamento ?? extras.horimetro_lancha ?? extras.horimetro)
                            : extras.horimetro_equipamento;
                          return (
                            <TableRow key={r.id}>
                              <TableCell>{r.data_evento ? r.data_evento.slice(0, 10).split("-").reverse().join("/") : "—"}</TableCell>
                              <TableCell className={boatColorClass(r.lancha?.nome)}>{r.lancha?.nome ?? "—"}</TableCell>
                              <TableCell>{r.ativo?.posicao ?? "—"}</TableCell>
                              <TableCell>{r.ativo?.nome ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{typeLabels[r.tipo_evento] ?? r.tipo_evento}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {hLancha != null ? `${Number(hLancha).toLocaleString("pt-BR")}h (lancha) ` : ""}
                                {hEquip  != null ? `${Number(hEquip).toLocaleString("pt-BR")}h (equip)` : ""}
                                {hLancha == null && hEquip == null ? "—" : ""}
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px]">
                                {(r.descricao ?? "").length > 50 ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help text-muted-foreground">{r.descricao.slice(0, 50) + "…"}</span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-sm whitespace-pre-wrap">{r.descricao}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className="text-muted-foreground">{r.descricao ?? "—"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver / editar"
                                  onClick={() => setDetalhe({ mode: "historico", record: r })}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {mPaginated.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              Nenhuma manutenção encontrada para os filtros selecionados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {mTotalPages > 1 && (
                    <div className="flex items-center justify-end gap-2 mt-4">
                      <Button variant="outline" size="sm" disabled={mPage === 1} onClick={() => setMPage(p => p - 1)}>
                        Anterior
                      </Button>
                      <span className="text-sm text-muted-foreground">Página {mPage} de {mTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={mPage === mTotalPages} onClick={() => setMPage(p => p + 1)}>
                        Próximo
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ABA 2: Ocorrências Operacionais ── */}
        <TabsContent value="ocorrencias" className="space-y-4">

          {/* Filtros */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-3 items-center">

                <MultiSelect
                  label="Lancha"
                  options={LANCHAS_OC.map(v => ({ value: v }))}
                  selected={ocLanchas}
                  onToggle={tog(setOcLanchas)}
                  minWidth={140}
                  popoverWidth={48}
                />

                <MultiSelect
                  label="Tipo"
                  options={tiposOcOptions}
                  selected={ocTipos}
                  onToggle={tog(setOcTipos)}
                  minWidth={150}
                  popoverWidth={68}
                />

                <MultiSelect
                  label="Efeito"
                  options={EFEITOS.map(v => ({ value: v }))}
                  selected={ocEfeitos}
                  onToggle={tog(setOcEfeitos)}
                  minWidth={145}
                  popoverWidth={60}
                />

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">De</span>
                  <input type="date" value={ocDe} onChange={e => setOcDe(e.target.value)} className={inputClass} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Até</span>
                  <input type="date" value={ocAte} onChange={e => setOcAte(e.target.value)} className={inputClass} />
                </div>

                {hasOcFilters && (
                  <Button variant="ghost" size="sm" onClick={clearOcFilters}>Limpar filtros</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          <Card>
            <CardContent className="pt-4">
              {loadingOc ? (
                <p className="text-muted-foreground">Carregando ocorrências...</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">
                      Exibindo {ocPaginated.length} de {filteredOc.length} registros
                    </p>
                    {ocTotalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={ocPage === 1} onClick={() => setOcPage(p => p - 1)}>
                          Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">Página {ocPage} de {ocTotalPages}</span>
                        <Button variant="outline" size="sm" disabled={ocPage === ocTotalPages} onClick={() => setOcPage(p => p + 1)}>
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
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ocPaginated.map((o) => {
                          const lanchaNome = (o.lanchas as any)?.nome ?? "—";
                          const descFull   = o.descricao ?? "";
                          return (
                            <TableRow key={o.id}>
                              <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDateTime(o.data_inicio)}</TableCell>
                              <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDateTime(o.data_fim)}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {o.duracao_horas != null
                                  ? `${o.duracao_horas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`
                                  : "—"}
                              </TableCell>
                              <TableCell className={boatColorClass(lanchaNome)}>{lanchaNome}</TableCell>
                              <TableCell className="text-sm">{o.tipo_ocorrencia ?? "—"}</TableCell>
                              <TableCell className="text-sm max-w-[260px]">
                                {descFull.length > 60 ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-help text-muted-foreground">{descFull.slice(0, 60) + "…"}</span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-sm whitespace-pre-wrap">{descFull}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className="text-muted-foreground">{descFull || "—"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <EfeitoBadge efeito={o.efeito} />
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver / editar"
                                  onClick={() => setDetalhe({ mode: "ocorrencia", record: o })}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {ocPaginated.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              Nenhuma ocorrência encontrada para os filtros selecionados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {ocTotalPages > 1 && (
                    <div className="flex items-center justify-end gap-2 mt-4">
                      <Button variant="outline" size="sm" disabled={ocPage === 1} onClick={() => setOcPage(p => p - 1)}>
                        Anterior
                      </Button>
                      <span className="text-sm text-muted-foreground">Página {ocPage} de {ocTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={ocPage === ocTotalPages} onClick={() => setOcPage(p => p + 1)}>
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

      <HistoricoDetalheModal
        open={detalhe !== null}
        onOpenChange={(v) => { if (!v) setDetalhe(null); }}
        mode={detalhe?.mode ?? "historico"}
        record={detalhe?.record ?? null}
      />
    </div>
  );
}
