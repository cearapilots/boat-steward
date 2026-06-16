import { useMemo } from "react";
import { useProvasMar } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, CheckCircle2, CalendarClock } from "lucide-react";

const LANCHA_COR: Record<string, string> = {
  Flexeiras: "#2563EB", Fortim: "#16A34A", "Taíba": "#F97316",
};

// Sequência canônica: o que vem depois de cada tipo e em quantos dias
const SEQUENCIA: Record<string, { proxima: string | null; dias: number | null }> = {
  "Pré-Docagem":          { proxima: "Pós-Docagem",          dias: null },  // após docagem
  "Pós-Docagem":          { proxima: "1 mês Pós-Docagem",    dias: 30   },
  "1 mês Pós-Docagem":    { proxima: "2 meses Pós-Docagem",  dias: 30   },
  "2 meses Pós-Docagem":  { proxima: "3 meses Pós-Docagem",  dias: 30   },
  "3 meses Pós-Docagem":  { proxima: "Pré-Docagem seguinte", dias: null },  // sem data fixa
  "Pré-Docagem seguinte": { proxima: null,                   dias: null },  // ciclo completo
};

type Status = "atrasada" | "urgente" | "proxima" | "aguardando" | "ciclo_completo";

type AlertaLancha = {
  lanchaNome: string;
  ultimaDescricao: string;
  ultimaData: string;
  proximaDescricao: string | null;
  dataEsperada: string | null;   // YYYY-MM-DD
  diasRestantes: number | null;
  status: Status;
};

function addDias(data: string, dias: number): string {
  const d = new Date(data + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diffDias(dataAlvo: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataAlvo + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function AlertasProvasMar() {
  const { data: provas } = useProvasMar();

  const alertas = useMemo((): AlertaLancha[] => {
    if (!provas?.length) return [];

    // Agrupar por lancha, pegar a prova mais recente de cada uma
    const porLancha = new Map<string, typeof provas[0]>();
    for (const p of provas) {
      const nome = p.lanchas?.nome ?? "";
      if (!nome) continue;
      const atual = porLancha.get(nome);
      if (!atual || p.data > atual.data) porLancha.set(nome, p);
    }

    return [...porLancha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([lanchaNome, ultima]) => {
        const seq = SEQUENCIA[ultima.descricao];
        const proximaDescricao = seq?.proxima ?? null;

        // Calcular data esperada
        let dataEsperada: string | null = null;
        let diasRestantes: number | null = null;
        if (seq?.dias != null) {
          dataEsperada = addDias(ultima.data, seq.dias);
          diasRestantes = diffDias(dataEsperada);
        }

        // Status
        let status: Status;
        if (!proximaDescricao) {
          status = "ciclo_completo";
        } else if (dataEsperada == null) {
          status = "aguardando";
        } else if (diasRestantes! < 0) {
          status = "atrasada";
        } else if (diasRestantes! <= 7) {
          status = "urgente";
        } else {
          status = "proxima";
        }

        return { lanchaNome, ultimaDescricao: ultima.descricao, ultimaData: ultima.data,
                 proximaDescricao, dataEsperada, diasRestantes, status };
      });
  }, [provas]);

  if (!alertas.length) return null;

  const STATUS_CFG: Record<Status, { icon: React.ReactNode; cor: string; bg: string; label: (a: AlertaLancha) => string }> = {
    atrasada: {
      icon: <AlertTriangle className="w-4 h-4" />,
      cor: "#DC2626", bg: "bg-red-50 border-red-200",
      label: a => `ATRASADA há ${Math.abs(a.diasRestantes!)} dia${Math.abs(a.diasRestantes!) !== 1 ? "s" : ""}`,
    },
    urgente: {
      icon: <Clock className="w-4 h-4" />,
      cor: "#F97316", bg: "bg-orange-50 border-orange-200",
      label: a => a.diasRestantes === 0 ? "HOJE" : `em ${a.diasRestantes} dia${a.diasRestantes !== 1 ? "s" : ""}`,
    },
    proxima: {
      icon: <CalendarClock className="w-4 h-4" />,
      cor: "#2563EB", bg: "bg-blue-50 border-blue-200",
      label: a => `em ${a.diasRestantes} dias`,
    },
    aguardando: {
      icon: <CalendarClock className="w-4 h-4" />,
      cor: "#6B7280", bg: "bg-gray-50 border-gray-200",
      label: _ => "sem data definida",
    },
    ciclo_completo: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      cor: "#16A34A", bg: "bg-green-50 border-green-200",
      label: _ => "ciclo completo",
    },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          Próximas Provas de Mar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {alertas.map(a => {
            const cfg = STATUS_CFG[a.status];
            return (
              <div key={a.lanchaNome}
                className={`rounded-lg border p-3 space-y-2 ${cfg.bg}`}>
                {/* Header: lancha + status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: LANCHA_COR[a.lanchaNome] ?? "#6B7280" }} />
                    <span className="text-sm font-semibold">{a.lanchaNome}</span>
                  </div>
                  <span style={{ color: cfg.cor }}>
                    {cfg.icon}
                  </span>
                </div>

                {/* Última prova */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{a.ultimaDescricao}</span>
                  <span> em {fmtDate(a.ultimaData)}</span>
                </div>

                {/* Próxima prova */}
                {a.proximaDescricao ? (
                  <div className="pt-1 border-t border-current/10 space-y-0.5">
                    <p className="text-xs font-medium" style={{ color: cfg.cor }}>
                      Próxima: {a.proximaDescricao}
                    </p>
                    <p className="text-xs font-semibold" style={{ color: cfg.cor }}>
                      {a.dataEsperada
                        ? `${fmtDate(a.dataEsperada)} — ${cfg.label(a)}`
                        : cfg.label(a)}
                    </p>
                  </div>
                ) : (
                  <div className="pt-1 border-t border-current/10">
                    <p className="text-xs font-medium text-green-700">
                      ✓ Aguardando próxima docagem
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
