import { useState, useMemo, useEffect } from "react";
import { useProvasMar, type ProvaMar } from "@/hooks/useFleetData";
import { DESCRICOES_PROVA } from "@/pages/ProvasMarRegistrar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

// ── Constants ────────────────────────────────────────────────────────────────

const LANCHAS_ORDER = ["Flexeiras", "Fortim", "Taíba"];

const LANCHA_COLORS: Record<string, string> = {
  Flexeiras: "#2563EB",
  Fortim:    "#16A34A",
  "Taíba":   "#F97316",
};

const CYCLE_LINES = [
  { key: "preVel",    rpmKey: "preRpm",    label: "Pré-Doc",  color: "#6B7280" },
  { key: "posVel",    rpmKey: "posRpm",    label: "Pós-Doc",  color: "#16A34A" },
  { key: "mes1Vel",   rpmKey: "mes1Rpm",   label: "1 mês",    color: "#EAB308" },
  { key: "mes2Vel",   rpmKey: "mes2Rpm",   label: "2 meses",  color: "#F97316" },
  { key: "mes3Vel",   rpmKey: "mes3Rpm",   label: "3 meses",  color: "#EF4444" },
  { key: "preSegVel", rpmKey: "preSegRpm", label: "Pré-Seg",  color: "#991B1B" },
];

// Maps CYCLE_LINES velocity key → canonical description
const LINE_DESC_MAP: Record<string, string> = {
  preVel:    "Pré-Docagem",
  posVel:    "Pós-Docagem",
  mes1Vel:   "1 mês Pós-Docagem",
  mes2Vel:   "2 meses Pós-Docagem",
  mes3Vel:   "3 meses Pós-Docagem",
  preSegVel: "Pré-Docagem seguinte",
};

// Short display labels for toggle buttons
const DESC_SHORT: Record<string, string> = {
  "Pré-Docagem":          "Pré-Doc",
  "Pós-Docagem":          "Pós-Doc",
  "1 mês Pós-Docagem":    "1 mês",
  "2 meses Pós-Docagem":  "2 meses",
  "3 meses Pós-Docagem":  "3 meses",
  "Pré-Docagem seguinte": "Pré-Seg",
};

type CicloDescKey = "posDocagem" | "mes1" | "mes2" | "mes3" | "preSeguinte";

const DEGRAD_STAGES: Array<{ key: CicloDescKey; label: string }> = [
  { key: "posDocagem",  label: "Pós-Doc"  },
  { key: "mes1",        label: "1 mês"    },
  { key: "mes2",        label: "2 meses"  },
  { key: "mes3",        label: "3 meses"  },
  { key: "preSeguinte", label: "Pré-Seg"  },
];

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// ── Types ────────────────────────────────────────────────────────────────────

type CicloDocagem = {
  cicloNum: number;
  dataPos: string;
  preDocagem?: ProvaMar;
  posDocagem?: ProvaMar;
  mes1?: ProvaMar;
  mes2?: ProvaMar;
  mes3?: ProvaMar;
  preSeguinte?: ProvaMar;
};

type ScorecardData = {
  lancha: string;
  numCiclos: number;
  ganhoMedio: number | null;
  perdaTotal: number | null;
  perdaMensal: number | null;
};

type CicloPoint = {
  cicloNum: number;
  cicloLabel: string;
  preVel: number | null;    posVel: number | null;    mes1Vel: number | null;
  mes2Vel: number | null;   mes3Vel: number | null;   preSegVel: number | null;
  preRpm: number | null;    posRpm: number | null;    mes1Rpm: number | null;
  mes2Rpm: number | null;   mes3Rpm: number | null;   preSegRpm: number | null;
  _ciclo: CicloDocagem;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtDateShort(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-");
  return `${m}/${y.slice(2)}`;
}

function fmtNum(v: number | null | undefined, dec = 1): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ── Description normalization ────────────────────────────────────────────────
// Handles case, accents and hyphen/space variations across lanchas

function normalizeDesc(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]+/g, " ");
}

