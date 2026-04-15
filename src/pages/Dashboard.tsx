import { useState } from "react";
import { boats, lastSyncTime } from "@/data/mockData";
import { BoatCard } from "@/components/BoatCard";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";

function formatSyncTime(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const [syncing, setSyncing] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; boatId: string; slot: string; assetId: string }>({ open: false, boatId: "", slot: "", assetId: "" });

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      toast.success("Horímetros atualizados com sucesso");
    }, 2000);
  };

  const selectedBoat = boats.find((b) => b.id === modal.boatId);
  const selectedEquipment = selectedBoat?.equipment.find((e) => e.slot === modal.slot);

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da frota</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Última sync: {formatSyncTime(lastSyncTime)}
          </span>
          <Button onClick={handleSync} disabled={syncing} size="sm">
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            Atualizar horímetros
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {boats.map((boat) => (
          <BoatCard
            key={boat.id}
            boat={boat}
            onMaintenance={(boatId, slot, assetId) => setModal({ open: true, boatId, slot, assetId })}
          />
        ))}
      </div>

      <MaintenanceModal
        open={modal.open}
        onClose={() => setModal({ open: false, boatId: "", slot: "", assetId: "" })}
        boatName={selectedBoat?.name ?? ""}
        slotName={modal.slot}
        assetName={selectedEquipment?.activeAsset ?? ""}
      />
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
