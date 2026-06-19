import { useMemo } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";

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

type DrillItem = { nome: string; valor: number; pct: number };

function fmtValor(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")} Mi`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`;
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function BarRow({
  item, color, selected, onClick, labelMaxLen = 45,
}: {
  item: DrillItem;
  color: string;
  selected?: boolean;
  onClick?: () => void;
  labelMaxLen?: number;
}) {
  const label = item.nome.length > labelMaxLen ? item.nome.slice(0, labelMaxLen) + "…" : item.nome;

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg p-2 transition-colors
        ${onClick ? "cursor-pointer hover:bg-accent" : ""}
        ${selected ? "bg-accent" : ""}`}
    >
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className={`font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
        <span className="font-mono text-foreground shrink-0 ml-2">
          {fmtValor(item.valor)}
          <span className="text-muted-foreground ml-1.5">{item.pct}%</span>
        </span>
      </div>
      <div className="h-5 bg-muted rounded overflow-hidden">
        <div
          className="h-full rounded transition-all duration-500"
          style={{
            width: `${Math.max(item.pct, 1)}%`,
            backgroundColor: color,
            opacity: selected ? 1 : 0.65,
          }}
        />
      </div>
    </div>
  );
}

export default function SankeyFluxo({
  despesas, cfTipo, cfFornecedor, onSelectTipo, onSelectFornecedor,
}: Props) {
  const selectedTipo = cfTipo;
  const selectedForn = cfFornecedor;

  const total = useMemo(() => despesas.reduce((s, d) => s + d.valor, 0), [despesas]);

  const nivelTipos: DrillItem[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of despesas) map.set(d.tipo_despesa, (map.get(d.tipo_despesa) ?? 0) + d.valor);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, valor]) => ({ nome, valor, pct: Math.round((valor / total) * 100) }));
  }, [despesas, total]);

  const nivelFornecedores: DrillItem[] = useMemo(() => {
    if (!selectedTipo) return [];
    const map = new Map<string, number>();
    for (const d of despesas.filter(d => d.tipo_despesa === selectedTipo))
      map.set(d.fornecedor, (map.get(d.fornecedor) ?? 0) + d.valor);
    const tipoTotal = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, valor]) => ({ nome, valor, pct: Math.round((valor / tipoTotal) * 100) }));
  }, [despesas, selectedTipo]);

  const nivelHistorico: DrillItem[] = useMemo(() => {
    if (!selectedForn) return [];
    const map = new Map<string, number>();
    const base = despesas.filter(d =>
      (!selectedTipo || d.tipo_despesa === selectedTipo) && d.fornecedor === selectedForn
    );
    for (const d of base) map.set(d.historico, (map.get(d.historico) ?? 0) + d.valor);
    const fornTotal = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, valor]) => ({ nome, valor, pct: Math.round((valor / fornTotal) * 100) }));
  }, [despesas, selectedTipo, selectedForn]);

  if (despesas.length === 0) {
    return <p className="text-center text-muted-foreground py-10 text-sm">Sem dados suficientes</p>;
  }

  return (
    <div className="space-y-4">

      {/* Card Valor Total */}
      <div
        className="rounded-lg border-2 border-primary/40 p-3 cursor-pointer hover:border-primary transition-colors"
        onClick={() => { onSelectTipo(null); onSelectFornecedor(null); }}
        title="Clique para reiniciar o drill-down"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Valor Total</span>
          {(selectedTipo || selectedForn) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RotateCcw className="w-3 h-3" /> reiniciar
            </div>
          )}
        </div>
        <p className="text-2xl font-bold font-mono mt-1">{fmtValor(total)}</p>

        {/* Breadcrumb */}
        {selectedTipo && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground flex-wrap">
            <span
              className="hover:text-foreground cursor-pointer underline"
              onClick={e => { e.stopPropagation(); onSelectTipo(null); onSelectFornecedor(null); }}
            >
              Todos
            </span>
            <ChevronRight className="w-3 h-3" />
            <span
              className={selectedForn ? "hover:text-foreground cursor-pointer underline" : "text-foreground font-medium"}
              onClick={e => { e.stopPropagation(); if (selectedForn) onSelectFornecedor(null); }}
            >
              {selectedTipo}
            </span>
            {selectedForn && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground font-medium">
                  {selectedForn.slice(0, 30)}{selectedForn.length > 30 ? "…" : ""}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Nível 1 — Tipos de Despesa */}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
          Tipos de Despesa
          <span className="font-normal ml-1">· clique para ver fornecedores</span>
        </p>
        {nivelTipos.map(item => (
          <BarRow
            key={item.nome}
            item={item}
            color="#3B82F6"
            selected={selectedTipo === item.nome}
            onClick={() => {
              onSelectFornecedor(null);
              onSelectTipo(selectedTipo === item.nome ? null : item.nome);
            }}
          />
        ))}
      </div>

      {/* Nível 2 — Fornecedores */}
      {selectedTipo && nivelFornecedores.length > 0 && (
        <div className="space-y-1 pl-4 border-l-2 border-blue-200">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
            Fornecedores — {selectedTipo}
            <span className="font-normal ml-1">· clique para ver histórico</span>
          </p>
          {nivelFornecedores.map(item => (
            <BarRow
              key={item.nome}
              item={item}
              color="#0891B2"
              selected={selectedForn === item.nome}
              onClick={() => onSelectFornecedor(selectedForn === item.nome ? null : item.nome)}
            />
          ))}
        </div>
      )}

      {/* Nível 3 — Histórico */}
      {selectedForn && nivelHistorico.length > 0 && (
        <div className="space-y-1 pl-8 border-l-2 border-cyan-200">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
            Histórico — {selectedForn.slice(0, 40)}{selectedForn.length > 40 ? "…" : ""}
          </p>
          {nivelHistorico.map((item, i) => (
            <BarRow
              key={i}
              item={item}
              color="#8B5CF6"
              labelMaxLen={60}
            />
          ))}
        </div>
      )}

    </div>
  );
}