const DESC_CANON: Record<string, string> = {
  "pre docagem":          "PRE",
  "pos docagem":          "POS",
  "1 mes pos docagem":    "M1",
  "2 meses pos docagem":  "M2",
  "3 meses pos docagem":  "M3",
  "pre docagem seguinte": "PRE_SEG",
};

function getDescCanon(d: string): string | null {
  return DESC_CANON[normalizeDesc(d)] ?? null;
}

// ── Cycle building ────────────────────────────────────────────────────────────

function buildCiclos(provas: ProvaMar[]): CicloDocagem[] {
  const sorted = [...provas].sort((a, b) => a.data.localeCompare(b.data));

  // Log unmapped descriptions to help diagnose data issues
  const unmapped = [...new Set(sorted.map(p => p.descricao).filter(d => !getDescCanon(d)))];
  if (unmapped.length > 0) {
    console.warn("[buildCiclos] Descrições não mapeadas:", unmapped);
  }

  const posAnchors = sorted.filter(p => getDescCanon(p.descricao) === "POS");
  if (posAnchors.length === 0) return [];

  return posAnchors.reduce<CicloDocagem[]>((acc, pos, i) => {
    const prevDate = posAnchors[i - 1]?.data ?? "0000-00-00";
    const nextDate = posAnchors[i + 1]?.data ?? "9999-99-99";

    // Explicit Pré-Docagem before this anchor
    const preDoc = sorted
      .filter(p => getDescCanon(p.descricao) === "PRE" && p.data <= pos.data && p.data > prevDate)
      .slice(-1)[0];

    // Fallback: preSeguinte from the previous cycle (same physical measurement)
    const preDocFallback = acc[i - 1]?.preSeguinte;

    const after = sorted.filter(p => p.data > pos.data && p.data < nextDate);

    acc.push({
      cicloNum: i + 1,
      dataPos: pos.data,
      preDocagem: preDoc ?? preDocFallback,
      posDocagem: pos,
      mes1: after.find(p => getDescCanon(p.descricao) === "M1"),
      mes2: after.find(p => getDescCanon(p.descricao) === "M2"),
      mes3: after.find(p => getDescCanon(p.descricao) === "M3"),
      preSeguinte: after.filter(p => getDescCanon(p.descricao) === "PRE_SEG").slice(-1)[0],
    });

    return acc;
  }, []);
}

function computeScorecard(lancha: string, ciclos: CicloDocagem[]): ScorecardData {
  const completos = ciclos.filter(c =>
    c.posDocagem?.velocidade != null &&
    c.preDocagem?.velocidade != null &&
    c.preSeguinte?.velocidade != null
  );

  const ganhos  = completos.map(c => c.posDocagem!.velocidade! - c.preDocagem!.velocidade!);
  const perdas  = completos.map(c => c.posDocagem!.velocidade! - c.preSeguinte!.velocidade!);
  const mensais = completos
    .map(c => {
      const dias = (new Date(c.preSeguinte!.data).getTime() - new Date(c.posDocagem!.data).getTime()) / 86_400_000;
      const meses = dias / 30;
      return meses > 0 ? (c.posDocagem!.velocidade! - c.preSeguinte!.velocidade!) / meses : null;
    })
    .filter((v): v is number => v !== null);

  return {
    lancha,
    numCiclos: ciclos.length,
    ganhoMedio: avg(ganhos),
    perdaTotal: avg(perdas),
    perdaMensal: avg(mensais),
  };
}

