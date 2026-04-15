import { useState } from "react";
import { motorPositions, motorHistory } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BoatName } from "@/types/fleet";

const boatColorClass: Record<string, string> = {
  Flexeiras: "bg-boat-flexeiras",
  Fortim: "bg-boat-fortim",
  "Taíba": "bg-boat-taiba",
  Reserva: "bg-boat-reserva",
};

const boatTextClass: Record<string, string> = {
  Flexeiras: "text-boat-flexeiras",
  Fortim: "text-boat-fortim",
  "Taíba": "text-boat-taiba",
  Reserva: "text-boat-reserva",
};

export default function Motors() {
  const [swapOpen, setSwapOpen] = useState(false);
  const [selectedMotor, setSelectedMotor] = useState("");
  const [filterMotor, setFilterMotor] = useState("all");

  const filteredHistory = filterMotor === "all"
    ? motorHistory
    : motorHistory.filter((h) => h.motorId === filterMotor);

  const motors = motorPositions.map((m) => m.motorId);
  const uniqueMotors = [...new Set(motors)];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Motores</h1>
          <p className="text-sm text-muted-foreground">Posição e histórico dos motores da frota</p>
        </div>
        <Button onClick={() => setSwapOpen(true)} size="sm">
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Trocar posição de motor
        </Button>
      </div>

      {/* Current Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posição Atual dos Motores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motor</TableHead>
                  <TableHead>Posição</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Horas na posição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {motorPositions.map((m) => (
                  <TableRow key={m.motorId}>
                    <TableCell className="font-medium">{m.motorName}</TableCell>
                    <TableCell>{m.currentSlot}</TableCell>
                    <TableCell>
                      <span className={cn("font-medium", boatTextClass[m.currentBoat])}>
                        {m.currentBoat}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(m.installedDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right font-mono">{m.hoursInPosition.toLocaleString("pt-BR")}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Linha do Tempo</CardTitle>
            <div className="flex gap-3 text-xs">
              {Object.entries(boatColorClass).map(([name, cls]) => (
                <span key={name} className="flex items-center gap-1">
                  <span className={cn("h-3 w-3 rounded-sm", cls)} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {uniqueMotors.map((mId) => {
            const segments = motorHistory.filter((h) => h.motorId === mId);
            if (segments.length === 0) return null;
            const motorName = motorPositions.find((p) => p.motorId === mId)?.motorName ?? mId;
            return (
              <div key={mId} className="mb-4">
                <p className="text-sm font-medium mb-1">{motorName}</p>
                <div className="flex h-8 rounded-lg overflow-hidden gap-0.5">
                  {segments.map((seg, i) => (
                    <div
                      key={i}
                      className={cn("flex items-center justify-center text-xs font-medium text-primary-foreground cursor-pointer hover:opacity-80 transition-opacity", boatColorClass[seg.boat])}
                      style={{ flex: seg.hours }}
                      title={`${seg.boat} (${seg.slot}): ${seg.startDate} → ${seg.endDate ?? "atual"} — ${seg.hours}h`}
                    >
                      {seg.hours > 500 && `${seg.hours}h`}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Histórico de Posições</CardTitle>
            <Select value={filterMotor} onValueChange={setFilterMotor}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {uniqueMotors.map((mId) => {
                  const name = motorPositions.find((p) => p.motorId === mId)?.motorName ?? mId;
                  return <SelectItem key={mId} value={mId}>{name}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motor</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead>Posição</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{motorPositions.find((p) => p.motorId === h.motorId)?.motorName ?? h.motorId}</TableCell>
                    <TableCell>
                      <span className={cn("font-medium", boatTextClass[h.boat])}>{h.boat}</span>
                    </TableCell>
                    <TableCell>{h.slot}</TableCell>
                    <TableCell>{new Date(h.startDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{h.endDate ? new Date(h.endDate).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{h.hours.toLocaleString("pt-BR")}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Swap Modal */}
      <SwapMotorModal open={swapOpen} onClose={() => setSwapOpen(false)} />
    </div>
  );
}

function SwapMotorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [motor, setMotor] = useState("");
  const [position, setPosition] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [destHours, setDestHours] = useState("");
  const [motorHours, setMotorHours] = useState("");

  const positions = ["Flexeiras BB", "Flexeiras BE", "Fortim BB", "Fortim BE", "Taíba BB", "Taíba BE", "Reserva"];

  const handleSubmit = () => {
    if (!motor || !position) { toast.error("Preencha todos os campos obrigatórios"); return; }
    if (position !== "Reserva" && !destHours) { toast.error("Informe o horímetro da lancha de destino"); return; }
    const offset = position !== "Reserva" ? Number(destHours) - Number(motorHours) : 0;
    toast.success(`Motor movido para ${position}. Offset calculado: ${offset}h`);
    setMotor(""); setPosition(""); setDestHours(""); setMotorHours("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar Posição de Motor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Motor</Label>
            <Select value={motor} onValueChange={setMotor}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {motorPositions.map((m) => (
                  <SelectItem key={m.motorId} value={m.motorId}>{m.motorName} ({m.currentBoat})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nova posição</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          {position && position !== "Reserva" && (
            <div className="space-y-2">
              <Label>Horímetro da lancha de destino</Label>
              <Input type="number" value={destHours} onChange={(e) => setDestHours(e.target.value)} placeholder="Ex: 4250" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Horímetro atual do motor</Label>
            <Input type="number" value={motorHours} onChange={(e) => setMotorHours(e.target.value)} placeholder="Ex: 3120" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
