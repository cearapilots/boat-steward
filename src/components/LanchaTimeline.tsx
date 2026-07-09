import { useState, useMemo, useRef, useCallback } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────

type StatusType = "disponivel" | "corretiva" | "preventiva" | "projeto" | "restricao" | "deslocamento";

const STATUS_COLOR: Record<StatusType, string> = {
  disponivel:   "#10b981",
  corretiva:    "#ef4444",
  preventiva:   "#f59e0b",
  projeto:      "#8b5cf6",
  restricao:    "#f97316",
  deslocamento: "#94a3b8",
};

const STATUS_LABEL: Record<StatusType, string> = {
  disponivel:   "Disponível",
  corretiva:    "Manutenção corretiva",
  preventiva:   "Manutenção preventiva",
  projeto:      "Projeto de modificação/melhoria",
  restricao:    "Com restrições",
  deslocamento: "Deslocamento entre portos",
};

const PRIORIDADE: Record<string, number> = {
  corretiva:    5,
  preventiva:   4,
  projeto:      3,
  deslocamento: 2,
  restricao:    1,
  disponivel:   0,
};

function statusMaisGrave(a: string, b: string): string {
  return (PRIORIDADE[a] ?? 0) >= (PRIORIDADE[b] ?? 0) ? a : b;
}

// Porto colors — more distinct (blue vs violet)
const PORTO_HALO: Record<string, string> = {
  "Mucuripe": "#c4b5fd",   // violet-300
  "Pecém":    "#7dd3fc",   // sky-300
};
const PORTO_SOLID: Record<string, string> = {
  "Mucuripe": "#7c3aed",   // violet-600
  "Pecém":    "#0284c7",   // sky-600
};

const LANCHAS = [
  { cd: 121,  nome: "Flexeiras", labelCor: "#2563EB" },
  { cd: 1003, nome: "Fortim",    labelCor: "#16A34A" },
  { cd: 117,  nome: "Taíba",     labelCor: "#F97316" },
];

const LABEL_W  = 110; // px — fixed left column width
const TRACK_H  = 40;  // px — track row height
const BAR_TOP  = 10;  // px — status bar top offset inside track
const BAR_H    = 20;  // px — status bar height
const MIN_GAP_PCT = 0.35; // minimum gap between manobra markers (%)

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatusSeg {
  type: StatusType;
  startMs: number;
  endMs: number;
  detail: string;
  origStartMs: number;
  origEndMs: number;
}

interface PortoSeg {
  porto: string;
  startMs: number;
  endMs: number;
}

interface Pin {
  ms: number;
  porto: string;
  displayPct: number; // nudged horizontal position
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function resolveOverlaps(segs: StatusSeg[]): StatusSeg[] {
  if (segs.length === 0) return [];
  const points = [...new Set(segs.flatMap(s => [s.startMs, s.endMs]))].sort((a, b) => a - b);
  const result: StatusSeg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const t0 = points[i];
    const t1 = points[i + 1];
    const covering = segs.filter(s => s.startMs <= t0 && s.endMs >= t1);
    if (covering.length === 0) continue;
    const winner = covering.reduce((best, cur) =>
      statusMaisGrave(cur.type, best.type) === cur.type ? cur : best,
    );
    const last = result[result.length - 1];
    if (last && last.type === winner.type && last.endMs === t0) {
      last.endMs = t1;
    } else {
      result.push({ type: winner.type, startMs: t0, endMs: t1, detail: winner.detail, origStartMs: winner.origStartMs, origEndMs: winner.origEndMs });
    }
  }
  return result;
}

function classifyOcorrencia(efeito: string | null | undefined, tipo: string | null | undefined): StatusType | null {
  const e = (efeito ?? "").trim().toLowerCase();
  const t = (tipo   ?? "").toLowerCase();
  if (e === "inoperante") {
    if (t.includes("projeto") || t.includes("melhoria") || t.includes("modificação")) return "projeto";
    return t.includes("corretiva") ? "corretiva" : "preventiva";
  }
  if (e.includes("restri")) return "restricao";
  // "Operante" e "Não Altera" = operação normal → não exibir no timeline
  return null;
}

