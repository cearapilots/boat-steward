import { Boat } from "@/types/fleet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Clock, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const boatColors: Record<string, string> = {
  Flexeiras: "border-t-boat-flexeiras",
  Fortim: "border-t-boat-fortim",
  "Taíba": "border-t-boat-taiba",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function BoatCard({ boat, onMaintenance }: { boat: Boat; onMaintenance: (boatId: string, slot: string, assetId: string) => void }) {
  const worstStatus = boat.equipment.reduce((w, e) => {
    if (e.status === "danger") return "danger";
    if (e.status === "warn" && w !== "danger") return "warn";
    return w;
  }, "ok" as "ok" | "warn" | "danger");

  return (
    <Card className={cn("border-t-4 shadow-sm hover:shadow-md transition-shadow", boatColors[boat.name])}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{boat.name}</CardTitle>
          <StatusIndicator status={worstStatus} showLabel />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Atualizado: {formatDate(boat.lastUpdated)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center mb-4 py-3 rounded-lg bg-secondary">
          <p className="text-3xl font-bold text-foreground">{boat.currentHours.toLocaleString("pt-BR")}h</p>
          <p className="text-xs text-muted-foreground">Horímetro da Lancha</p>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1">
            <span>Equipamento</span>
            <span>Ativo</span>
            <span className="text-right">Horas</span>
            <span className="text-right">Faltam</span>
            <span></span>
          </div>
          {boat.equipment.map((eq) => (
            <div key={eq.slot} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-secondary/50 text-sm">
              <div className="flex items-center gap-1.5">
                <StatusIndicator status={eq.status} />
                <span className="font-medium">{eq.slot}</span>
              </div>
              <span className="text-muted-foreground text-xs">{eq.activeAsset}</span>
              <span className="text-right font-mono text-xs">{eq.equipmentHours.toLocaleString("pt-BR")}h</span>
              <span className={cn(
                "text-right font-mono text-xs font-semibold",
                eq.status === "danger" && "text-status-danger",
                eq.status === "warn" && "text-status-warn",
                eq.status === "ok" && "text-status-ok",
              )}>
                {eq.hoursRemaining > 0 ? `${eq.hoursRemaining}h` : `${Math.abs(eq.hoursRemaining)}h atrás`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onMaintenance(boat.id, eq.slot, eq.assetId)}
                title="Registrar manutenção"
              >
                <Wrench className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
