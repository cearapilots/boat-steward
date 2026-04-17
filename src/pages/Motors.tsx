import { useMemo, useState } from "react";
import { usePosicoes } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
  const [filterMotor, setFilterMotor] = useState("all");

  const motorPositions = useMemo(() => (posicoes ?? []).filter((p: any) => p.ativo?.tipo === "motor"), [posicoes]);

  const current = useMemo(() => motorPositions.filter((p: any) => !p.data_remocao), [motorPositions]);
  const history = useMemo(
    () => filterMotor === "all" ? motorPositions : motorPositions.filter((p: any) => p.ativo_id === filterMotor),
    [motorPositions, filterMotor]
  );

  const uniqueMotors = useMemo(() => {
    const map = new Map<string, string>();
    motorPositions.forEach((p: any) => map.set(p.ativo_id, p.ativo?.nome ?? p.ativo_id));
    return Array.from(map.entries());
  }, [motorPositions]);

  const boatLabel = (p: any) => p.lancha?.nome ?? "Reserva";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestão de Motores</h1>
        <p className="text-sm text-muted-foreground">Posição e histórico dos motores da frota</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Posição Atual dos Motores</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motor</TableHead>
                      <TableHead>Posição</TableHead>
                      <TableHead>Lancha</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead className="text-right">Horas operadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {current.map((p: any) => {
                      const boat = boatLabel(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.ativo?.nome}</TableCell>
                          <TableCell>{p.posicao ?? "—"}</TableCell>
                          <TableCell><span className={cn("font-medium", boatTextClass[boat])}>{boat}</span></TableCell>
                          <TableCell>{new Date(p.data_instalacao).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell className="text-right font-mono">{Number(p.horas_operadas ?? 0).toLocaleString("pt-BR")}h</TableCell>
                        </TableRow>
                      );
                    })}
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
                const total = segs.reduce((s: number, p: any) => s + Math.max(Number(p.horas_operadas ?? 0), 1), 0);
                return (
                  <div key={mId} className="mb-4">
                    <p className="text-sm font-medium mb-1">{name}</p>
                    <div className="flex h-8 rounded-lg overflow-hidden gap-0.5">
                      {segs.map((p: any) => {
                        const boat = boatLabel(p);
                        const hrs = Math.max(Number(p.horas_operadas ?? 0), 1);
                        return (
                          <div key={p.id}
                            className={cn("flex items-center justify-center text-xs font-medium text-primary-foreground cursor-pointer hover:opacity-80 transition-opacity", boatColorClass[boat] ?? "bg-muted")}
                            style={{ flex: hrs / total }}
                            title={`${boat} (${p.posicao ?? "—"}): ${p.data_instalacao} → ${p.data_remocao ?? "atual"} — ${Math.round(Number(p.horas_operadas ?? 0))}h`}>
                            {hrs > total * 0.08 ? `${Math.round(Number(p.horas_operadas ?? 0))}h` : ""}
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
                      <TableHead className="text-right">Horas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((p: any) => {
                      const boat = boatLabel(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.ativo?.nome}</TableCell>
                          <TableCell><span className={cn("font-medium", boatTextClass[boat])}>{boat}</span></TableCell>
                          <TableCell>{p.posicao ?? "—"}</TableCell>
                          <TableCell>{new Date(p.data_instalacao).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell>{p.data_remocao ? new Date(p.data_remocao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{Number(p.horas_operadas ?? 0).toLocaleString("pt-BR")}h</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
