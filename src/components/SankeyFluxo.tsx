import { useMemo } from "react";

type Despesa = {
  tipo_despesa: string;
  fornecedor: string;
  historico: string;
  valor: number;
};

type Props = {
  despesas: Despesa[];
  cfTipo: string | null;
  cfFornecedor: string | null;
  onSelectTipo: (v: string | null) => void;
  onSelectFornecedor: (v: string | null) => void;
};

const TOP_TIPOS = 7;
const TOP_FORN  = 6;

const USABLE_H = 480;
const GAP      = 10;
const MIN_H    = 18;
const NODE_W   = 18;
const COL_X    = [80, 380, 680] as const;

const COLOR_TOTAL = "#1D4ED8";
const COLOR_TIPO  = "#3B82F6";
const COLOR_FORN  = "#0891B2";

type SNode = {
  id: string; nome: string; valor: number; col: number;
  x: number; y: number; h: number; color: string;
};

type SLink = {
  source: SNode; target: SNode; value: number;
  sy: number; ty: number; sw: number;
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function posNodes(entries: [string, number][], colIdx: number, color: string): SNode[] {
  const totalGaps = (entries.length - 1) * GAP;
  const availH    = USABLE_H - totalGaps;
  const totalVal  = entries.reduce((s, [, v]) => s + v, 0);
  const nodes: SNode[] = [];
  let curY = 20;
  for (const [nome, valor] of entries) {
    const h = Math.max(MIN_H, (valor / totalVal) * availH);
    nodes.push({ id: nome, nome, valor, col: colIdx, x: COL_X[colIdx], y: curY, h, color });
    curY += h + GAP;
  }
  return nodes;
}

function calcLayout(despesas: Despesa[]) {
  const tipoMap = new Map<string, number>();
  const fornMap  = new Map<string, number>();
  for (const d of despesas) {
    const t = d.tipo_despesa || "Sem tipo";
    const f = d.fornecedor   || "Desconhecido";
    tipoMap.set(t, (tipoMap.get(t) ?? 0) + d.valor);
    fornMap.set(f, (fornMap.get(f) ?? 0) + d.valor);
  }
  const topTipos = [...tipoMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_TIPOS);
  const topForn  = [...fornMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_FORN);
  const total    = despesas.reduce((s, d) => s + d.valor, 0);

  const nodeTotal: SNode = {
    id: "total", nome: "Valor Total", valor: total, col: 0,
    x: COL_X[0], y: 20, h: USABLE_H, color: COLOR_TOTAL,
  };
  const nodesTipo = posNodes(topTipos, 1, COLOR_TIPO);
  const nodesForn = posNodes(topForn,  2, COLOR_FORN);
  const allNodes  = [nodeTotal, ...nodesTipo, ...nodesForn];

  const outCursor = new Map(allNodes.map(n => [n.id, n.y]));
  const inCursor  = new Map(allNodes.map(n => [n.id, n.y]));

  const links: SLink[] = [];

  // Total → Tipos
  for (const tn of nodesTipo) {
    const ribbonW = (tn.valor / total) * USABLE_H;
    const sw = Math.max(1, ribbonW);
    const sy = outCursor.get(nodeTotal.id)!;
    const ty = inCursor.get(tn.id)!;
    links.push({ source: nodeTotal, target: tn, value: tn.valor, sy, ty, sw });
    outCursor.set(nodeTotal.id, sy + sw);
    inCursor.set(tn.id, ty + sw);
  }

  // Tipos → Fornecedores
  for (const tn of nodesTipo) {
    const fornInTipo = new Map<string, number>();
    for (const d of despesas) {
      const t = d.tipo_despesa || "Sem tipo";
      const f = d.fornecedor   || "Desconhecido";
      if (t === tn.nome && topForn.some(([tf]) => tf === f)) {
        fornInTipo.set(f, (fornInTipo.get(f) ?? 0) + d.valor);
      }
    }
    const sorted = [...fornInTipo.entries()].sort((a, b) => b[1] - a[1]);
    for (const [fornNome, linkVal] of sorted) {
      const fn = nodesForn.find(n => n.nome === fornNome);
      if (!fn) continue;
      const ribbonW = (linkVal / total) * USABLE_H;
      const sw = Math.max(1, ribbonW);
      const sy = outCursor.get(tn.id)!;
      const ty = inCursor.get(fn.id)!;
      links.push({ source: tn, target: fn, value: linkVal, sy, ty, sw });
      outCursor.set(tn.id, sy + sw);
      inCursor.set(fn.id, ty + sw);
    }
  }

  return { allNodes, nodeTotal, nodesTipo, nodesForn, links, total };
}

export default function SankeyFluxo({
  despesas, cfTipo, cfFornecedor, onSelectTipo, onSelectFornecedor,
}: Props) {
  const layout = useMemo(() => calcLayout(despesas), [despesas]);
  const { allNodes, links, total } = layout;

  if (despesas.length === 0) {
    return <p className="text-center text-muted-foreground py-10 text-sm">Sem dados suficientes</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Total: <strong>{fmtBRL(total)}</strong>
          {" · "}Clique em Tipo ou Fornecedor para filtrar
        </p>
        {(cfTipo || cfFornecedor) && (
          <button
            className="text-xs underline text-muted-foreground"
            onClick={() => { onSelectTipo(null); onSelectFornecedor(null); }}
          >
            Limpar
          </button>
        )}
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox="0 0 900 520" className="w-full" style={{ minWidth: 600 }}>

          {/* Links (ribbons) — renderizados antes dos nós */}
          {links.map((lk, i) => {
            const x1 = lk.source.x + NODE_W;
            const x2 = lk.target.x;
            const mx = (x1 + x2) / 2;
            const y1t = lk.sy;
            const y1b = lk.sy + lk.sw;
            const y2t = lk.ty;
            const y2b = lk.ty + lk.sw;
            const path = [
              `M ${x1} ${y1t}`,
              `C ${mx} ${y1t}, ${mx} ${y2t}, ${x2} ${y2t}`,
              `L ${x2} ${y2b}`,
              `C ${mx} ${y2b}, ${mx} ${y1b}, ${x1} ${y1b}`,
              "Z",
            ].join(" ");

            const tipoNome = lk.source.col === 1 ? lk.source.nome : (lk.target.col === 1 ? lk.target.nome : null);
            const fornNome = lk.target.col === 2 ? lk.target.nome : null;
            const dimmed =
              (cfTipo && tipoNome && tipoNome !== cfTipo) ||
              (cfFornecedor && fornNome && fornNome !== cfFornecedor);

            return (
              <path
                key={i}
                d={path}
                fill={lk.target.color}
                opacity={dimmed ? 0.07 : 0.35}
              />
            );
          })}

          {/* Nós */}
          {allNodes.map(nd => {
            const isSelTipo = nd.col === 1 && cfTipo === nd.nome;
            const isSelForn = nd.col === 2 && cfFornecedor === nd.nome;
            const dimmed =
              (nd.col === 1 && !!cfTipo && !isSelTipo) ||
              (nd.col === 2 && !!cfFornecedor && !isSelForn);
            const clickable = nd.col === 1 || nd.col === 2;
            const label = nd.nome.length > 26 ? nd.nome.slice(0, 26) + "…" : nd.nome;

            return (
              <g
                key={nd.id}
                onClick={() => {
                  if (nd.col === 1) onSelectTipo(cfTipo === nd.nome ? null : nd.nome);
                  if (nd.col === 2) onSelectFornecedor(cfFornecedor === nd.nome ? null : nd.nome);
                }}
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <rect
                  x={nd.x} y={nd.y} width={NODE_W} height={nd.h}
                  fill={nd.color}
                  opacity={dimmed ? 0.25 : 1}
                  rx={3}
                  stroke={isSelTipo || isSelForn ? "#FBBF24" : "none"}
                  strokeWidth={2}
                />

                {/* Label col 0: à esquerda */}
                {nd.col === 0 && (
                  <text
                    x={nd.x - 6} y={nd.y + nd.h / 2}
                    textAnchor="end" dominantBaseline="middle"
                    fontSize={11} fill="currentColor" fontWeight={600}
                  >
                    Valor Total
                  </text>
                )}

                {/* Label col 1 e 2: à direita */}
                {nd.col > 0 && nd.h >= 14 && (
                  <text
                    x={nd.x + NODE_W + 6} y={nd.y + nd.h / 2 + (nd.h >= 32 ? -7 : 0)}
                    textAnchor="start" dominantBaseline="middle"
                    fontSize={10} fill="currentColor"
                    opacity={dimmed ? 0.35 : 1}
                  >
                    {label}
                  </text>
                )}

                {/* Valor abaixo quando há espaço */}
                {nd.col > 0 && nd.h >= 32 && (
                  <text
                    x={nd.x + NODE_W + 6} y={nd.y + nd.h / 2 + 6}
                    textAnchor="start" dominantBaseline="middle"
                    fontSize={9} fill="currentColor" opacity={dimmed ? 0.2 : 0.5}
                  >
                    {`R$ ${(nd.valor / 1000).toFixed(0)}k`}
                  </text>
                )}
              </g>
            );
          })}

        </svg>
      </div>
    </div>
  );
}