function buildCicloPoints(ciclos: CicloDocagem[]): CicloPoint[] {
  return ciclos.map(c => ({
    cicloNum: c.cicloNum,
    cicloLabel: `C${c.cicloNum} ${fmtDateShort(c.dataPos)}`,
    preVel:    c.preDocagem?.velocidade  ?? null,
    posVel:    c.posDocagem?.velocidade  ?? null,
    mes1Vel:   c.mes1?.velocidade        ?? null,
    mes2Vel:   c.mes2?.velocidade        ?? null,
    mes3Vel:   c.mes3?.velocidade        ?? null,
    preSegVel: c.preSeguinte?.velocidade ?? null,
    preRpm:    c.preDocagem?.rpm         ?? null,
    posRpm:    c.posDocagem?.rpm         ?? null,
    mes1Rpm:   c.mes1?.rpm               ?? null,
    mes2Rpm:   c.mes2?.rpm               ?? null,
    mes3Rpm:   c.mes3?.rpm               ?? null,
    preSegRpm: c.preSeguinte?.rpm        ?? null,
    _ciclo: c,
  }));
}

// ── Custom Tooltips ───────────────────────────────────────────────────────────

function CicloTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload as CicloPoint;
  return (
    <div className="bg-white border border-border rounded-md px-3 py-2 text-xs shadow-md space-y-0.5 max-w-56">
      <p className="font-semibold mb-1">{`Ciclo ${pt.cicloNum} — ${fmtDate(pt._ciclo.dataPos)}`}</p>
      {CYCLE_LINES.map(cfg => {
        const vel = (pt as any)[cfg.key] as number | null;
        const rpm = (pt as any)[cfg.rpmKey] as number | null;
        if (vel == null && rpm == null) return null;
        return (
          <p key={cfg.key} style={{ color: cfg.color }}>
            {cfg.label}:{" "}
            {vel != null ? `${fmtNum(vel)} nós` : "—"}
            {rpm != null ? ` | ${fmtNum(rpm, 0)} RPM` : ""}
          </p>
        );
      })}
      <p className="text-muted-foreground mt-1 pt-1 border-t border-border">Clique para detalhes</p>
    </div>
  );
}

function GanhoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-md px-3 py-2 text-xs shadow-md space-y-0.5">
      <p className="font-semibold">{fmtDate(payload[0]?.payload?.dataPos)}</p>
      {payload.map((e: any) =>
        e.value != null ? (
          <p key={e.dataKey} style={{ color: e.color }}>
            {e.name}: {e.value >= 0 ? "+" : ""}{fmtNum(e.value)} nós
          </p>
        ) : null
      )}
    </div>
  );
}

// ── CicloModal ────────────────────────────────────────────────────────────────

