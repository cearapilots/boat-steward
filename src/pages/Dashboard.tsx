/* Fleet Dashboard - dados do Supabase */
import { useMemo, useState } from "react";
import { useSituacaoAtual, SituacaoRow, useManutencoesPeriodicas, ManutencaoPeriodicaStatus } from "@/hooks/useFleetData";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { PeriodicMaintenanceModal } from "@/components/PeriodicMaintenanceModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/StatusIndicator";
import { Separator } from "@/components/ui/separator";
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
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                      <span>Equipamento</span>
                      <span className="text-right">Horímetro</span>
                      <span className="text-right">Troca óleo</span>
                      <span className="text-right">Overhaul</span>
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
                        <div key={eq.ativo_id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <StatusIndicator status={status} />
                            <span className="font-medium truncate">{eq.ativo_nome}</span>
                            <span className="text-muted-foreground text-xs">{slot}</span>
                          </div>
                          <span className="text-right font-mono text-xs">{(horasEq ?? 0).toLocaleString("pt-BR")}h</span>
                          <span className={cn(
                            "text-right font-mono text-xs font-semibold",
                            status === "danger" && "text-status-danger",
                            status === "warn" && "text-status-warn",
                            status === "ok" && "text-status-ok",
                          )}>
                            {fmtRestante(restantes)}
                          </span>
                          <span className="text-right font-mono text-xs text-muted-foreground">
                            {fmtRestante(restantesOh)}
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Registrar manutenção"
                            onClick={() => setModal({ open: true, row: eq })}>
                            <Wrench className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}


      {/* ====== MANUTENÇÕES PERIÓDICAS ====== */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-bold text-foreground whitespace-nowrap">Manutenções Periódicas</h2>
          <Separator className="flex-1" />
        </div>
        <PeriodicSection periodicas={periodicas ?? []} onRegister={(row) => setPeriodicModal({ open: true, row })} />
      </div>

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

function PeriodicSection({
  periodicas,
  onRegister,
}: {
  periodicas: ManutencaoPeriodicaStatus[];
  onRegister: (row: ManutencaoPeriodicaStatus) => void;
}) {
  const ordemLanchas = ["Flexeiras", "Fortim", "Taíba"];
  const grouped = useMemo(() => {
    const map = new Map<string, { lancha_id: string; nome: string; itens: ManutencaoPeriodicaStatus[] }>();
    periodicas.forEach((p) => {
      if (!map.has(p.lancha_id)) map.set(p.lancha_id, { lancha_id: p.lancha_id, nome: p.lancha_nome, itens: [] });
      map.get(p.lancha_id)!.itens.push(p);
    });
    return Array.from(map.values()).sort(
      (a, b) => ordemLanchas.indexOf(a.nome) - ordemLanchas.indexOf(b.nome),
    );
  }, [periodicas]);

  if (grouped.length === 0) {
    return <p className="text-muted-foreground text-sm">Sem dados de manutenções periódicas.</p>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {grouped.map((b) => {
        const worst = b.itens.reduce<"ok" | "warn" | "danger" | null>((w, i) => {
          const lvl = periodicStatusLevel(i.status_semaforo);
          if (lvl === "danger") return "danger";
          if (lvl === "warn" && w !== "danger") return "warn";
          if (lvl === "ok" && w == null) return "ok";
          return w;
        }, null);

        return (
          <Card key={b.lancha_id} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{b.nome}</CardTitle>
                {worst && <StatusIndicator status={worst} showLabel />}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                <span>Manutenção</span>
                <span className="text-right">Última</span>
                <span className="text-right">Próxima</span>
                <span className="text-right">Dias</span>
                <span></span>
              </div>
              {b.itens.map((it) => {
                const lvl = periodicStatusLevel(it.status_semaforo);
                const dias = it.dias_restantes;
                let diasNode: React.ReactNode;
                if (it.ultima_data == null) {
                  diasNode = <span className="text-muted-foreground">—</span>;
                } else if (dias == null) {
                  diasNode = <span className="text-muted-foreground">—</span>;
                } else if (dias < 0) {
                  diasNode = <span className="text-status-danger font-semibold">{Math.abs(dias)} dias atrás</span>;
                } else if (dias === 0) {
                  diasNode = <span className="text-status-danger font-semibold">Hoje!</span>;
                } else {
                  diasNode = (
                    <span
                      className={cn(
                        "font-mono",
                        lvl === "warn" && "text-status-warn font-semibold",
                        lvl === "ok" && "text-status-ok",
                      )}
                    >
                      {dias}d
                    </span>
                  );
                }

                const ultimaNode =
                  it.ultima_data == null ? (
                    <span className="text-muted-foreground italic">Nunca registrado</span>
                  ) : (
                    <span className="font-mono text-xs">{fmtDateBR(it.ultima_data)}</span>
                  );

                return (
                  <div
                    key={it.tipo_id}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {lvl ? (
                        <StatusIndicator status={lvl} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs bg-muted">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                        </span>
                      )}
                      <span className="font-medium truncate" title={it.tipo_nome}>{it.tipo_nome}</span>
                    </div>
                    <span className="text-right text-xs">{ultimaNode}</span>
                    <span className="text-right font-mono text-xs">{fmtDateBR(it.proxima_data)}</span>
                    <span className="text-right text-xs">{diasNode}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Registrar manutenção periódica"
                      onClick={() => onRegister(it)}
                    >
                      <CalendarCheck className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
