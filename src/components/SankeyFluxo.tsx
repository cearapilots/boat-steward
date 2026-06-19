import { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";

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
const TOP_HIST  = 5;

const NIVEL_COLOR: Record<string, string> = {
  total: "#1E40AF",
  tipo:  "#3B82F6",
  forn:  "#06B6D4",
  hist:  "#8B5CF6",
};

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SankeyFluxo({
  despesas, cfTipo, cfFornecedor, onSelectTipo, onSelectFornecedor,
}: Props) {

  const { nodes, links } = useMemo(() => {
    // ── Agregar por tipo ─────────────────────────────────────────────────────
    const tipoMap = new Map<string, number>();
    for (const d of despesas) {
      const k = d.tipo_despesa || "Sem tipo";
      tipoMap.set(k, (tipoMap.get(k) ?? 0) + d.valor);
    }
    const topTipos = [...tipoMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_TIPOS);

    // ── Agregar por fornecedor ────────────────────────────────────────────────
    const despForn = cfTipo ? despesas.filter(d => d.tipo_despesa === cfTipo) : despesas;
    const fornMap  = new Map<string, number>();
    for (const d of despForn) {
      const k = d.fornecedor || "Desconhecido";
      fornMap.set(k, (fornMap.get(k) ?? 0) + d.valor);
    }
    const topForn = [...fornMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_FORN);

    // ── Agregar por histórico (apenas quando cfFornecedor ativo) ─────────────
    const topHist: Array<[string, number]> = [];
    if (cfFornecedor) {
      const histMap = new Map<string, number>();
      for (const d of despesas.filter(d => d.fornecedor === cfFornecedor)) {
        const k = d.historico || "Sem histórico";
        histMap.set(k, (histMap.get(k) ?? 0) + d.valor);
      }
      topHist.push(...[...histMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_HIST));
    }

    // ── Construir nodes e links ───────────────────────────────────────────────
    const nodes: Array<{ name: string; nivel: string; color: string }> = [];
    const links: Array<{ source: number; target: number; value: number }> = [];

    // Node 0: Total
    nodes.push({ name: "Valor Total", nivel: "total", color: NIVEL_COLOR.total });
    const idxTotal = 0;

    // Tipo nodes
    const tipoStart = nodes.length;
    for (const [tipo] of topTipos) nodes.push({ name: tipo, nivel: "tipo", color: NIVEL_COLOR.tipo });

    // Links: Total → Tipo
    for (let i = 0; i < topTipos.length; i++) {
      links.push({ source: idxTotal, target: tipoStart + i, value: Math.max(1, topTipos[i][1]) });
    }

    // Fornecedor nodes
    const fornStart = nodes.length;
    for (const [forn] of topForn) nodes.push({ name: forn, nivel: "forn", color: NIVEL_COLOR.forn });
    const fornNodes = topForn.map(([nome], i) => ({ nome, idx: fornStart + i }));

    // Links: Tipo → Fornecedor
    for (const [ti, [tipo]] of topTipos.entries()) {
      for (const [fi, [forn]] of topForn.entries()) {
        const v = despesas
          .filter(d => (d.tipo_despesa || "Sem tipo") === tipo && (d.fornecedor || "Desconhecido") === forn)
          .reduce((s, d) => s + d.valor, 0);
        if (v > 0) links.push({ source: tipoStart + ti, target: fornStart + fi, value: v });
      }
    }

    // Histórico nodes (quando cfFornecedor ativo)
    if (cfFornecedor && topHist.length > 0) {
      const histStart = nodes.length;
      for (const [hist] of topHist) nodes.push({ name: hist.slice(0, 50), nivel: "hist", color: NIVEL_COLOR.hist });
      const fornIdx = fornNodes.find(f => f.nome === cfFornecedor)?.idx;
      if (fornIdx != null) {
        for (let i = 0; i < topHist.length; i++) {
          links.push({ source: fornIdx, target: histStart + i, value: Math.max(1, topHist[i][1]) });
        }
      }
    }

    return { nodes, links };
  }, [despesas, cfTipo, cfFornecedor]);

  // ── Custom Node ───────────────────────────────────────────────────────────
  function renderNode(props: any) {
    const { x, y, width, height, payload } = props;
    if (!payload || !width || !height) return null;
    const nivel = payload.nivel as string;
    const nome  = payload.name  as string;
    const isActive = (nivel === "tipo" && cfTipo === nome) || (nivel === "forn" && cfFornecedor === nome);
    const dimmed   = (nivel === "tipo" && !!cfTipo && cfTipo !== nome) ||
                     (nivel === "forn" && !!cfFornecedor && cfFornecedor !== nome);
    const color   = payload.color ?? "#3B82F6";
    const opacity = dimmed ? 0.25 : 1;
    const short   = nome.length > 22 ? nome.slice(0, 21) + "…" : nome;
    const clickable = nivel === "tipo" || nivel === "forn";

    function handleClick() {
      if (nivel === "tipo") onSelectTipo(cfTipo === nome ? null : nome);
      if (nivel === "forn") onSelectFornecedor(cfFornecedor === nome ? null : nome);
    }

    return (
      <g onClick={clickable ? handleClick : undefined} style={{ cursor: clickable ? "pointer" : "default" }}>
        <rect
          x={x} y={y} width={width} height={height}
          fill={color} opacity={opacity} rx={3}
          stroke={isActive ? "#FBBF24" : "none"} strokeWidth={2}
        />
        {height > 14 && (
          <text
            x={x + width + 6} y={y + height / 2}
            dominantBaseline="middle" fontSize={10}
            fill="currentColor" opacity={opacity}
          >
            {short}
          </text>
        )}
      </g>
    );
  }

  // ── Custom Link ───────────────────────────────────────────────────────────
  function renderLink(props: any) {
    const {
      sourceX, sourceY, sourceControlX,
      targetX, targetY, targetControlX,
      linkWidth, payload,
    } = props;
    const sourceName  = (payload?.source as any)?.name;
    const targetName  = (payload?.target as any)?.name;
    const sourceNivel = (payload?.source as any)?.nivel;
    const targetNivel = (payload?.target as any)?.nivel;
    const targetColor = (payload?.target as any)?.color ?? "#93C5FD";
    const isFaded =
      (sourceNivel === "tipo" && !!cfTipo && sourceName !== cfTipo) ||
      (targetNivel === "forn" && !!cfFornecedor && targetName !== cfFornecedor);
    const lw = Math.max(1, linkWidth ?? 1);
    return (
      <path
        d={`M${sourceX},${sourceY + lw / 2} C${sourceControlX},${sourceY + lw / 2} ${targetControlX},${targetY + lw / 2} ${targetX},${targetY + lw / 2}`}
        fill="none"
        stroke={targetColor}
        strokeWidth={lw}
        opacity={isFaded ? 0.08 : 0.35}
      />
    );
  }

  const totalValor = despesas.reduce((s, d) => s + d.valor, 0);

  if (despesas.length === 0 || nodes.length < 2 || links.length === 0) {
    return <p className="text-center text-muted-foreground py-10 text-sm">Sem dados suficientes</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Total: <strong>{fmtBRL(totalValor)}</strong>
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
      <ResponsiveContainer width="100%" height={420}>
        <Sankey
          data={{ nodes, links }}
          nodeWidth={14}
          nodePadding={12}
          margin={{ top: 8, right: 200, bottom: 8, left: 8 }}
          node={renderNode as any}
          link={renderLink as any}
        >
          <Tooltip formatter={(value: number) => [fmtBRL(value), "Valor"]} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
