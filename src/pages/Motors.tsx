import { useMemo, useState } from "react";
import { usePosicoes, useAtivos, useLanchas, useSituacaoAtual } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

// Cores específicas por lancha + posição (BB/BE) usadas na Linha do Tempo
const segmentColor = (boat: string, posicao?: string | null): string => {
  const pos = (posicao ?? "").toUpperCase();
  if (boat === "Flexeiras") return pos === "BE" ? "#2E75B6" : "#1E3A5F";
  if (boat === "Fortim") return pos === "BE" ? "#2ECC71" : "#1A5C38";
  if (boat === "Taíba") return pos === "BE" ? "#E8C96D" : "#C9A84C";
  return "#E8603C"; // Reserva (sem posição)
};

const TIMELINE_LEGEND: { label: string; color: string }[] = [
  { label: "Flexeiras BB", color: "#1E3A5F" },
  { label: "Flexeiras BE", color: "#2E75B6" },
  { label: "Fortim BB", color: "#1A5C38" },
  { label: "Fortim BE", color: "#2ECC71" },
  { label: "Taíba BB", color: "#C9A84C" },
  { label: "Taíba BE", color: "#E8C96D" },
  { label: "Reserva", color: "#E8603C" },
];

export default function Motors() {
  const { data: posicoes, isLoading } = usePosicoes();
  const { data: ativos, isLoading: loadingAtivos } = useAtivos();
  const { data: lanchas } = useLanchas();
  const { data: situacaoAtual } = useSituacaoAtual();
  const [filterMotor, setFilterMotor] = useState("all");
  const [swapOpen, setSwapOpen] = useState(false);

  const motorPositions = useMemo(() => (posicoes ?? []).filter((p: any) => p.ativo?.tipo === "motor"), [posicoes]);
  const motorAtivos = useMemo(() => (ativos ?? []).filter((a: any) => a.tipo === "motor"), [ativos]);

  const lanchaById = useMemo(() => {
    const m = new Map<string, any>();
    (lanchas ?? []).forEach((l: any) => m.set(l.id, l));
    return m;
  }, [lanchas]);

  const situacaoByAtivo = useMemo(() => {
    const m = new Map<string, any>();
    (situacaoAtual ?? []).forEach((s: any) => m.set(s.ativo_id, s));
    return m;
  }, [situacaoAtual]);

  const currentByAtivo = useMemo(() => {
    const map = new Map<string, any>();
    motorPositions
      .filter((p: any) => !p.data_remocao)
      .forEach((p: any) => { if (!map.has(p.ativo_id)) map.set(p.ativo_id, p); });
    return map;
  }, [motorPositions]);

  const currentByLanchaPosicao = useMemo(() => {
    const map = new Map<string, any>();
    motorPositions
      .filter((p: any) => !p.data_remocao && p.lancha_id && p.posicao)
      .forEach((p: any) => { const k = `${p.lancha_id}|${p.posicao}`; if (!map.has(k)) map.set(k, p); });
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

  const fmtDate = (iso: string | null): string => {
    if (!iso) return "—";
    const [ano, mes, dia] = iso.slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
  };

  const daysBetween = (start?: string | null, end?: string | null) => {
    if (!start) return null;
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    if (isNaN(s) || isNaN(e)) return null;
    return Math.max(Math.floor((e - s) / 86400000), 0);
  };

  const isReserva = (p: any) => {
    const pos = (p.posicao ?? "").toLowerCase();
    return !p.lancha_id || pos === "reserva" || pos === "retirica";
  };

  // horas estimadas para um segmento (usa lancha atual se posição ainda aberta)
  const segHoras = (p: any) => {
    if (isReserva(p)) return 0; // em reserva: sem horímetro
    if (p.data_remocao) return Math.max(Number(p.horas_operadas ?? 0), 0);
    const lancha = lanchaById.get(p.lancha_id);
    if (!lancha) return Number(p.horas_operadas ?? 0);
    return Math.max(Number(lancha.horimetro ?? 0) - Number(p.horimetro_lancha_instalacao ?? 0), 0);
  };

  const horasOperadasByAtivo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of motorPositions) {
      if (isReserva(p)) continue;
      m.set(p.ativo_id, (m.get(p.ativo_id) ?? 0) + segHoras(p));
    }
    return m;
  }, [motorPositions, lanchaById]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestão de Motores</h1>
        <p className="text-sm text-accent">Posição e histórico dos motores da frota</p>
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
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">Horas desde overhaul</TooltipTrigger>
                          <TooltipContent>Horas acumuladas desde o último overhaul do equipamento (Horímetro atual - Horímetro do último overhaul)</TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">Horas operadas</TooltipTrigger>
                          <TooltipContent>Total de horas operadas em todas as lanchas (excluindo períodos em reserva/retífica)</TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {motorAtivos.map((a: any) => {
                      const p = currentByAtivo.get(a.id);
                      const boat = p ? boatLabel(p) : (a.lancha?.nome ?? "Reserva");

                      const situacao = situacaoByAtivo.get(a.id);
                      const horasDesdeOverhaul =
                        situacao && situacao.horimetro_overhaul != null
                          ? situacao.horas_equipamento_calculadas - situacao.horimetro_overhaul
                          : null;

                      const horasOperadas = horasOperadasByAtivo.get(a.id) ?? null;

                      const fmtH = (v: number | null | undefined) =>
                        v == null || v === 0 ? "—" : `${Math.round(Number(v)).toLocaleString("pt-BR")}h`;

                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.nome}</TableCell>
                          <TableCell>{p?.posicao ?? a.posicao ?? "—"}</TableCell>
                          <TableCell><span className={cn("font-medium", boatTextClass[boat])}>{boat}</span></TableCell>
                          <TableCell>{fmtDate(p?.data_instalacao ?? null)}</TableCell>
                          <TableCell className="text-right">{fmtH(horasDesdeOverhaul)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtH(horasOperadas)}</TableCell>
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
                  {TIMELINE_LEGEND.map((item) => (
                    <span key={item.label} className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}
                    </span>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const allDates: number[] = [];
                motorPositions.forEach((p: any) => {
                  if (p.data_instalacao) allDates.push(new Date(p.data_instalacao).getTime());
                  if (p.data_remocao) allDates.push(new Date(p.data_remocao).getTime());
                });
                if (allDates.length === 0) return <p className="text-sm text-muted-foreground">Sem dados.</p>;
                const nowTs = Date.now();
                allDates.push(nowTs);
                const minTs = Math.min(...allDates);
                const maxTs = Math.max(...allDates);
                const startD = new Date(minTs); startD.setDate(1); startD.setHours(0,0,0,0);
                const endD = new Date(maxTs); endD.setMonth(endD.getMonth() + 1, 1); endD.setHours(0,0,0,0);
                const startTs = startD.getTime();
                const endTs = endD.getTime();
                const span = endTs - startTs;
                const pct = (ts: number) => ((ts - startTs) / span) * 100;

                const ticks: { label: string; left: number }[] = [];
                const cur = new Date(startD);
                while (cur.getTime() <= endTs) {
                  if (cur.getMonth() % 3 === 0) {
                    const m = cur.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                    ticks.push({ label: `${m} ${cur.getFullYear()}`, left: pct(cur.getTime()) });
                  }
                  cur.setMonth(cur.getMonth() + 1);
                }

                const Y_LABEL_W = 96;
                const ROW_H = 32;
                const AXIS_H = 24;

                return (
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: 900 }}>
                      <div className="flex">
                        <div style={{ width: Y_LABEL_W }} className="shrink-0" />
                        <div className="relative flex-1 border-b border-border" style={{ height: AXIS_H }}>
                          {ticks.map((t, i) => (
                            <div
                              key={i}
                              className="absolute top-0 h-full text-[10px] text-muted-foreground"
                              style={{ left: `${t.left}%`, transform: "translateX(-50%)" }}
                            >
                              <div className="h-2 border-l border-border mx-auto w-px" />
                              <span className="whitespace-nowrap">{t.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <TooltipProvider delayDuration={150}>
                        {uniqueMotors.map(([mId, name]) => {
                          const segs = motorPositions
                            .filter((p: any) => p.ativo_id === mId)
                            .sort((a: any, b: any) => a.data_instalacao.localeCompare(b.data_instalacao));
                          return (
                            <div key={mId} className="flex items-center border-b border-border/40" style={{ height: ROW_H + 8 }}>
                              <div style={{ width: Y_LABEL_W }} className="shrink-0 pr-2 text-xs font-medium truncate">
                                {name}
                              </div>
                              <div className="relative flex-1 bg-muted/30 rounded" style={{ height: ROW_H }}>
                                {ticks.map((t, i) => (
                                  <div
                                    key={i}
                                    className="absolute top-0 bottom-0 border-l border-border/30"
                                    style={{ left: `${t.left}%` }}
                                  />
                                ))}
                                {segs.map((p: any) => {
                                  const s = new Date(p.data_instalacao).getTime();
                                  const e = p.data_remocao ? new Date(p.data_remocao).getTime() : nowTs;
                                  const left = pct(s);
                                  const width = Math.max(pct(e) - left, 0.3);
                                  const boat = boatLabel(p);
                                  const reserva = isReserva(p);
                                  const dias = daysBetween(p.data_instalacao, p.data_remocao) ?? 0;
                                  const horasFmt = Math.round(segHoras(p)).toLocaleString("pt-BR");
                                  const bg = segmentColor(boat, p.posicao);
                                  const fimLabel = p.data_remocao ? fmtDate(p.data_remocao) : "atual";
                                  const tooltip = reserva
                                    ? `Reserva: ${fmtDate(p.data_instalacao)} → ${fimLabel} — ${dias}d`
                                    : `${boat} (${p.posicao ?? "—"}): ${fmtDate(p.data_instalacao)} → ${fimLabel} — ${horasFmt}h / ${dias}d`;
                                  const showLabel = width > 6;
                                  return (
                                    <Tooltip key={p.id}>
                                      <TooltipTrigger asChild>
                                        <div
                                          className="absolute top-0 h-full rounded-sm flex items-center justify-center text-[10px] font-medium text-primary-foreground cursor-pointer hover:opacity-80 transition-opacity overflow-hidden whitespace-nowrap"
                                          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: bg }}
                                        >
                                          {showLabel && `${dias}d`}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{tooltip}</TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })()}
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
                          <TableCell>{fmtDate(p.data_instalacao)}</TableCell>
                          <TableCell>{fmtDate(p.data_remocao)}</TableCell>
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
