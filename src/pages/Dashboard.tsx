/* Fleet Dashboard - dados do Supabase */
import { useMemo, useState } from "react";
import { useSituacaoAtual, SituacaoRow, useManutencoesPeriodicas, ManutencaoPeriodicaStatus } from "@/hooks/useFleetData";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { PeriodicMaintenanceModal } from "@/components/PeriodicMaintenanceModal";
import { AtivoDetalhesModal } from "@/components/AtivoDetalhesModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/StatusIndicator";

import { RefreshCw, Clock, Wrench, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Cor dinâmica derivada do nome da lancha (HSL via design system)
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

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}

export default function Dashboard() {
  const { data: rows, isLoading, refetch, isFetching } = useSituacaoAtual();
  const { data: periodicas } = useManutencoesPeriodicas();
  const [modal, setModal] = useState<{ open: boolean; row: SituacaoRow | null }>({ open: false, row: null });
  const [periodicModal, setPeriodicModal] = useState<{ open: boolean; row: ManutencaoPeriodicaStatus | null }>({ open: false, row: null });
  const [detalhesModal, setDetalhesModal] = useState<{ open: boolean; row: SituacaoRow | null }>({ open: false, row: null });

  const grouped = useMemo(() => {
    const map = new Map<string, { lanchaId: string; nome: string; horimetro: number; horimetroGerador: number; ultima: string; itens: SituacaoRow[] }>();
    const isReserva = (nome: string) => /reserva|retifica|retífica/i.test(nome ?? "");
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

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da frota</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => { refetch(); toast.success("Atualizando..."); }} disabled={isFetching} size="sm">
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

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

                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_5rem_5rem_5rem_2rem] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                      <span>Equipamento</span>
                      <span className="text-center">Horímetro</span>
                      <span className="text-center">Troca óleo</span>
                      <span className="text-center">Overhaul</span>
                      <span></span>
                    </div>
                    {b.itens.map((eq) => {
                      const status = statusFromSemaforo(eq.status_semaforo);
                      const slot = eq.posicao ?? "—";
                      const horasEq = eq.horas_equipamento_calculadas == null ? null : Number(eq.horas_equipamento_calculadas);
                      const restantes = eq.horas_restantes_troca == null ? null : Number(eq.horas_restantes_troca);
                      const restantesOh = eq.horas_restantes_overhaul == null ? null : Number(eq.horas_restantes_overhaul);
                      const fmtRestante = (v: number | null) =>
                        v == null
                          ? "—"
                          : v >= 0
                            ? `${v.toLocaleString("pt-BR")}h`
                            : `${Math.abs(v).toLocaleString("pt-BR")}h atrás`;
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
                            {fmtRestante(restantes)}
                          </span>
                          <span className="text-center font-mono text-xs text-muted-foreground">
                            {fmtRestante(restantesOh)}
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Registrar manutenção"
                            onClick={() => setModal({ open: true, row: eq })}>
                            <Wrench className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}

                    {/* ===== Manutenções Periódicas dentro do card ===== */}
                    {(periodicasByLancha.get(b.lanchaId) ?? []).length > 0 && (
                      <>
                        <div className="relative my-3">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border" />
                          </div>
                          <div className="relative flex justify-center">
                            <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Manutenções Periódicas
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-[1fr_5rem_5rem_5rem_2rem] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                          <span>Manutenção</span>
                          <span className="text-center">Última</span>
                          <span className="text-center">Próxima</span>
                          <span className="text-center">Dias</span>
                          <span></span>
                        </div>
                        {(periodicasByLancha.get(b.lanchaId) ?? []).map((it) => {
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
                            <div key={it.tipo_id} className="grid grid-cols-[1fr_5rem_5rem_5rem_2rem] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {lvl ? <StatusIndicator status={lvl} /> : <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />}
                                <span className="font-medium truncate" title={it.tipo_nome}>{it.tipo_nome}</span>
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

function periodicStatusLevel(s: ManutencaoPeriodicaStatus["status_semaforo"]) {
  if (s === "vencido" || s === "critico") return "danger" as const;
  if (s === "atencao") return "warn" as const;
  if (s === "ok") return "ok" as const;
  return null; // sem_registro
}

function fmtDateBR(iso: string | null) {
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}