function CicloModal({
  ciclo, lancha, onClose,
}: { ciclo: CicloDocagem | null; lancha: string; onClose: () => void }) {
  if (!ciclo) return null;

  const records = [
    ciclo.preDocagem,
    ciclo.posDocagem,
    ciclo.mes1,
    ciclo.mes2,
    ciclo.mes3,
    ciclo.preSeguinte,
  ].filter((r): r is ProvaMar => r != null);

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lancha} — Ciclo {ciclo.cicloNum} — {fmtDate(ciclo.dataPos)}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Veloc. (nós)</TableHead>
                <TableHead className="text-right">RPM</TableHead>
                <TableHead className="text-right">Consumo</TableHead>
                <TableHead>Porto</TableHead>
                <TableHead className="text-center">Vento</TableHead>
                <TableHead className="text-center">Mar</TableHead>
                <TableHead>Mestre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Sem registros neste ciclo
                  </TableCell>
                </TableRow>
              ) : records.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm whitespace-nowrap">{r.descricao}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(r.data)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtNum(r.velocidade)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtNum(r.rpm, 0)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {r.consumo_lts_hora != null ? fmtNum(r.consumo_lts_hora) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{r.porto ?? "—"}</TableCell>
                  <TableCell className="text-center text-sm">
                    {r.vento_de_popa === true ? "Sim" : r.vento_de_popa === false ? "Não" : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {r.mar_calmo === true ? "Sim" : r.mar_calmo === false ? "Não" : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{r.mestre ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ScorecardCard ─────────────────────────────────────────────────────────────

function ScorecardCard({ data }: { data: ScorecardData }) {
  const { lancha, numCiclos, ganhoMedio, perdaTotal, perdaMensal } = data;
  const color = LANCHA_COLORS[lancha] ?? "#6B7280";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {lancha}
          <span className="text-xs text-muted-foreground font-normal ml-auto">
            {numCiclos} ciclo{numCiclos !== 1 ? "s" : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-muted-foreground text-xs">Ganho Pré→Pós</span>
          <span
            className="font-mono font-semibold"
            style={{ color: ganhoMedio != null && ganhoMedio >= 0 ? "#16A34A" : "#DC2626" }}
          >
            {ganhoMedio != null
              ? `${ganhoMedio >= 0 ? "+" : ""}${fmtNum(ganhoMedio)} nós`
              : "—"}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-muted-foreground text-xs">Perda total/docagem</span>
          <span className="font-mono font-semibold text-red-600">
            {perdaTotal != null ? `-${fmtNum(perdaTotal)} nós` : "—"}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-muted-foreground text-xs">Perda/mês</span>
          <span className="font-mono font-semibold text-orange-500">
            {perdaMensal != null ? `-${fmtNum(perdaMensal)} nós/mês` : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProvasMarEstatisticas() {
  const { data: provas, isLoading } = useProvasMar();

  const [selectedLanchas, setSelectedLanchas]       = useState<string[]>([...LANCHAS_ORDER]);
  const [filterDe, setFilterDe]                     = useState("");
  const [filterAte, setFilterAte]                   = useState("");
  // Multi-select: which description lines to SHOW in the cycle charts
  const [filterDescricoes, setFilterDescricoes]     = useState<string[]>([...DESCRICOES_PROVA]);
  const [modalState, setModalState]                 = useState<{ ciclo: CicloDocagem; lancha: string } | null>(null);

  function toggleLancha(nome: string) {
    setSelectedLanchas(prev =>
      prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]
    );
  }

  function toggleDescricao(desc: string) {
    setFilterDescricoes(prev =>
      prev.includes(desc) ? prev.filter(d => d !== desc) : [...prev, desc]
    );
  }

  // ── Data pipeline ──────────────────────────────────────────────────────────
  // Only date + lancha filter applied before buildCiclos; description filter
  // is visual-only (controls which lines appear in the cycle chart).

  const ciclosByLancha = useMemo(() => {
    return Object.fromEntries(LANCHAS_ORDER.map(lanchaName => {
      const byDate = (provas ?? []).filter(p => {
        if (p.lanchas?.nome !== lanchaName) return false;
        if (filterDe && p.data < filterDe) return false;
        if (filterAte && p.data > filterAte) return false;
        return true;
      });
      return [lanchaName, buildCiclos(byDate)];
    }));
  }, [provas, filterDe, filterAte]);

  // Scorecards use the full (unfiltered by description) cycle set
  const scorecards = useMemo(() =>
    Object.fromEntries(LANCHAS_ORDER.map(l => [l, computeScorecard(l, ciclosByLancha[l] ?? [])])),
    [ciclosByLancha]
  );

  const cicloPointsByLancha = useMemo(() =>
    Object.fromEntries(LANCHAS_ORDER.map(l => [l, buildCicloPoints(ciclosByLancha[l] ?? [])])),
    [ciclosByLancha]
  );

  // Ganho chart: full dataset, one point per cycle with pre+pos velocidade
  const ganhoChartData = useMemo(() => {
    const allDates = new Set<string>();
    for (const l of selectedLanchas) {
      (ciclosByLancha[l] ?? []).forEach(c => {
        if (c.posDocagem?.velocidade != null && c.preDocagem?.velocidade != null) {
          allDates.add(c.dataPos);
        }
      });
    }
    return [...allDates].sort().map(dataPos => {
      const pt: Record<string, unknown> = { dataPos };
      for (const l of selectedLanchas) {
        const c = (ciclosByLancha[l] ?? []).find(x => x.dataPos === dataPos);
        if (c?.posDocagem?.velocidade != null && c?.preDocagem?.velocidade != null) {
          pt[l] = c.posDocagem.velocidade - c.preDocagem.velocidade;
        }
      }
      return pt;
    });
  }, [ciclosByLancha, selectedLanchas]);

  // Degradação chart: full dataset, average velocity at each stage
  const degradacaoData = useMemo(() =>
    DEGRAD_STAGES.map(stage => {
      const pt: Record<string, unknown> = { desc: stage.label };
      for (const l of selectedLanchas) {
        const vels = (ciclosByLancha[l] ?? [])
          .map(c => c[stage.key]?.velocidade)
          .filter((v): v is number => v != null);
        pt[l] = avg(vels);
      }
      return pt;
    }),
    [ciclosByLancha, selectedLanchas]
  );

  const totalCiclos = selectedLanchas.reduce((s, l) => s + (ciclosByLancha[l]?.length ?? 0), 0);
  const hasFilters = filterDe !== "" || filterAte !== "" || filterDescricoes.length < DESCRICOES_PROVA.length;

  // Lines visible in cycle chart based on description filter
  const visibleLines = CYCLE_LINES.filter(cfg => filterDescricoes.includes(LINE_DESC_MAP[cfg.key]));

  // ── Debug: log cycle stats per lancha ─────────────────────────────────────
  useEffect(() => {
    if (!provas || provas.length === 0) return;
    console.table(
      LANCHAS_ORDER.map(l => ({
        lancha: l,
        totalRegistros: (provas ?? []).filter(p => p.lanchas?.nome === l).length,
        ciclos: ciclosByLancha[l]?.length ?? 0,
        ciclosCompletos: ciclosByLancha[l]?.filter(c => c.preDocagem && c.posDocagem).length ?? 0,
        ciclosComPreSeg: ciclosByLancha[l]?.filter(c => c.posDocagem && c.preSeguinte).length ?? 0,
        descricoesUnicas: JSON.stringify([...new Set(
          (provas ?? []).filter(p => p.lanchas?.nome === l).map(p => p.descricao)
        )]),
      }))
    );
  }, [provas, ciclosByLancha]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Estatísticas de Provas de Mar</h1>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estatísticas de Provas de Mar</h1>
        <p className="text-sm text-accent">Análise de desempenho por ciclo de docagem</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Lancha toggles */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Lanchas</span>
              <div className="flex gap-2">
                {LANCHAS_ORDER.map(nome => {
                  const selected = selectedLanchas.includes(nome);
                  const color = LANCHA_COLORS[nome];
                  return (
                    <button
                      key={nome}
                      onClick={() => toggleLancha(nome)}
                      className="px-3 py-1.5 text-xs rounded-md font-medium border transition-colors"
                      style={{
                        borderColor: color,
                        backgroundColor: selected ? color : "transparent",
                        color: selected ? "white" : color,
                      }}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date range */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={filterDe} onChange={e => setFilterDe(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Até</span>
              <input type="date" value={filterAte} onChange={e => setFilterAte(e.target.value)} className={inputClass} />
            </div>

            {/* Descrição multi-select (controls chart lines only) */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Linhas do gráfico</span>
              <div className="flex flex-wrap gap-1.5">
                {DESCRICOES_PROVA.map(desc => {
                  const selected = filterDescricoes.includes(desc);
                  const cfg = CYCLE_LINES.find(c => LINE_DESC_MAP[c.key] === desc);
                  const color = cfg?.color ?? "#6B7280";
                  return (
                    <button
                      key={desc}
                      onClick={() => toggleDescricao(desc)}
                      className="px-2.5 py-1 text-xs rounded-md font-medium border transition-colors"
                      style={{
                        borderColor: color,
                        backgroundColor: selected ? color : "transparent",
                        color: selected ? "white" : color,
                      }}
                    >
                      {DESC_SHORT[desc] ?? desc}
                    </button>
                  );
                })}
              </div>
            </div>

            {hasFilters && (
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  setFilterDe("");
                  setFilterAte("");
                  setFilterDescricoes([...DESCRICOES_PROVA]);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {totalCiclos === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum ciclo de docagem encontrado para os filtros selecionados
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Scorecards — always use full dataset, unaffected by description filter */}
          {selectedLanchas.length > 0 && (
            <div className={`grid gap-4 ${
              selectedLanchas.length === 1 ? "grid-cols-1 max-w-xs" :
              selectedLanchas.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
              "grid-cols-1 sm:grid-cols-3"
            }`}>
              {selectedLanchas.map(l => (
                <ScorecardCard key={l} data={scorecards[l]} />
              ))}
            </div>
          )}

          {/* Per-lancha cycle chart — description filter controls visible lines */}
          {selectedLanchas.map(lancha => {
            const pts = cicloPointsByLancha[lancha] ?? [];
            if (pts.length === 0) return null;
            return (
              <Card key={lancha}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COLORS[lancha] }} />
                    {lancha} — Evolução por Ciclo de Docagem
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Velocidade (eixo esq.) · RPM tracejado (eixo dir.) · Clique no gráfico para ver detalhes do ciclo
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Chart 1 — Velocidade (nós) */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Velocidade (nós)</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart
                        data={pts}
                        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                        onClick={chartData => {
                          const payload = chartData?.activePayload?.[0]?.payload as CicloPoint | undefined;
                          if (payload?._ciclo) setModalState({ ciclo: payload._ciclo, lancha });
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="cicloLabel" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }} domain={["auto", "auto"]}
                          label={{ value: "nós", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                        />
                        <Tooltip content={<CicloTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {visibleLines.map(cfg => (
                          <Line
                            key={cfg.key} type="monotone" dataKey={cfg.key}
                            stroke={cfg.color} strokeWidth={2}
                            dot={{ r: 4, fill: cfg.color }} activeDot={{ r: 6 }}
                            name={cfg.label} connectNulls={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Chart 2 — RPM */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">RPM</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart
                        data={pts}
                        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                        onClick={chartData => {
                          const payload = chartData?.activePayload?.[0]?.payload as CicloPoint | undefined;
                          if (payload?._ciclo) setModalState({ ciclo: payload._ciclo, lancha });
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="cicloLabel" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }} domain={["auto", "auto"]}
                          label={{ value: "RPM", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                        />
                        <Tooltip content={<CicloTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {visibleLines.map(cfg => (
                          <Line
                            key={cfg.rpmKey} type="monotone" dataKey={cfg.rpmKey}
                            stroke={cfg.color} strokeWidth={2}
                            dot={{ r: 4, fill: cfg.color }} activeDot={{ r: 6 }}
                            name={`${cfg.label} RPM`} connectNulls={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Série temporal — Ganho por docagem (always full dataset) */}
          {ganhoChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ganho de Velocidade por Docagem (Pós − Pré)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={ganhoChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="dataPos" tickFormatter={fmtDateShort} tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }} domain={["auto", "auto"]}
                      tickFormatter={v => `${v >= 0 ? "+" : ""}${fmtNum(v)}`}
                      label={{ value: "nós", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                    />
                    <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="3 3" />
                    <Tooltip content={<GanhoTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedLanchas.map(l => (
                      <Line
                        key={l} type="monotone" dataKey={l} stroke={LANCHA_COLORS[l]}
                        strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}
                        name={l} connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Série temporal — Degradação entre docagens (always full dataset) */}
          {degradacaoData.some(pt => selectedLanchas.some(l => pt[l] != null)) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Curva de Degradação Média entre Docagens</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={degradacaoData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="desc" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 10 }} domain={["auto", "auto"]}
                      label={{ value: "nós", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }}
                    />
                    <Tooltip formatter={(value: number, name: string) => [`${fmtNum(value)} nós`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedLanchas.map(l => (
                      <Line
                        key={l} type="monotone" dataKey={l} stroke={LANCHA_COLORS[l]}
                        strokeWidth={2} dot={{ r: 5 }} activeDot={{ r: 7 }}
                        name={l} connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal de detalhes do ciclo */}
      <CicloModal
        ciclo={modalState?.ciclo ?? null}
        lancha={modalState?.lancha ?? ""}
        onClose={() => setModalState(null)}
      />
    </div>
  );
}
