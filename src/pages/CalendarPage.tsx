import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalendarioManutencoes, type CalendarioManutencaoItem } from "@/hooks/useFleetData";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TIPOS_PERMITIDOS = new Set([
  "Docagem",
  "Limpeza de tanque",
  "Limpeza dos aftercoolers",
  "Limpeza/manutenção ar-condicionado",
  "Regulagem de válvulas dos motores",
  "Treinamento dos tripulantes",
]);

const LANCHA_STYLE: Record<string, { color: string; letter: string }> = {
  Flexeiras: { color: "#DC2626", letter: "F" },
  Fortim: { color: "#2563EB", letter: "F" },
  Taíba: { color: "#16A34A", letter: "T" },
};

function LanchaBadge({ nome }: { nome: string }) {
  const style = LANCHA_STYLE[nome] ?? { color: "#6B7280", letter: nome.charAt(0) };
  return (
    <span
      title={nome}
      className="inline-flex items-center justify-center rounded-full bg-white font-bold"
      style={{
        width: 20,
        height: 20,
        border: `2px solid ${style.color}`,
        color: style.color,
        fontSize: 10,
        lineHeight: 1,
      }}
    >
      {style.letter}
    </span>
  );
}

type GrupoTipo = { tipo_nome: string; lanchas: string[] };

function MesCell({ mesIdx, items }: { mesIdx: number; items: CalendarioManutencaoItem[] }) {
  const doMes = items.filter((it) => {
    const d = new Date(it.data + "T00:00:00");
    return d.getMonth() === mesIdx;
  });

  // Agrupar por tipo
  const grupos = new Map<string, Set<string>>();
  for (const it of doMes) {
    if (!grupos.has(it.tipo_nome)) grupos.set(it.tipo_nome, new Set());
    grupos.get(it.tipo_nome)!.add(it.lancha_nome);
  }
  const lista: GrupoTipo[] = Array.from(grupos.entries()).map(([tipo_nome, set]) => ({
    tipo_nome,
    lanchas: Array.from(set).sort(),
  }));

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card flex flex-col min-h-32">
      <div
        className="px-3 py-1.5 text-white font-bold text-sm"
        style={{ backgroundColor: "#1B2A4A" }}
      >
        {MESES[mesIdx]}
      </div>
      <div className="p-2 space-y-1.5 flex-1">
        {lista.map((g) => (
          <div key={g.tipo_nome} className="flex items-start gap-2 text-xs">
            <span className="flex-1 text-foreground leading-tight">{g.tipo_nome}</span>
            <span className="flex items-center gap-1 shrink-0">
              {g.lanchas.map((l) => (
                <LanchaBadge key={l} nome={l} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const { data = [], isLoading } = useCalendarioManutencoes(ano);

  const items = useMemo(
    () => data.filter((it) => TIPOS_PERMITIDOS.has(it.tipo_nome)),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário de Manutenções Preventivas</h1>
          <p className="text-sm" style={{ color: "#2ABFBF" }}>
            Visualize as manutenções preventivas previstas e realizadas no ano.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legenda */}
          <div className="flex items-center gap-2 text-xs">
            {Object.keys(LANCHA_STYLE).map((nome) => (
              <span key={nome} className="flex items-center gap-1.5">
                <LanchaBadge nome={nome} />
                <span className="text-muted-foreground">{nome}</span>
              </span>
            ))}
          </div>
          {/* Seletor de ano */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setAno((a) => a - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 py-1.5 text-sm font-bold min-w-16 text-center">{ano}</span>
            <Button variant="outline" size="icon" onClick={() => setAno((a) => a + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }, (_, i) => (
            <MesCell key={i} mesIdx={i} items={items} />
          ))}
        </div>
      )}
    </div>
  );
}