function buildStatusSegs(
  cd: number, start: number, end: number,
  ocorrencias: any[], fainas: any[],
): StatusSeg[] {
  const segs: StatusSeg[] = [];

  for (const o of ocorrencias) {
    if (Number(o.cd_lancha) !== cd) continue;
    const s = new Date(o.data_inicio).getTime();
    let e2: number;
    if (o.data_fim) e2 = new Date(o.data_fim).getTime();
    else if (o.duracao_horas != null && Number(o.duracao_horas) > 0) e2 = s + Number(o.duracao_horas) * 3_600_000;
    else e2 = end;
    const cs = Math.max(s, start); const ce = Math.min(e2, end);
    if (cs >= ce) continue;
    const type = classifyOcorrencia(o.efeito, o.tipo_ocorrencia);
    if (type === null) continue; // "Operante" / "Não Altera" → ignorar
    segs.push({
      type,
      startMs: cs, endMs: ce,
      origStartMs: s, origEndMs: e2,
      detail: [o.tipo_ocorrencia, o.efeito].filter(Boolean).join(" — "),
    });
  }

  for (const f of fainas) {
    if (Number(f.cd_lancha) !== cd) continue;
    if (!f.dh_inicio || !f.dh_fim) continue;
    const s = new Date(f.dh_inicio).getTime();
    const e2 = new Date(f.dh_fim).getTime();
    const cs = Math.max(s, start); const ce = Math.min(e2, end);
    if (cs >= ce) continue;
    segs.push({ type: "deslocamento", startMs: cs, endMs: ce, origStartMs: s, origEndMs: e2, detail: `${f.ds_local_orig ?? "—"} → ${f.ds_local_dest ?? "—"}` });
  }

  return resolveOverlaps(segs);
}

// Porto at time T = porto of the last manobra at or before T.
// Merge consecutive same-porto anchors into a single segment.
function buildPortoSegs(
  cd: number, windowStart: number, windowEnd: number, manobras: any[],
): PortoSeg[] {
  const all = manobras
    .filter(m => Number(m.cd_lancha) === cd && m.dh_manobra && m.ds_porto)
    .map(m => ({ ms: new Date(m.dh_manobra).getTime(), porto: (m.ds_porto as string).trim() }))
    .sort((a, b) => a.ms - b.ms);

  if (all.length === 0) return [];

  const lastBefore = all.filter(m => m.ms <= windowStart).slice(-1)[0];
  const startPorto  = lastBefore?.porto ?? all[0]?.porto;
  if (!startPorto) return [];

  // Build change-only anchors (skip same-porto consecutive manobras)
  const anchors: { ms: number; porto: string }[] = [{ ms: windowStart, porto: startPorto }];
  for (const m of all.filter(m => m.ms > windowStart && m.ms < windowEnd)) {
    if (m.porto !== anchors[anchors.length - 1].porto) anchors.push(m);
  }

  return anchors.map((a, i) => ({
    porto:   a.porto,
    startMs: a.ms,
    endMs:   i < anchors.length - 1 ? anchors[i + 1].ms : windowEnd,
  }));
}

function buildPins(
  cd: number, windowStart: number, windowEnd: number,
  windowDuration: number, manobras: any[],
): Pin[] {
  const raw = manobras
    .filter(m => Number(m.cd_lancha) === cd && m.dh_manobra)
    .map(m => ({ ms: new Date(m.dh_manobra).getTime(), porto: (m.ds_porto ?? "—") as string }))
    .filter(p => p.ms >= windowStart && p.ms <= windowEnd)
    .sort((a, b) => a.ms - b.ms);

  // Nudge overlapping markers so none is completely hidden
  let lastPct = -Infinity;
  return raw.map(pin => {
    const rawPct = ((pin.ms - windowStart) / windowDuration) * 100;
    const displayPct = Math.max(lastPct + MIN_GAP_PCT, rawPct);
    lastPct = displayPct;
    return { ...pin, displayPct };
  });
}

