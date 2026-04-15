import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { MaintenanceType } from "@/types/fleet";
import { toast } from "sonner";

interface MaintenanceModalProps {
  open: boolean;
  onClose: () => void;
  boatName: string;
  slotName: string;
  assetName: string;
}

const typeLabels: Record<MaintenanceType, string> = {
  oil_change: "Troca de óleo",
  overhaul: "Overhaul",
  bearing_revision: "Revisão de rolamentos",
  other: "Outro",
};

export function MaintenanceModal({ open, onClose, boatName, slotName, assetName }: MaintenanceModalProps) {
  const [type, setType] = useState<MaintenanceType | "">("");
  const [date, setDate] = useState<Date>(new Date());
  const [boatHours, setBoatHours] = useState("");
  const [equipmentHours, setEquipmentHours] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!type) { toast.error("Selecione o tipo de manutenção"); return; }
    if (date > new Date()) { toast.error("A data não pode ser futura"); return; }
    if (type === "oil_change" && !boatHours) { toast.error("Informe o horímetro da lancha"); return; }
    if (type === "overhaul" && !equipmentHours) { toast.error("Informe o horímetro do equipamento"); return; }

    toast.success(`Manutenção registrada: ${typeLabels[type]} - ${assetName} (${boatName})`);
    resetAndClose();
  };

  const resetAndClose = () => {
    setType("");
    setDate(new Date());
    setBoatHours("");
    setEquipmentHours("");
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Manutenção</DialogTitle>
          <p className="text-sm text-muted-foreground">{boatName} • {slotName} • {assetName}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo de manutenção</Label>
            <Select value={type} onValueChange={(v) => setType(v as MaintenanceType)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PPP", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  disabled={(d) => d > new Date()}
                  className="p-3 pointer-events-auto"
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {type === "oil_change" && (
            <div className="space-y-2">
              <Label>Horímetro da lancha (no momento)</Label>
              <Input type="number" value={boatHours} onChange={(e) => setBoatHours(e.target.value)} placeholder="Ex: 4250" />
            </div>
          )}

          {type === "overhaul" && (
            <div className="space-y-2">
              <Label>Horímetro do equipamento</Label>
              <Input type="number" value={equipmentHours} onChange={(e) => setEquipmentHours(e.target.value)} placeholder="Ex: 3120" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes da manutenção..." rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
