/* Fleet Dashboard - dados do Supabase */
import { useMemo, useState } from "react";
import { useSituacaoAtual, SituacaoRow } from "@/hooks/useFleetData";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/StatusIndicator";
import { RefreshCw, Clock, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const boatBorder: Record<string, string> = {
  Flexeiras: "border-t-boat-flexeiras",
  Fortim: "border-t-boat-fortim",
  "Taíba": "border-t-boat-taiba",
};

function statusFromSemaforo(s: string): "ok" | "warn" | "danger" {
  if (s === "vermelho") return "danger";
  if (s === "amarelo") return "warn";
  return "ok";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Dashboard() {
  const { data: rows, isLoading, refetch, isFetching } = useSituacaoAtual();
  const [modal, setModal] = useState<{ open: boolean; row: SituacaoRow | null }>({ open: false, row: null });

  const grouped = useMemo(() => {
    const map = new Map<string, { lanchaId: string; nome: string; horimetro: number; horimetroGerador: number; ultima: string; itens: SituacaoRow[] }>();
    (rows ?? []).forEach((r) => {
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
              <Card key={b.lanchaId} className={cn("border-t-4 shadow-sm hover:shadow-md transition-shadow", boatBorder[b.nome])}>
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
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
                      <span>Equipamento</span>
                      <span className="text-right">Horas</span>
                      <span className="text-right">Faltam</span>
                      <span></span>
                    </div>
                    {b.itens.map((eq) => {
                      const status = statusFromSemaforo(eq.status_semaforo);
                      const slot = eq.posicao ? `${eq.posicao}` : "—";
                      const horasEq = eq.horas_equipamento_calculadas == null ? null : Number(eq.horas_equipamento_calculadas);
                      const restantes = eq.horas_restantes_troca == null ? null : Number(eq.horas_restantes_troca);
                      return (
                        <div key={eq.ativo_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <StatusIndicator status={status} />
                            <span className="font-medium truncate">{eq.ativo_nome}</span>
                            <span className="text-muted-foreground text-xs">{slot}</span>
                          </div>
                          <span className="text-right font-mono text-xs">{horasEq != null ? `${horasEq.toLocaleString("pt-BR")}h` : "—"}</span>
                          <span className={cn(
                            "text-right font-mono text-xs font-semibold",
                            status === "danger" && "text-status-danger",
                            status === "warn" && "text-status-warn",
                            status === "ok" && "text-status-ok",
                          )}>
                            {restantes == null
                              ? "—"
                              : restantes >= 0
                                ? `${(restantes ?? 0).toLocaleString("pt-BR")}h`
                                : `${Math.abs(restantes ?? 0).toLocaleString("pt-BR")}h atrás`}
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

      <MaintenanceModal
        open={modal.open}
        onClose={() => setModal({ open: false, row: null })}
        row={modal.row}
      />
    </div>
  );
}
