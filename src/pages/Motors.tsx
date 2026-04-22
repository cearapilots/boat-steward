import { useMemo, useState } from "react";
import { usePosicoes, useAtivos, useLanchas } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotorPositionModal } from "@/components/MotorPositionModal";

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
  const { data: posicoes, isLoading } = usePosicoes();
  const { data: ativos, isLoading: loadingAtivos } = useAtivos();
  const { data: lanchas } = useLanchas();
  const [filterMotor, setFilterMotor] = useState("all");
  const [swapOpen, setSwapOpen] = useState(false);

  const motorPositions = useMemo(() => (posicoes ?? []).filter((p: any) => p.ativo?.tipo === "motor"), [posicoes]);
  const motorAtivos = useMemo(() => (ativos ?? []).filter((a: any) => a.tipo === "motor"), [ativos]);

  const lanchaById = useMemo(() => {
    const m = new Map<string, any>();
    (lanchas ?? []).forEach((l: any) => m.set(l.id, l));
    return m;
  }, [lanchas]);

  const currentByAtivo = useMemo(() => {
    const map = new Map<string, any>();
    motorPositions.filter((p: any) => !p.data_remocao).forEach((p: any) => map.set(p.ativo_id, p));
    return map;
  }, [motorPositions]);

  const currentByLanchaPosicao = useMemo(() => {
    const map = new Map<string, any>();
    motorPositions
      .filter((p: any) => !p.data_remocao && p.lancha_id && p.posicao)
      .forEach((p: any) => map.set(`${p.lancha_id}|${p.posicao}`, p));
    return map;
  }, [motorPositions]);

  const history = useMemo(
    () => filterMotor === "all" ? motorPositions : motorPositions.filter((p: any) => p.ativo_id === filterMotor),
    [motorPositions, filterMotor]
  );

  const uniqueMotors = useMemo(() => {
    const map = new Map<string, string>();
    motorAtivos.forEach((a: any) => map.set(a.id, a.nome));
    motorPositions.forEach((p: any) => { if (!map.has(p.ativo_id)) map.set(p.ativo_id, p.ativo?.nome ?? p.ativo_id); });
    return Array.from(map.entries());
  }, [motorAtivos, motorPositions]);

  const boatLabel = (p: any) => p?.lancha?.nome ?? "Reserva";

  const daysBetween = (start?: string | null, end?: string | null) => {
    if (!start) return null;
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    if (isNaN(s) || isNaN(e)) return null;
    return Math.max(Math.floor((e - s) / 86400000), 0);
  };

  // horas estimadas para um segmento (usa lancha atual se posição ainda aberta)
  const segHoras = (p: any) => {
    if (p.data_remocao) return Math.max(Number(p.horas_operadas ?? 0), 0);
    if (!p.lancha_id) return 0; // em reserva: não acumula
    const lancha = lanchaById.get(p.lancha_id);
    if (!lancha) return Number(p.horas_operadas ?? 0);
    return Math.max(Number(lancha.horimetro ?? 0) - Number(p.horimetro_lancha_instalacao ?? 0), 0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestão de Motores</h1>
        <p className="text-sm text-muted-foreground">Posição e histórico dos motores da frota</p>
      </div>

      {(isLoading || loadingAtivos) ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Posição Atual dos Motores</CardTitle>
                <Button size="sm" onClick={() => setSwapOpen(true)}>
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Trocar Posição
                </Button>
              </div>
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
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead className="text-right">Horas operadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motorAtivos.map((a: any) => {
                      const p = currentByAtivo.get(a.id);
                      const boat = p ? boatLabel(p) : (a.lancha?.nome ?? "Reserva");
                      const horas = p ? segHoras(p) : 0;
                      const dias = p ? daysBetween(p.data_instalacao, null) : null;
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.nome}</TableCell>
                          <TableCell>{p?.posicao ?? a.posicao ?? "—"}</TableCell>
                          <TableCell><span className={cn("font-medium", boatTextClass[boat])}>{boat}</span></TableCell>
                          <TableCell>{p?.data_instalacao ? new Date(p.data_instalacao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{dias != null ? `${dias.toLocaleString("pt-BR")}d` : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{Math.round(horas).toLocaleString("pt-BR")}h</TableCell>
                        </TableRow>
                      );
                    })}
                    {motorAtivos.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum motor cadastrado</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Linha do Tempo</CardTitle>
                <div className="flex gap-3 text-xs flex-wrap">
                  {Object.entries(boatColorClass).map(([name, cls]) => (
                    <span key={name} className="flex items-center gap-1">
                      <span className={cn("h-3 w-3 rounded-sm", cls)} />{name}
                    </span>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {uniqueMotors.map(([mId, name]) => {
                const segs = motorPositions
                  .filter((p: any) => p.ativo_id === mId)
                  .sort((a: any, b: any) => a.data_instalacao.localeCompare(b.data_instalacao));
                if (segs.length === 0) return null;
                const horasArr = segs.map((p: any) => Math.max(segHoras(p), 1));
                const total = horasArr.reduce((s: number, h: number) => s + h, 0);
                return (
                  <div key={mId} className="mb-4">
                    <p className="text-sm font-medium mb-1">{name}</p>
                    <div className="flex h-8 rounded-lg overflow-hidden gap-0.5">
                      {segs.map((p: any, idx: number) => {
                        const boat = boatLabel(p);
                        const hrs = horasArr[idx];
                        const realHrs = segHoras(p);
                        return (
                          <div key={p.id}
                            className={cn("flex items-center justify-center text-xs font-medium text-primary-foreground cursor-pointer hover:opacity-80 transition-opacity", boatColorClass[boat] ?? "bg-muted")}
                            style={{ flex: hrs / total }}
                            title={`${boat} (${p.posicao ?? "—"}): ${p.data_instalacao} → ${p.data_remocao ?? "atual"} — ${Math.round(realHrs)}h`}>
                            {hrs > total * 0.08 ? `${Math.round(realHrs)}h` : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Histórico de Posições</CardTitle>
                <Select value={filterMotor} onValueChange={setFilterMotor}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueMotors.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
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
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((p: any) => {
                      const boat = boatLabel(p);
                      const horas = segHoras(p);
                      const dias = daysBetween(p.data_instalacao, p.data_remocao);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.ativo?.nome}</TableCell>
                          <TableCell><span className={cn("font-medium", boatTextClass[boat])}>{boat}</span></TableCell>
                          <TableCell>{p.posicao ?? "—"}</TableCell>
                          <TableCell>{new Date(p.data_instalacao).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell>{p.data_remocao ? new Date(p.data_remocao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{dias != null ? `${dias.toLocaleString("pt-BR")}d` : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{Math.round(horas).toLocaleString("pt-BR")}h</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <MotorPositionModal
            open={swapOpen}
            onClose={() => setSwapOpen(false)}
            motorAtivos={motorAtivos}
            posicoes={motorPositions}
            currentByLanchaPosicao={currentByLanchaPosicao}
          />
        </>
      )}
    </div>
  );
}