function fmtDt(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface LanchaTimelineProps {
  ocorrencias: any[];
  manobras:    any[];
  fainas:      any[];
}

export function LanchaTimeline({ ocorrencias, manobras, fainas }: LanchaTimelineProps) {
  const [days, setDays]       = useState<14 | 21>(14);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Window end = yesterday at 23:59:59 (data typically 1 day behind sync)
  const windowEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const windowStart    = windowEnd - days * 24 * 3_600_000;
  const windowDuration = windowEnd - windowStart;

  const pct = (ms: number) => ((ms - windowStart) / windowDuration) * 100;

  // Day ticks for grid + axis — max ~10 labels, all grid lines
  const dayTicks = useMemo(() => {
    const labelStep = Math.ceil(days / 10); // e.g. 14d→2, 21d→3
    const result: { ms: number; pct: number; label: string; showLabel: boolean }[] = [];
    const cur = new Date(windowStart);
    cur.setHours(0, 0, 0, 0);
    cur.setDate(cur.getDate() + 1); // first midnight inside window
    let idx = 0;
    while (cur.getTime() <= windowEnd) {
      const ms = cur.getTime();
      result.push({
        ms, pct: ((ms - windowStart) / windowDuration) * 100,
        label: cur.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        showLabel: idx % labelStep === 0,
      });
      cur.setDate(cur.getDate() + 1);
      idx++;
    }
    // Always show last day
    if (result.length > 0) result[result.length - 1].showLabel = true;
    return result;
  }, [windowStart, windowEnd, windowDuration, days]);

  // Per-lancha computed data
  const lanchData = useMemo(() => {
    const dur = windowDuration;
    return LANCHAS.map(l => {
      const statusSegs = buildStatusSegs(l.cd, windowStart, windowEnd, ocorrencias, fainas);
      const portoSegs  = buildPortoSegs(l.cd, windowStart, windowEnd, manobras);
      const pins       = buildPins(l.cd, windowStart, windowEnd, dur, manobras);
      return { ...l, statusSegs, portoSegs, pins, manobraCount: pins.length };
    });
  }, [windowStart, windowEnd, windowDuration, ocorrencias, fainas, manobras]);

  const onHover = useCallback((e: React.MouseEvent, lines: string[]) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, lines });
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Disponibilidade &amp; Operação — Linha do Tempo
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Status, porto e manobras por lancha nos últimos dias
          </p>
        </div>

        {/* Period toggle */}
        <div
          className="flex shrink-0 rounded-lg p-1 gap-0.5"
          style={{ background: "#f1f5f9" }}
        >
          {([14, 21] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
              style={{
                background: days === d ? "#0d9488" : "transparent",
                color:      days === d ? "#fff"    : "#64748b",
              }}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div ref={wrapRef} className="relative" onMouseLeave={() => setTooltip(null)}>
        <div className="flex gap-2">

          {/* Label column — empty slot for date axis + lancha labels */}
          <div className="shrink-0 space-y-3" style={{ width: LABEL_W }}>
            <div style={{ height: 24 }} /> {/* spacer matching date axis */}
            {lanchData.map(l => (
              <div key={l.cd} style={{ height: TRACK_H }} className="flex flex-col justify-center">
                <p className="text-sm font-bold leading-tight" style={{ color: l.labelCor }}>
                  {l.nome}
                </p>
                <p className="text-[10.5px] leading-tight" style={{ color: "#94a3b8" }}>
                  {l.manobraCount} manobras
                </p>
              </div>
            ))}
          </div>

          {/* Track area */}
          <div className="flex-1 min-w-0">
            {/* Date axis labels */}
            <div className="relative h-6 mb-0">
              {dayTicks.filter(t => t.showLabel).map((t, i) => (
                <span
                  key={i}
                  className="absolute text-[10px] leading-none"
                  style={{ left: `${t.pct}%`, transform: "translateX(-50%)", color: "#94a3b8", top: 6 }}
                >
                  {t.label}
                </span>
              ))}
            </div>

            {/* Grid + tracks */}
            <div className="relative space-y-3">
              {/* Grid lines spanning all track rows */}
              {dayTicks.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: `${t.pct}%`, borderLeft: "1px solid #f1f5f9" }}
                />
              ))}

              {/* Lancha track rows */}
              {lanchData.map(l => (
                <div
                  key={l.cd}
                  className="relative rounded-lg overflow-hidden"
                  style={{ height: TRACK_H, background: "#f8fafc" }}
                >
                  {/* ── Layer 1: Porto halos (full height, behind everything) ── */}
                  {l.portoSegs.length > 0
                    ? l.portoSegs.map((seg, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 cursor-help"
                          style={{
                            left:            `${pct(seg.startMs)}%`,
                            width:           `${Math.max(0.1, pct(seg.endMs) - pct(seg.startMs))}%`,
                            backgroundColor: PORTO_HALO[seg.porto] ?? "#e2e8f0",
                            opacity:         0.75,
                            zIndex:          1,
                          }}
                          onMouseEnter={e => onHover(e, [`Porto: ${seg.porto}`])}
                          onMouseMove={e => onHover(e, [`Porto: ${seg.porto}`])}
                        />
                      ))
                    : <div className="absolute inset-0" style={{ backgroundColor: "#e2e8f0", zIndex: 1 }} />
                  }

                  {/* ── Layer 2: Status bar (centered, height 20px) ── */}
                  <div
                    className="absolute"
                    style={{
                      left: 0, right: 0,
                      top: BAR_TOP, height: BAR_H,
                      borderRadius: 5,
                      overflow: "hidden",
                      backgroundColor: STATUS_COLOR.disponivel,
                      zIndex: 2,
                    }}
                  >
                    {/* Invisible base — catches hover on "disponível" areas */}
                    <div
                      className="absolute inset-0 cursor-help"
                      style={{ zIndex: 0 }}
                      onMouseEnter={e => onHover(e, [STATUS_LABEL.disponivel])}
                      onMouseMove={e => onHover(e, [STATUS_LABEL.disponivel])}
                    />
                    {/* Status overlay segments */}
                    {l.statusSegs.map((seg, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 cursor-help"
                        style={{
                          left:            `${pct(seg.startMs)}%`,
                          width:           `${Math.max(0.15, pct(seg.endMs) - pct(seg.startMs))}%`,
                          backgroundColor: STATUS_COLOR[seg.type],
                          zIndex:          seg.type === "deslocamento" ? 3 : 2,
                        }}
                        onMouseEnter={e => onHover(e, [STATUS_LABEL[seg.type], `${fmtDt(seg.origStartMs)} → ${fmtDt(seg.origEndMs)}`, seg.detail])}
                        onMouseMove={e => onHover(e, [STATUS_LABEL[seg.type], `${fmtDt(seg.origStartMs)} → ${fmtDt(seg.origEndMs)}`, seg.detail])}
                      />
                    ))}
                  </div>

                  {/* ── Layer 3: Manobra traços (full height, topmost) ── */}
                  {l.pins.map((pin, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 cursor-help"
                      style={{
                        left:            `${pin.displayPct}%`,
                        width:           "2px",
                        transform:       "translateX(-50%)",
                        backgroundColor: "rgba(30,41,59,0.5)",
                        zIndex:          10,
                      }}
                      onMouseEnter={e => onHover(e, ["Manobra", fmtDt(pin.ms), pin.porto])}
                      onMouseMove={e => onHover(e, ["Manobra", fmtDt(pin.ms), pin.porto])}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (() => {
          const containerW = wrapRef.current?.offsetWidth ?? 900;
          const flip = tooltip.x > containerW - 220;
          return (
            <div
              className="absolute z-50 pointer-events-none bg-popover border border-border rounded-md shadow-lg px-2.5 py-1.5 text-xs space-y-0.5 whitespace-nowrap"
              style={{
                left: flip ? tooltip.x - 190 : tooltip.x + 12,
                top:  Math.max(0, tooltip.y - 10),
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

      {/* ── Legend ── */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[10.5px] text-muted-foreground"
        style={{ paddingLeft: LABEL_W + 8 }}
      >
        {/* Status */}
        {(Object.entries(STATUS_COLOR) as [StatusType, string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span>{STATUS_LABEL[type]}</span>
          </div>
        ))}

        <div className="w-px h-3 self-center shrink-0" style={{ background: "#e2e8f0" }} />

        {/* Porto */}
        {Object.entries(PORTO_HALO).map(([porto, halo]) => (
          <div key={porto} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-3 rounded-sm shrink-0 border"
              style={{ backgroundColor: halo, borderColor: PORTO_SOLID[porto] ?? "#94a3b8", opacity: 0.9 }}
            />
            <span>Porto: {porto}</span>
          </div>
        ))}

        <div className="w-px h-3 self-center shrink-0" style={{ background: "#e2e8f0" }} />

        {/* Manobra */}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: "rgba(30,41,59,0.5)" }} />
          <span>Manobra (passe o mouse para ver porto e horário)</span>
        </div>
      </div>
    </div>
  );
}
