/* Fleet Dashboard - layout híbrido (KPIs + urgências + cards compactos) */
import { useMemo, useState } from "react";
import { useSituacaoAtual, SituacaoRow, useManutencoesPeriodicas, ManutencaoPeriodicaStatus } from "@/hooks/useFleetData";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { PeriodicMaintenanceModal } from "@/components/PeriodicMaintenanceModal";
import { AtivoDetalhesModal } from "@/components/AtivoDetalhesModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/StatusIndicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RefreshCw,
  Clock,
  Wrench,
  CalendarCheck,
  AlertTriangle,
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- helpers ---------- */

const borderPalette = [
  "border-t-boat-flexeiras",
  "border-t-boat-fortim",
  "border-t-boat-taiba",
  "border-t-boat-reserva",
  "border-t-primary",
  "border-t-accent",
];
function borderForBoat(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return borderPalette[h % borderPalette.length];
}

function statusFromSemaforo(s: string): "ok" | "warn" | "danger" {
  if (s === "vermelho") return "danger";
  if (s === "amarelo") return "warn";
  return "ok";
}

function periodicStatusLevel(s: ManutencaoPeriodicaStatus["status_semaforo"]) {
  if (s === "vencido" || s === "critico") return "danger" as const;
  if (s === "atencao") return "warn" as const;
  if (s === "ok") return "ok" as const;
  return null;
}

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}

