import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { SituacaoRow, useCreateManutencao } from "@/hooks/useFleetData";

const typeLabels: Record<string, string> = {
  troca_oleo: "Troca de óleo",
  overhaul: "Overhaul",
  revisao_rolamento: "Revisão de rolamentos",
  outro: "Outro",
};

interface Props {
  open: boolean;
  onClose: () => void;
  row: SituacaoRow | null;
}

export function MaintenanceModal({ open, onClose, row }: Props) {
  const [type, setType] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [boatHours, setBoatHours] = useState("");
  const [equipmentHours, setEquipmentHours] = useState("");
  const [notes, setNotes] = useState("");
  const createMut = useCreateManutencao();

  useEffect(() => {
    if (open && row) {
      setBoatHours(String(row.lancha_horimetro ?? ""));
      setEquipmentHours(String(row.horas_equipamento_calculadas ?? ""));
    }
  }, [open, row]);

  const reset = () => {
    setType(""); setDate(new Date()); setBoatHours(""); setEquipmentHours(""); setNotes("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!row) return;
    if (!type) { toast.error("Selecione o tipo"); return; }
    if (date > new Date()) { toast.error("Data não pode ser futura"); return; }

    try {
      await createMut.mutateAsync({
        ativo_id: row.ativo_id,
        lancha_id: row.lancha_id,
        tipo: type,
        data_manutencao: date.toISOString(),
        horimetro_lancha: boatHours ? Number(boatHours) : null,
        horimetro_equipamento: equipmentHours ? Number(equipmentHours) : null,
        observacao: notes || null,
      });
      toast.success("Manutenção registrada");
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao registrar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Manutenção</DialogTitle>
          {row && (
            <p className="text-sm text-muted-foreground">
              {row.lancha_nome} • {row.posicao ?? "—"} • {row.ativo_nome}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo de manutenção</Label>
            <Select value={type} onValueChange={setType}>
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
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)}
                  disabled={(d) => d > new Date()} className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Horímetro lancha</Label>
              <Input type="number" value={boatHours} onChange={(e) => setBoatHours(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Horímetro equip.</Label>
              <Input type="number" value={equipmentHours} onChange={(e) => setEquipmentHours(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={reset}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
