import { useState, useMemo, useRef, useCallback } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

type SegType = "operante" | "corretiva" | "preventiva" | "restricao" | "deslocamento";

const SEG_COLOR: Record<SegType, string> = {
  operante:     "#22c55e",
  corretiva:    "#ef4444",
  preventiva:   "#f59e0b",
  restricao:    "#fbbf24",
  deslocamento: "#3b82f6",
};

const SEG_LABEL: Record<SegType, string> = {
  operante:     "Operante",
  corretiva:    "Inoperante — corretiva",
  preventiva:   "Inoperante — preventiva",
  restricao:    "Com restrições",
  deslocamento: "Deslocamento",
};

const TIMELINE_LANCHAS = [
  { cd: 121,  nome: "Flexeiras", cor: "#2563EB" },
  { cd: 1003, nome: "Fortim",    cor: "#16A34A" },
  { cd: 117,  nome: "Taíba",     cor: "#F97316" },
];

const LABEL_W = 80; // px (matches Tailwind w-20)

// ── Types ─────────────────────────────────────────────────────────────────────

interface Seg {
  type: SegType;
  startMs: number;
  endMs: number;
  detail: string;
}

interface Pin {
  ms: number;
  porto: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyOcorrencia(efeito: string | null, tipo: string | null): SegType {
  const e = (efeito ?? "").trim().toLowerCase();
  const t = (tipo ?? "").toLowerCase();
  if (e === "inoperante") return t.includes("corretiva") ? "corretiva" : "preventiva";
  if (e.includes("restri")) return "restricao";
  return "restricao";
}

function buildSegs(
  cd: number,
  windowStart: number,
  windowEnd: number,
  ocorrencias: any[],
  fainas: any[],
): Seg[] {
  const segs: Seg[] = [];

  for (const o of ocorrencias) {
    if (Number(o.cd_lancha) !== cd) continue;
    const s = new Date(o.data_inicio).getTime();
    let e: number;
    if (o.data_fim) {
      e = new Date(o.data_fim).getTime();
    } else if (o.duracao_horas != null && Number(o.duracao_horas) > 0) {
      e = s + Number(o.duracao_horas) * 3_600_000;
    } else {
      e = windowEnd;
    }
    const cs = Math.max(s, windowStart);
    const ce = Math.min(e, windowEnd);
    if (cs >= ce) continue;
    segs.push({
      type: classifyOcorrencia(o.efeito, o.tipo_ocorrencia),
      startMs: cs,
      endMs: ce,
      detail: [o.tipo_ocorrencia, o.efeito].filter(Boolean).join(" — "),
    });
  }

  for (const f of fainas) {
    if (Number(f.cd_lancha) !== cd) continue;
    if (!f.dh_inicio || !f.dh_fim) continue;
    const s = new Date(f.dh_inicio).getTime();
    const e = new Date(f.dh_fim).getTime();
    const cs = Math.max(s, windowStart);
    const ce = Math.min(e, windowEnd);
    if (cs >= ce) continue;
    segs.push({
      type: "deslocamento",
      startMs: cs,
      endMs: ce,
      detail: `${f.ds_local_orig ?? "—"} → ${f.ds_local_dest ?? "—"}`,
    });
  }

  return segs;
}

function buildPins(
  cd: number,
  windowStart: number,
  windowEnd: number,
  manobras: any[],
): Pin[] {
  return manobras
    .filter(m => Number(m.cd_lancha) === cd && m.dh_manobra)
    .map(m => ({ ms: new Date(m.dh_manobra).getTime(), porto: m.ds_porto ?? "—" }))
    .filter(p => p.ms >= windowStart && p.ms <= windowEnd);
}

function fmtDt(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface LanchaTimelineProps {
  ocorrencias: any[];
  manobras: any[];
  fainas: any[];
}

export function LanchaTimeline({ ocorrencias, manobras, fainas }: LanchaTimelineProps) {
  const [days, setDays] = useState<14 | 21 | 30>(14);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Window: from N days ago to yesterday end-of-day
  const windowEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const windowStart = windowEnd - days * 24 * 3_600_000;
  const windowDuration = windowEnd - windowStart;

  // X-axis day ticks
  const ticks = useMemo(() => {
    const interval = days <= 14 ? 1 : days <= 21 ? 2 : 3;
    const result: { ms: number; label: string }[] = [];
    const cur = new Date(windowStart);
    cur.setHours(0, 0, 0, 0);
    cur.setDate(cur.getDate() + 1); // first midnight inside window
    while (cur.getTime() <= windowEnd) {
      result.push({
        ms: cur.getTime(),
        label: cur.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      });
      cur.setDate(cur.getDate() + interval);
    }
    return result;
  }, [windowStart, windowEnd, days]);

  // Per-lancha data (memo so it doesn't rebuild on tooltip hover)
  const lanchData = useMemo(() =>
    TIMELINE_LANCHAS.map(l => ({
      ...l,
      segs: buildSegs(l.cd, windowStart, windowEnd, ocorrencias, fainas),
      pins: buildPins(l.cd, windowStart, windowEnd, manobras),
    })),
  [windowStart, windowEnd, ocorrencias, fainas, manobras]);

  function pct(ms: number): number {
    return ((ms - windowStart) / windowDuration) * 100;
  }

  const onHover = useCallback((e: React.MouseEvent, lines: string[]) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, lines });
  }, []);

  // Period label
  const fmtDay = (ms: number) =>
    new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Linha do Tempo Operacional
          </span>
          <span className="ml-2 text-[10px] text-muted-foreground">
            {fmtDay(windowStart)} — {fmtDay(windowEnd)}
          </span>
        </div>
        <div className="flex overflow-hidden rounded border border-input">
          {([14, 21, 30] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-0.5 text-xs font-medium transition-colors ${
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Timeline rows */}
      <div ref={wrapRef} className="relative select-none" onMouseLeave={() => setTooltip(null)}>
        <div className="space-y-2">
          {lanchData.map(l => (
            <div key={l.cd} className="flex items-center gap-2">
              {/* Lancha label */}
              <div className="shrink-0 text-right" style={{ width: LABEL_W }}>
                <span className="text-xs font-semibold" style={{ color: l.cor }}>
                  {l.nome}
                </span>
              </div>

              {/* Track */}
              <div className="relative flex-1">
                {/* Clipped bar (segments stay within rounded corners) */}
                <div
                  className="relative h-7 rounded overflow-hidden"
                  style={{ backgroundColor: SEG_COLOR.operante }}
                >
                  {l.segs.map((seg, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full cursor-help"
                      style={{
                        left: `${pct(seg.startMs)}%`,
                        width: `${Math.max(0.15, pct(seg.endMs) - pct(seg.startMs))}%`,
                        backgroundColor: SEG_COLOR[seg.type],
                        zIndex: seg.type === "deslocamento" ? 2 : 1,
                      }}
                      onMouseEnter={e => onHover(e, [SEG_LABEL[seg.type], `${fmtDt(seg.startMs)} → ${fmtDt(seg.endMs)}`, seg.detail])}
                      onMouseMove={e => onHover(e, [SEG_LABEL[seg.type], `${fmtDt(seg.startMs)} → ${fmtDt(seg.endMs)}`, seg.detail])}
                    />
                  ))}
                </div>

                {/* Manobra pins (overlay, not clipped) */}
                <div className="absolute inset-0 pointer-events-none">
                  {l.pins.map((pin, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full pointer-events-auto cursor-help"
                      style={{
                        left: `${pct(pin.ms)}%`,
                        width: "2px",
                        transform: "translateX(-50%)",
                        zIndex: 10,
                      }}
                    >
                      <div
                        className="w-full h-full"
                        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                        onMouseEnter={e => onHover(e, ["▼ Manobra", fmtDt(pin.ms), pin.porto])}
                        onMouseMove={e => onHover(e, ["▼ Manobra", fmtDt(pin.ms), pin.porto])}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* X axis */}
        <div className="relative mt-1.5 h-4" style={{ marginLeft: LABEL_W + 8 }}>
          {ticks.map((tick, i) => (
            <span
              key={i}
              className="absolute text-[9px] text-muted-foreground leading-none"
              style={{ left: `${pct(tick.ms)}%`, transform: "translateX(-50%)" }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {/* Tooltip */}
        {tooltip && (() => {
          const containerW = wrapRef.current?.offsetWidth ?? 800;
          const flipLeft = tooltip.x > containerW - 210;
          return (
            <div
              className="absolute z-50 pointer-events-none bg-popover border border-border rounded-md shadow-lg px-2.5 py-1.5 text-xs space-y-0.5"
              style={{
                left: flipLeft ? tooltip.x - 185 : tooltip.x + 12,
                top: Math.max(0, tooltip.y - 10),
              }}
            >
              {tooltip.lines.map((line, i) => (
                <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                  {line}
                </p>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5" style={{ marginLeft: LABEL_W + 8 }}>
        {(Object.entries(SEG_COLOR) as [SegType, string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground">{SEG_LABEL[type]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
          <span className="text-[10px] text-muted-foreground">Manobra</span>
        </div>
      </div>
    </div>
  );
}
