import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCreateMotorPosition, useLanchas } from "@/hooks/useFleetData";

const RESERVA = "__reserva__";

interface Props {
  open: boolean;
  onClose: () => void;
  motorAtivos: any[];
  posicoes: any[];
  currentByLanchaPosicao: Map<string, any>; // key = `${lancha_id}|${posicao}`
}

export function MotorPositionModal({ open, onClose, motorAtivos, posicoes, currentByLanchaPosicao }: Props) {
  const { data: lanchas } = useLanchas();
  const swap = useCreateMotorPosition();

  const [lanchaDest, setLanchaDest] = useState<string>("");
  const [posDest, setPosDest] = useState<"BB" | "BE" | "">("");
  const [motorEntraId, setMotorEntraId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [horLancha, setHorLancha] = useState("");
  const [horMotor, setHorMotor] = useState("");

  const isReserva = lanchaDest === RESERVA;

  // motores em reserva (sem lancha_id, com posição aberta)
  const motoresReserva = useMemo(() => {
    const abertos = posicoes.filter((p: any) => !p.data_remocao);
    const ativosComPosAbertaSemLancha = new Set(
      abertos.filter((p: any) => !p.lancha_id).map((p: any) => p.ativo_id)
    );
    return motorAtivos.filter((a: any) => ativosComPosAbertaSemLancha.has(a.id) || (!a.lancha_id && !abertos.find((p:any)=>p.ativo_id===a.id)));
  }, [motorAtivos, posicoes]);

  const motorEntra = motoresReserva.find((m: any) => m.id === motorEntraId);

  // motor que sai (auto)
  const motorSai = useMemo(() => {
    if (isReserva || !lanchaDest || !posDest) return null;
    const p = currentByLanchaPosicao.get(`${lanchaDest}|${posDest}`);
    return p?.ativo ?? null;
  }, [isReserva, lanchaDest, posDest, currentByLanchaPosicao]);

  // posicao aberta atual do motor que entra (para validar horímetro mínimo)
  const posReservaMotorEntra = useMemo(() => {
    if (!motorEntraId) return null;
    return posicoes.find((p: any) => p.ativo_id === motorEntraId && !p.data_remocao) ?? null;
  }, [posicoes, motorEntraId]);

  useEffect(() => {
    if (open) {
      setLanchaDest(""); setPosDest(""); setMotorEntraId("");
      setDate(new Date()); setHorLancha(""); setHorMotor("");
    }
  }, [open]);

  useEffect(() => {
    if (motorEntra) setHorMotor(String(motorEntra.horimetro_equipamento ?? ""));
  }, [motorEntra]);

  useEffect(() => {
    if (isReserva) { setPosDest(""); setHorLancha(""); }
  }, [isReserva]);

  const lanchaDestNome = isReserva ? "Reserva" : (lanchas ?? []).find((l: any) => l.id === lanchaDest)?.nome ?? "";

  const handleSubmit = async () => {
    if (!lanchaDest) { toast.error("Selecione a lancha de destino"); return; }
    if (!isReserva && !posDest) { toast.error("Selecione a posição (BB/BE)"); return; }
    if (date > new Date()) { toast.error("Data não pode ser futura"); return; }
    if (!isReserva && !horLancha) { toast.error("Informe o horímetro da lancha"); return; }

    if (motorEntraId) {
      if (!horMotor) { toast.error("Informe o horímetro do motor que entra"); return; }
      // validação: mesma lancha+posição que motor que entra já ocupa
      const posAtualEntra = posicoes.find((p: any) => p.ativo_id === motorEntraId && !p.data_remocao);
      if (posAtualEntra && posAtualEntra.lancha_id === lanchaDest && posAtualEntra.posicao === posDest) {
        toast.error("Motor já está nessa lancha+posição");
        return;
      }
      // horímetro lancha destino >= horímetro registrado quando motor foi pra reserva
      if (!isReserva && posReservaMotorEntra && Number(horLancha) < Number(posReservaMotorEntra.horimetro_lancha_instalacao ?? 0)) {
        // só relevante se a reserva tinha lancha (não é o caso comum); ignorar
      }
    }

    if (!motorEntraId && !motorSai) {
      toast.error("Nada a fazer: posição vazia e nenhum motor entrando");
      return;
    }

    try {
      await swap.mutateAsync({
        data_troca: format(date, "yyyy-MM-dd"),
        lancha_destino_id: isReserva ? null : lanchaDest,
        posicao_destino: isReserva ? null : (posDest as "BB" | "BE"),
        horimetro_lancha_destino: isReserva ? null : Number(horLancha),
        motor_sai_id: motorSai?.id ?? null,
        motor_sai_nome: motorSai?.nome ?? null,
        motor_entra_id: motorEntraId || null,
        motor_entra_nome: motorEntra?.nome ?? null,
        horimetro_motor_entra: motorEntraId ? Number(horMotor) : null,
      });
      toast.success(motorEntra
        ? `${motorEntra.nome} instalado em ${lanchaDestNome}${posDest ? " " + posDest : ""}`
        : `${motorSai?.nome ?? "Motor"} movido para reserva`);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao trocar posição");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar Posição de Motor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            <Label>Lancha de destino</Label>
            <Select value={lanchaDest} onValueChange={setLanchaDest}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {(lanchas ?? []).map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
                <SelectItem value={RESERVA}>Reserva</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Posição de destino</Label>
            <Select value={posDest} onValueChange={(v) => setPosDest(v as "BB" | "BE")} disabled={isReserva}>
              <SelectTrigger><SelectValue placeholder={isReserva ? "—" : "BB ou BE"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BB">BB</SelectItem>
                <SelectItem value="BE">BE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Motor que SAI</Label>
            <Input readOnly value={motorSai ? `${motorSai.nome}` : (lanchaDest && posDest ? "Posição vazia" : "—")} />
          </div>

          <div className="space-y-2">
            <Label>Motor que ENTRA</Label>
            <Select value={motorEntraId} onValueChange={setMotorEntraId}>
              <SelectTrigger>
                <SelectValue placeholder={motoresReserva.length ? "Selecione..." : "Nenhum motor em reserva"} />
              </SelectTrigger>
              <SelectContent>
                {motoresReserva.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome} ({Number(m.horimetro_equipamento ?? 0).toLocaleString("pt-BR")}h)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data da troca</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "PPP", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)}
                  disabled={(d) => d > new Date()} className={cn("p-3 pointer-events-auto")} locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>

          {!isReserva && (
            <div className="space-y-2">
              <Label>Horímetro da lancha de destino</Label>
              <Input type="number" value={horLancha} onChange={(e) => setHorLancha(e.target.value)} />
            </div>
          )}

          {motorEntraId && (
            <div className="space-y-2">
              <Label>Horímetro atual do motor que ENTRA</Label>
              <Input type="number" value={horMotor} onChange={(e) => setHorMotor(e.target.value)} />
              <p className="text-xs text-muted-foreground">Editável — ajuste se motor voltou da retífica com horas diferentes.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={swap.isPending}>
            {swap.isPending ? "Salvando..." : "Confirmar troca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