function fmtDateBR(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

function abbrevManutencao(nome: string): string {
  const map: Array<[RegExp, string]> = [
    [/limpeza\s*\/?\s*manuten[çc][aã]o\s+(do\s+)?ar[-\s]?condicionado/i, "Limpeza ar-cond."],
    [/regulagem\s+de\s+v[aá]lvulas?\s+dos?\s+motores?/i, "Reg. válvulas motores"],
    [/regulagem\s+de\s+v[aá]lvulas?/i, "Reg. válvulas"],
    [/limpeza\s+(dos?\s+)?after[-\s]?coolers?/i, "Limpeza after cooler"],
    [/troca\s+de\s+([oó]leo\s+)?(do\s+)?reversor/i, "Troca óleo reversor"],
    [/troca\s+de\s+([oó]leo\s+)?(do\s+)?gerador/i, "Troca óleo gerador"],
    [/troca\s+de\s+([oó]leo\s+)?motor/i, "Troca óleo motor"],
    [/troca\s+de\s+filtros?\s+de\s+combust[ií]vel/i, "Troca filtro comb."],
    [/troca\s+de\s+filtros?/i, "Troca filtros"],
  ];
  for (const [re, repl] of map) if (re.test(nome)) return repl;
  return nome.replace(/inspe[çc][aã]o/i, "Insp.");
}

const fmtRestanteH = (v: number | null) =>
  v == null ? "—" : v >= 0 ? `${v.toLocaleString("pt-BR")}h` : `${Math.abs(v).toLocaleString("pt-BR")}h atrás`;

/* ---------- KPI card ---------- */
function KpiCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof AlertOctagon;
  value: number;
  label: string;
  tone: "danger" | "warn" | "orange" | "ok";
}) {
  const styles: Record<typeof tone, string> = {
    danger: "bg-status-danger-bg border-status-danger/30 text-status-danger",
    warn: "bg-status-warn-bg border-status-warn/30 text-status-warn",
    orange: "bg-orange-50 border-orange-300/40 text-orange-600 dark:bg-orange-950/30",
    ok: "bg-status-ok-bg border-status-ok/30 text-status-ok",
  } as const;
  return (
    <Card className={cn("border", styles[tone])}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={cn("p-2 rounded-lg bg-background/60")}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="text-3xl font-bold leading-none text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Tipos da lista de urgências ---------- */
type UrgencyItem =
  | {
      kind: "equip";
      key: string;
      lancha_id: string;
      lancha_nome: string;
      titulo: string;
      tipo: string;
      level: "danger" | "warn";
      urgenciaLabel: string;
      sortKey: number; // menor = mais urgente
      row: SituacaoRow;
    }
  | {
      kind: "periodic";
      key: string;
      lancha_id: string;
      lancha_nome: string;
      titulo: string;
      tipo: string;
      level: "danger" | "warn";
      urgenciaLabel: string;
      sortKey: number;
      row: ManutencaoPeriodicaStatus;
    };

/* ===================== Dashboard ===================== */
export default function Dashboard() {
  const { data: rows, isLoading, refetch, isFetching } = useSituacaoAtual();
  const { data: periodicas } = useManutencoesPeriodicas();
  const [modal, setModal] = useState<{ open: boolean; row: SituacaoRow | null }>({ open: false, row: null });
  const [periodicModal, setPeriodicModal] = useState<{ open: boolean; row: ManutencaoPeriodicaStatus | null }>({ open: false, row: null });
  const [detalhesModal, setDetalhesModal] = useState<{ open: boolean; row: SituacaoRow | null }>({ open: false, row: null });
  const [expanded, setExpanded] = useState<Record<string, { equip: boolean; periodic: boolean }>>({});
  const [showAllUrgent, setShowAllUrgent] = useState(false);

  const isReserva = (nome: string) => /reserva|retifica|retífica/i.test(nome ?? "");

  /* --- agrupa por lancha --- */
  const grouped = useMemo(() => {
    const map = new Map<string, { lanchaId: string; nome: string; horimetro: number; horimetroGerador: number; ultima: string; itens: SituacaoRow[] }>();
    (rows ?? []).forEach((r) => {
      if (isReserva(r.lancha_nome)) return;
      if (!map.has(r.lancha_id)) {
        map.set(r.lancha_id, {
          lanchaId: r.lancha_id,
          nome: r.lancha_nome,
          horimetro: r.lancha_horimetro,
          horimetroGerador: r.lancha_horimetro_gerador,
          ultima: r.ultima_atualizacao,
          itens: [],
        });
      }
      map.get(r.lancha_id)!.itens.push(r);
    });
    return Array.from(map.values());
  }, [rows]);

  const periodicasByLancha = useMemo(() => {
    const map = new Map<string, ManutencaoPeriodicaStatus[]>();
    (periodicas ?? []).forEach((p) => {
      if (!map.has(p.lancha_id)) map.set(p.lancha_id, []);
      map.get(p.lancha_id)!.push(p);
    });
    return map;
  }, [periodicas]);

  /* --- KPIs --- */
  const kpis = useMemo(() => {
    const equipsAtivos = (rows ?? []).filter((r) => !isReserva(r.lancha_nome));
    let criticos = 0, atencao = 0, ok = 0;
    equipsAtivos.forEach((r) => {
      const isDanger = r.status_semaforo === "vermelho" || r.status_overhaul === "vermelho";
      const isWarn = r.status_semaforo === "amarelo";
      if (isDanger) criticos++;
      else if (isWarn) atencao++;
      else ok++;
    });
    const vencendo = (periodicas ?? []).filter(
      (p) => p.dias_restantes != null && p.dias_restantes <= 30,
    ).length;
    return { criticos, atencao, vencendo, ok };
  }, [rows, periodicas]);

  /* --- lista global de urgências --- */
  const urgentItems = useMemo<UrgencyItem[]>(() => {
    const items: UrgencyItem[] = [];

    (rows ?? []).forEach((r) => {
      if (isReserva(r.lancha_nome)) return;
      const isDanger = r.status_semaforo === "vermelho" || r.status_overhaul === "vermelho";
      const isWarn = r.status_semaforo === "amarelo";
      if (!isDanger && !isWarn) return;

      // pega o pior entre troca e overhaul
      const restantes = r.horas_restantes_troca == null ? null : Number(r.horas_restantes_troca);
      const restantesOh = r.horas_restantes_overhaul == null ? null : Number(r.horas_restantes_overhaul);
      const ohIsDanger = r.status_overhaul === "vermelho";
      const useOverhaul = ohIsDanger && (restantesOh != null) && (restantes == null || restantesOh < restantes);
      const valor = useOverhaul ? restantesOh : restantes;
      const tipo = useOverhaul ? "Overhaul" : "Troca óleo";
      const urg = valor == null ? "—" : valor < 0 ? `Vencido ${Math.abs(valor).toLocaleString("pt-BR")}h` : `${valor.toLocaleString("pt-BR")}h restantes`;

      items.push({
        kind: "equip",
        key: `e-${r.ativo_id}-${tipo}`,
        lancha_id: r.lancha_id,
        lancha_nome: r.lancha_nome,
        titulo: `${r.ativo_nome}${r.posicao ? ` (${r.posicao})` : ""}`,
        tipo,
        level: isDanger ? "danger" : "warn",
        urgenciaLabel: urg,
        sortKey: valor == null ? 999999 : valor,
        row: r,
      });
    });

    (periodicas ?? []).forEach((p) => {
      const lvl = periodicStatusLevel(p.status_semaforo);
      if (lvl !== "danger" && lvl !== "warn") return;
      const dias = p.dias_restantes;
      // só inclui se vencido ou <=30d
      if (dias == null || dias > 30) return;

      const urg =
        dias < 0
          ? `Vencido ${Math.abs(dias)}d atrás`
          : dias === 0
            ? "Vence hoje"
            : `${dias}d restantes`;

      items.push({
        kind: "periodic",
        key: `p-${p.lancha_id}-${p.tipo_id}`,
        lancha_id: p.lancha_id,
        lancha_nome: p.lancha_nome,
        titulo: p.tipo_nome,
        tipo: "Periódica",
        level: lvl,
        urgenciaLabel: urg,
        sortKey: dias,
        row: p,
      });
    });

    // ordena: vencidos primeiro (sortKey negativo), depois menor valor
    return items.sort((a, b) => a.sortKey - b.sortKey);
  }, [rows, periodicas]);

  const visibleUrgent = showAllUrgent ? urgentItems : urgentItems.slice(0, 8);

  /* --- handlers --- */
  const toggleExpand = (lanchaId: string, kind: "equip" | "periodic") => {
    setExpanded((prev) => ({
      ...prev,
      [lanchaId]: {
        equip: kind === "equip" ? !(prev[lanchaId]?.equip ?? false) : (prev[lanchaId]?.equip ?? false),
        periodic: kind === "periodic" ? !(prev[lanchaId]?.periodic ?? false) : (prev[lanchaId]?.periodic ?? false),
      },
    }));
  };

  const openUrgentAction = (it: UrgencyItem) => {
    if (it.kind === "equip") setModal({ open: true, row: it.row });
    else setPeriodicModal({ open: true, row: it.row });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-accent">Visão geral da frota</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => { refetch(); toast.success("Atualizando..."); }} disabled={isFetching} size="sm">
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={AlertOctagon} value={kpis.criticos} label="Críticos" tone="danger" />
        <KpiCard icon={AlertTriangle} value={kpis.atencao} label="Atenção" tone="warn" />
        <KpiCard icon={CalendarClock} value={kpis.vencendo} label="Manutenções vencendo (30d)" tone="orange" />
        <KpiCard icon={CheckCircle2} value={kpis.ok} label="OK" tone="ok" />
      </div>

      {/* ===== Painel de urgências ===== */}
      {urgentItems.length > 0 && (
        <Card className="mb-6 border-l-4 border-l-status-danger">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-status-danger" />
                Precisa de ação agora
                <span className="text-sm font-normal text-muted-foreground">({urgentItems.length})</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="hidden md:grid grid-cols-[24px_1fr_140px_110px_180px_40px] gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground border-b">
              <span></span>
              <span>Item</span>
              <span>Lancha</span>
              <span>Tipo</span>
              <span className="text-right">Urgência</span>
              <span></span>
            </div>
            <div className="divide-y">
              {visibleUrgent.map((it) => (
                <div
                  key={it.key}
                  className="grid grid-cols-[24px_1fr_110px_40px] md:grid-cols-[24px_1fr_140px_110px_180px_40px] gap-3 px-3 py-2.5 items-center hover:bg-secondary/40 text-sm"
                >
                  <StatusIndicator status={it.level} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.titulo}</div>
                    <div className="md:hidden text-xs text-muted-foreground truncate">
                      {it.lancha_nome} • {it.tipo}
                    </div>
                  </div>
                  <span className="hidden md:inline text-xs font-semibold truncate">{it.lancha_nome}</span>
                  <span className="hidden md:inline text-xs text-muted-foreground">{it.tipo}</span>
                  <span
                    className={cn(
                      "hidden md:inline text-right text-xs font-mono font-semibold",
                      it.level === "danger" ? "text-status-danger" : "text-status-warn",
                    )}
                  >
                    {it.urgenciaLabel}
                  </span>
                  <span
                    className={cn(
                      "md:hidden text-right text-xs font-mono font-semibold",
                      it.level === "danger" ? "text-status-danger" : "text-status-warn",
                    )}
                  >
                    {it.urgenciaLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={it.kind === "equip" ? "Registrar manutenção" : "Registrar manutenção periódica"}
                    onClick={() => openUrgentAction(it)}
                  >
                    {it.kind === "equip" ? (
                      <Wrench className="h-3.5 w-3.5" />
                    ) : (
                      <CalendarCheck className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
            {urgentItems.length > 8 && (
              <div className="pt-3 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAllUrgent((v) => !v)}>
                  {showAllUrgent ? (
                    <>Recolher <ChevronUp className="h-4 w-4 ml-1" /></>
                  ) : (
                    <>Ver todos ({urgentItems.length}) <ChevronDown className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== Cards das lanchas ===== */}
      {isLoading ? (
        <p className="text-muted-foreground">Carregando frota...</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {grouped.map((b) => {
            const worst = b.itens.reduce<"ok" | "warn" | "danger">((w, i) => {
              const s = statusFromSemaforo(i.status_semaforo);
              if (s === "danger") return "danger";
              if (s === "warn" && w !== "danger") return "warn";
              return w;
            }, "ok");

            // ----- Equipamentos: priorizar não-verdes, sempre incluir o mais próximo da troca -----
            const itensComScore = b.itens.map((eq) => {
              const restantes = eq.horas_restantes_troca == null ? Number.MAX_SAFE_INTEGER : Number(eq.horas_restantes_troca);
              return { eq, restantes };
            });
            const naoVerdes = itensComScore.filter(({ eq }) => eq.status_semaforo !== "verde");
            const maisProximo = [...itensComScore].sort((a, b) => a.restantes - b.restantes)[0];
            const setIds = new Set(naoVerdes.map((x) => x.eq.ativo_id));
            const baseList = [...naoVerdes];
            if (maisProximo && !setIds.has(maisProximo.eq.ativo_id)) baseList.push(maisProximo);
            // ordena por urgência
            baseList.sort((a, b) => a.restantes - b.restantes);

            const isEquipExpanded = expanded[b.lanchaId]?.equip ?? false;
            const equipVisible = isEquipExpanded ? b.itens : baseList.slice(0, 4).map((x) => x.eq);
            const equipHiddenCount = b.itens.length - Math.min(baseList.length, 4);

            // ----- Periódicas: 3 mais urgentes -----
            const periodicAll = (periodicasByLancha.get(b.lanchaId) ?? []).slice().sort((a, b) => {
              const da = a.dias_restantes == null ? Number.MAX_SAFE_INTEGER : a.dias_restantes;
              const db = b.dias_restantes == null ? Number.MAX_SAFE_INTEGER : b.dias_restantes;
              return da - db;
            });
            const isPeriodicExpanded = expanded[b.lanchaId]?.periodic ?? false;
            const periodicVisible = isPeriodicExpanded ? periodicAll : periodicAll.slice(0, 3);

            return (
              <Card key={b.lanchaId} className={cn("border-t-4 shadow-sm hover:shadow-md transition-shadow", borderForBoat(b.nome))}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{b.nome}</CardTitle>
                    <StatusIndicator status={worst} showLabel />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Atualizado: {fmtDate(b.ultima)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="text-center py-2 rounded-lg bg-secondary">
                      <p className="text-2xl font-bold">{(b.horimetro ?? 0).toLocaleString("pt-BR")}h</p>
                      <p className="text-xs text-muted-foreground">Lancha</p>
                    </div>
                    <div className="text-center py-2 rounded-lg bg-secondary">
                      <p className="text-2xl font-bold">{(b.horimetroGerador ?? 0).toLocaleString("pt-BR")}h</p>
                      <p className="text-xs text-muted-foreground">Gerador</p>
                    </div>
                  </div>

                  {/* Equipamentos */}
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_5rem_5rem_5rem_2rem] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                      <span>Equipamento</span>
                      <span className="text-center">Horímetro</span>
                      <span className="text-center">Troca óleo</span>
                      <span className="text-center">Overhaul</span>
                      <span></span>
                    </div>
                    {equipVisible.map((eq) => {
                      const status = statusFromSemaforo(eq.status_semaforo);
                      const slot = eq.posicao ?? "—";
                      const horasEq = eq.horas_equipamento_calculadas == null ? null : Number(eq.horas_equipamento_calculadas);
                      const restantes = eq.horas_restantes_troca == null ? null : Number(eq.horas_restantes_troca);
                      const restantesOh = eq.horas_restantes_overhaul == null ? null : Number(eq.horas_restantes_overhaul);
                      return (
                        <div key={eq.ativo_id} className="grid grid-cols-[1fr_5rem_5rem_5rem_2rem] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <StatusIndicator status={status} />
                            <button
                              type="button"
                              onClick={() => setDetalhesModal({ open: true, row: eq })}
                              className="font-medium truncate cursor-pointer hover:underline text-left"
                              title="Ver detalhes do ativo"
                            >
                              {eq.ativo_nome}
                            </button>
                            <span className="text-muted-foreground text-xs">{slot}</span>
                          </div>
                          <span className="text-center font-mono text-xs">{(horasEq ?? 0).toLocaleString("pt-BR")}h</span>
                          <span className={cn(
                            "text-center font-mono text-xs font-semibold",
                            status === "danger" && "text-status-danger",
                            status === "warn" && "text-status-warn",
                            status === "ok" && "text-status-ok",
                          )}>
                            {fmtRestanteH(restantes)}
                          </span>
                          <span className="text-center font-mono text-xs text-muted-foreground">
                            {fmtRestanteH(restantesOh)}
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Registrar manutenção"
                            onClick={() => setModal({ open: true, row: eq })}>
                            <Wrench className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}

                    {b.itens.length > equipVisible.length || isEquipExpanded ? (
                      <div className="pt-1">
                        <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => toggleExpand(b.lanchaId, "equip")}>
                          {isEquipExpanded ? (
                            <>Recolher <ChevronUp className="h-3 w-3 ml-1" /></>
                          ) : (
                            <>Ver todos ({b.itens.length}) <ChevronDown className="h-3 w-3 ml-1" /></>
                          )}
                        </Button>
                      </div>
                    ) : null}

                    {/* Manutenções Periódicas */}
                    {periodicAll.length > 0 && (
                      <>
                        <div className="my-2 border-t border-border" />
                        <div className="grid grid-cols-[1fr_90px_90px_60px_32px] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                          <span>Manutenção</span>
                          <span className="text-center">Última</span>
                          <span className="text-center">Próxima</span>
                          <span className="text-center">Dias</span>
                          <span></span>
                        </div>
                        {periodicVisible.map((it) => {
                          const lvl = periodicStatusLevel(it.status_semaforo);
                          const dias = it.dias_restantes;
                          let diasNode: React.ReactNode;
                          if (it.ultima_data == null || dias == null) {
                            diasNode = <span className="text-muted-foreground">—</span>;
                          } else if (dias < 0) {
                            diasNode = <span className="text-status-danger font-semibold">{Math.abs(dias)}d atrás</span>;
                          } else if (dias === 0) {
                            diasNode = <span className="text-status-danger font-semibold">Hoje!</span>;
                          } else {
                            diasNode = (
                              <span className={cn(
                                "font-mono",
                                lvl === "warn" && "text-status-warn font-semibold",
                                lvl === "ok" && "text-status-ok",
                              )}>
                                {dias}d
                              </span>
                            );
                          }
                          return (
                            <div key={it.tipo_id} className="grid grid-cols-[1fr_90px_90px_60px_32px] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {lvl ? <StatusIndicator status={lvl} /> : <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block shrink-0" />}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="font-medium truncate cursor-help">{abbrevManutencao(it.tipo_nome)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>{it.tipo_nome}</TooltipContent>
                                </Tooltip>
                              </div>
                              <span className="text-center font-mono text-xs">
                                {it.ultima_data ? fmtDateBR(it.ultima_data) : <span className="text-muted-foreground italic">Nunca</span>}
                              </span>
                              <span className="text-center font-mono text-xs">{fmtDateBR(it.proxima_data)}</span>
                              <span className="text-center text-xs">{diasNode}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Registrar manutenção periódica"
                                onClick={() => setPeriodicModal({ open: true, row: it })}
                              >
                                <CalendarCheck className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                        {periodicAll.length > 3 && (
                          <div className="pt-1">
                            <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => toggleExpand(b.lanchaId, "periodic")}>
                              {isPeriodicExpanded ? (
                                <>Recolher <ChevronUp className="h-3 w-3 ml-1" /></>
                              ) : (
                                <>Ver todas ({periodicAll.length}) <ChevronDown className="h-3 w-3 ml-1" /></>
                              )}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <MaintenanceModal
        open={modal.open}
        onClose={() => setModal({ open: false, row: null })}
        row={modal.row}
      />
      <PeriodicMaintenanceModal
        open={periodicModal.open}
        onClose={() => setPeriodicModal({ open: false, row: null })}
        row={periodicModal.row}
      />
      <AtivoDetalhesModal
        open={detalhesModal.open}
        onClose={() => setDetalhesModal({ open: false, row: null })}
        ativoId={detalhesModal.row?.ativo_id ?? null}
        row={detalhesModal.row}
      />
    </div>
  );
}
