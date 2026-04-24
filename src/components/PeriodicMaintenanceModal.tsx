import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateManutencaoPeriodica, ManutencaoPeriodicaStatus } from "@/hooks/useFleetData";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  row: ManutencaoPeriodicaStatus | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export function PeriodicMaintenanceModal({ open, onClose, row }: Props) {
  const [data, setData] = useState(today());
  const [obs, setObs] = useState("");
  const create = useCreateManutencaoPeriodica();

  useEffect(() => {
    if (open) {
      setData(today());
      setObs("");
    }
  }, [open]);

  if (!row) return null;

  const handleSave = async () => {
    if (!data) { toast.error("Informe a data"); return; }
    if (data > today()) { toast.error("Data não pode ser futura"); return; }
    try {
      await create.mutateAsync({
        lancha_id: row.lancha_id,
        tipo_id: row.tipo_id,
        data_realizada: data,
        observacao: obs.trim() || null,
      });
      toast.success("Manutenção periódica registrada");
      onClose();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message ?? "desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Manutenção Periódica</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo de manutenção</Label>
            <Input value={row.tipo_nome} readOnly disabled />
          </div>
          <div>
            <Label>Lancha</Label>
            <Input value={row.lancha_nome} readOnly disabled />
          </div>
          <div>
            <Label>Data de realização</Label>
            <Input type="date" value={data} max={today()} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
