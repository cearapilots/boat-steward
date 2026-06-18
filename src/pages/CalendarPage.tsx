import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useCalendarioManutencoes,
  useRealizadasCalendario,
  type CalendarioManutencaoItem,
  type RealizadaItem,
} from "@/hooks/useFleetData";

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
  Fortim:    { color: "#2563EB", letter: "F" },
  "Taíba":   { color: "#16A34A", letter: "T" },
};

const LANCHAS_ORDER = ["Flexeiras", "Fortim", "Taíba"];

type LanchaStatus = "concluido" | "pendente" | "atrasado";

type LanchaData = {
  lancha_id: string;
  lancha_nome: string;
  status: LanchaStatus;
  data_realizada?: string;
  mes_projetado?: number;
};

type GroupData = {
  tipo_id: string;
  tipo_nome: string;
  isCarryForward: boolean;
  mesOriginal?: number;
  lanchas: LanchaData[];
};

function fmtDataBR(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ── Build per-month group data ──────────────────────────────────────────────
function buildMonthGroups(
  ano: number,
  items: CalendarioManutencaoItem[],
  realizadas: RealizadaItem[],
  hoje: Date
): GroupData[][] {
  const mesAtual =
    hoje.getFullYear() === ano ? hoje.getMonth() : hoje.getFullYear() < ano ? -1 : 12;

  // realizadas lookup: "lancha_id|tipo_id|YYYY-MM" → data_realizada
  const doneMap = new Map<string, string>();
  for (const r of realizadas) {
    doneMap.set(`${r.lancha_id}|${r.tipo_id}|${r.data_realizada.slice(0, 7)}`, r.data_realizada);
  }

  const ym = (mes: number) => `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const isDone = (lid: string, tid: string, mes: number) =>
    doneMap.has(`${lid}|${tid}|${ym(mes)}`);
  const getDate = (lid: string, tid: string, mes: number) =>
    doneMap.get(`${lid}|${tid}|${ym(mes)}`);

  // Index all items
  const tipoMeta  = new Map<string, string>(); // tipo_id → tipo_nome
  const lanchaMeta = new Map<string, string>(); // lancha_id → lancha_nome
  const tipoLanchas = new Map<string, Set<string>>(); // tipo_id → Set<lancha_id>
  const schedMap  = new Map<string, Set<number>>(); // "tipo_id|lancha_id" → Set<mes 0-11>

  for (const it of items) {
    const mes = new Date(it.data + "T00:00:00").getMonth();
    tipoMeta.set(it.tipo_id, it.tipo_nome);
    lanchaMeta.set(it.lancha_id, it.lancha_nome);
    if (!tipoLanchas.has(it.tipo_id)) tipoLanchas.set(it.tipo_id, new Set());
    tipoLanchas.get(it.tipo_id)!.add(it.lancha_id);
    const schKey = `${it.tipo_id}|${it.lancha_id}`;
    if (!schedMap.has(schKey)) schedMap.set(schKey, new Set());
    schedMap.get(schKey)!.add(mes);
  }

  return Array.from({ length: 12 }, (_, mes) => {
    const grupos: GroupData[] = [];

    for (const [tipo_id, lanchaIds] of tipoLanchas) {
      const tipo_nome = tipoMeta.get(tipo_id)!;
      const lanchaDatas: LanchaData[] = [];

      for (const lancha_id of lanchaIds) {
        const sched = schedMap.get(`${tipo_id}|${lancha_id}`) ?? new Set<number>();

        // Completed in this month → concluido
        if (isDone(lancha_id, tipo_id, mes)) {
          lanchaDatas.push({
            lancha_id,
            lancha_nome: lanchaMeta.get(lancha_id)!,
            status: "concluido",
            data_realizada: getDate(lancha_id, tipo_id, mes),
          });
          continue;
        }

        // Meses futuros: sem carry-forward — apenas exibir o que está agendado
        if (mes > mesAtual) {
          if (sched.has(mes)) {
            lanchaDatas.push({
              lancha_id,
              lancha_nome: lanchaMeta.get(lancha_id)!,
              status: "pendente",
            });
          }
          continue;
        }

        // Find earliest unresolved past scheduled month (carry-forward source)
        let earliestUnresolved: number | undefined;
        for (const schMes of sched) {
          if (schMes >= mes || schMes >= mesAtual) continue;
          if (isDone(lancha_id, tipo_id, schMes)) continue;
          let resolvedBetween = false;
          for (let m = schMes + 1; m < mes; m++) {
            if (isDone(lancha_id, tipo_id, m)) { resolvedBetween = true; break; }
          }
          if (!resolvedBetween && (earliestUnresolved === undefined || schMes < earliestUnresolved)) {
            earliestUnresolved = schMes;
          }
        }

        if (earliestUnresolved !== undefined) {
          lanchaDatas.push({
            lancha_id,
            lancha_nome: lanchaMeta.get(lancha_id)!,
            status: "atrasado",
            mes_projetado: earliestUnresolved,
          });
          continue;
        }

        // Scheduled this month?
        if (sched.has(mes)) {
          lanchaDatas.push({
            lancha_id,
            lancha_nome: lanchaMeta.get(lancha_id)!,
            status: mes < mesAtual ? "atrasado" : "pendente",
            mes_projetado: mes < mesAtual ? mes : undefined,
          });
          continue;
        }
        // Not relevant for this month
      }

      if (lanchaDatas.length === 0) continue;

      const isScheduledThisMonth = Array.from(lanchaIds).some(
        (lid) => schedMap.get(`${tipo_id}|${lid}`)?.has(mes) ?? false
      );
      const hasAtrasado = lanchaDatas.some((l) => l.status === "atrasado");
      const isCarryForward = !isScheduledThisMonth && hasAtrasado;
      const mesOriginal = isCarryForward
        ? Math.min(
            ...lanchaDatas
              .filter((l) => l.mes_projetado !== undefined)
              .map((l) => l.mes_projetado!)
          )
        : undefined;

      grupos.push({ tipo_id, tipo_nome, isCarryForward, mesOriginal, lanchas: lanchaDatas });
    }

    return grupos.sort((a, b) => {
      // carry-forward at end; within each group alphabetical
      if (a.isCarryForward !== b.isCarryForward) return a.isCarryForward ? 1 : -1;
      return a.tipo_nome.localeCompare(b.tipo_nome, "pt-BR");
    });
  });
}

// ── LanchaBadge com status ──────────────────────────────────────────────────
function LanchaBadge({
  nome,
  status,
  tooltipText,
}: {
  nome: string;
  status: LanchaStatus;
  tooltipText: string;
}) {
  const style = LANCHA_STYLE[nome] ?? { color: "#6B7280", letter: nome.charAt(0) };
  const isAtrasado = status === "atrasado";
  const isPendente = status === "pendente";
  const isConcluido = status === "concluido";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center justify-center rounded-full font-bold bg-white relative"
            style={{
              width: 22,
              height: 22,
              fontSize: 10,
              lineHeight: 1,
              flexShrink: 0,
              border: `2px ${isPendente ? "dashed" : "solid"} ${style.color}`,
              color: isPendente ? `${style.color}99` : style.color,
            }}
          >
            {style.letter}
            {isConcluido && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: "#16A34A",
                  color: "white",
                  fontSize: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                }}
              >
                ✓
              </span>
            )}
            {isAtrasado && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  backgroundColor: "#DC2626",
                  color: "white",
                  fontSize: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                }}
              >
                !
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-52">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Célula de mês ───────────────────────────────────────────────────────────
function MesCell({ mesIdx, groups, ano }: { mesIdx: number; groups: GroupData[]; ano: number }) {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-card flex flex-col min-h-32">
      <div
        className="px-3 py-1.5 text-white font-bold text-sm"
        style={{ backgroundColor: "#1B2A4A" }}
      >
        {MESES[mesIdx]}
      </div>
      <div className="p-2 space-y-1.5 flex-1">
        {groups.map((g) => (
          <div key={`${g.tipo_id}-${g.isCarryForward ? "cf" : "norm"}`} className="flex items-start gap-1.5 text-xs">
            <span className="flex-1 text-foreground leading-tight">
              {g.tipo_nome}
            </span>
            <span className="flex items-center gap-0.5 shrink-0 mt-0.5">
              {g.lanchas
                .slice()
                .sort((a, b) => {
                  const ai = LANCHAS_ORDER.indexOf(a.lancha_nome);
                  const bi = LANCHAS_ORDER.indexOf(b.lancha_nome);
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                })
                .map((l) => {
                  const mesProj = l.mes_projetado ?? mesIdx;
                  const tooltipText =
                    l.status === "concluido"
                      ? `${l.lancha_nome} — realizado em ${fmtDataBR(l.data_realizada)}`
                      : l.status === "pendente"
                      ? `${l.lancha_nome} — previsto para este mês`
                      : `${l.lancha_nome} — previsto para ${MESES[mesProj]}/${ano}, não realizado`;
                  return (
                    <LanchaBadge
                      key={l.lancha_id}
                      nome={l.lancha_nome}
                      status={l.status}
                      tooltipText={tooltipText}
                    />
                  );
                })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const { data = [], isLoading } = useCalendarioManutencoes(ano);
  const { data: realizadas = [], isLoading: loadingReal } = useRealizadasCalendario(ano);

  const hoje = useMemo(() => new Date(), []);

  const items = useMemo(
    () => data.filter((it) => TIPOS_PERMITIDOS.has(it.tipo_nome)),
    [data]
  );

  const monthGroups = useMemo(
    () => buildMonthGroups(ano, items, realizadas, hoje),
    [ano, items, realizadas, hoje]
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

        <div className="flex flex-wrap items-center gap-4">
          {/* Legenda lanchas */}
          <div className="flex items-center gap-2 text-xs">
            {LANCHAS_ORDER.map((nome) => {
              const { color, letter } = LANCHA_STYLE[nome];
              return (
                <span key={nome} className="flex items-center gap-1">
                  <span
                    className="inline-flex items-center justify-center rounded-full font-bold bg-white"
                    style={{ width: 18, height: 18, border: `2px solid ${color}`, color, fontSize: 9 }}
                  >
                    {letter}
                  </span>
                  <span className="text-muted-foreground">{nome}</span>
                </span>
              );
            })}
          </div>

          {/* Legenda status */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span
                className="inline-flex items-center justify-center rounded-full font-bold bg-white relative"
                style={{ width: 18, height: 18, border: "2px solid #DC2626", color: "#DC2626", fontSize: 9 }}
              >
                F
                <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: "#16A34A", color: "white", fontSize: 5, display: "flex",
                  alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>✓</span>
              </span>
              Concluído
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-flex items-center justify-center rounded-full font-bold bg-white"
                style={{ width: 18, height: 18, border: "2px dashed #DC262699", color: "#DC262699", fontSize: 9 }}
              >
                F
              </span>
              Pendente
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-flex items-center justify-center rounded-full font-bold bg-white relative"
                style={{ width: 18, height: 18, border: "2px solid #2563EB", color: "#2563EB", fontSize: 9 }}
              >
                F
                <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: "#DC2626", color: "white", fontSize: 5, display: "flex",
                  alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>!</span>
              </span>
              Atrasado
            </span>
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

      {isLoading || loadingReal ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {monthGroups.map((groups, i) => (
            <MesCell key={i} mesIdx={i} groups={groups} ano={ano} />
          ))}
        </div>
      )}
    </div>
  );
}
