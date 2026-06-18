import { useMemo } from "react"
import { useProvasMar, useManutencoesPeriodicas } from "@/hooks/useFleetData"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ChevronRight,
  AlertTriangle,
  Clock,
} from "lucide-react"

const LANCHA_COR: Record<string, string> = {
  Flexeiras: "#2563EB",
  Fortim: "#16A34A",
  "Taíba": "#F97316",
}

// Os 5 passos pós-docagem em ordem
const PASSOS = [
  { key: "Pós-Docagem", label: "Pós-Doc", dias: 0 },
  { key: "1 mês Pós-Docagem", label: "1 mês", dias: 30 },
  { key: "2 meses Pós-Docagem", label: "2 meses", dias: 60 },
  { key: "3 meses Pós-Docagem", label: "3 meses", dias: 90 },
  { key: "Pré-Docagem seguinte", label: "Pré-Seg", dias: null },
]

function addDias(data: string, dias: number): string {
  const d = new Date(data + "T12:00:00")
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diffDias(iso: string) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  return Math.round(
    (new Date(iso + "T00:00:00").getTime() - hoje.getTime()) / 86400000
  )
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

export function AlertasProvasMar() {
  const { data: provas } = useProvasMar()
  const { data: periodicas } = useManutencoesPeriodicas()

  const alertas = useMemo(() => {
    if (!provas?.length) return []

    // Próxima docagem agendada por lancha
    const proximaDocagem: Record<string, string | null> = {}

    for (const p of periodicas ?? []) {
      if (
        p.tipo_nome?.toLowerCase().includes("docagem") &&
        p.proxima_data
      ) {
        const nome = p.lancha_nome

        if (
          !proximaDocagem[nome] ||
          p.proxima_data < proximaDocagem[nome]!
        ) {
          proximaDocagem[nome] = p.proxima_data
        }
      }
    }

    // Agrupar provas por lancha
    const porLancha = new Map<string, typeof provas>()

    for (const p of provas) {
      const nome = p.lanchas?.nome ?? ""

      if (!nome) continue

      if (!porLancha.has(nome)) {
        porLancha.set(nome, [])
      }

      porLancha.get(nome)!.push(p)
    }

    return [...porLancha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([lanchaNome, provs]) => {
        const sorted = [...provs].sort((a, b) =>
          b.data.localeCompare(a.data)
        )

        // Encontrar o início do ciclo atual
        const ultimaPosDock = sorted.find(
          p => p.descricao === "Pós-Docagem"
        )

        if (!ultimaPosDock) return null

        const dataBase = ultimaPosDock.data

        // Passos já executados no ciclo atual
        const feitos = new Set([
          "Pós-Docagem",
          ...provs
            .filter(p => p.data > dataBase && p.descricao !== "Pós-Docagem")
            .map(p => p.descricao),
        ])

        // Próximo passo pendente
        const proximoIdx = PASSOS.findIndex(
          passo => !feitos.has(passo.key)
        )

        const proximo =
          proximoIdx >= 0 ? PASSOS[proximoIdx] : null

        let dataEsperada: string | null = null
        let diasRestantes: number | null = null

        if (proximo?.dias != null) {
          dataEsperada = addDias(dataBase, proximo.dias)
          diasRestantes = diffDias(dataEsperada)
        }

        return {
          lanchaNome,
          dataBase,
          feitos,
          proximo,
          dataEsperada,
          diasRestantes,
          proximaDocagem:
            proximaDocagem[lanchaNome] ?? null,
        }
      })
      .filter(Boolean)
  }, [provas, periodicas])

  if (!alertas.length) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          Acompanhamento de Provas de Mar
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {alertas.map((a: any) => {
          const cicloCompleto = PASSOS.every(
            p => a.feitos.has(p.key)
          )

          let statusCor = "#6B7280"
          let statusLabel = ""
          let StatusIcon: any = Circle

          if (cicloCompleto) {
            statusCor = "#16A34A"
            statusLabel =
              "Ciclo completo — aguardando próxima docagem"
            StatusIcon = CheckCircle2
          } else if (a.proximo?.dias == null) {
            const docagem = a.proximaDocagem

            statusCor = "#6B7280"
            statusLabel = docagem
              ? `Fazer antes da docagem prevista (${fmtDate(docagem)})`
              : "Fazer antes da próxima docagem (data a definir)"

            StatusIcon = CalendarClock
          } else if (a.diasRestantes < 0) {
            statusCor = "#DC2626"
            statusLabel = `Atrasada ${Math.abs(
              a.diasRestantes
            )}d — prevista ${fmtDate(a.dataEsperada)}`
            StatusIcon = AlertTriangle
          } else if (a.diasRestantes <= 7) {
            statusCor = "#F97316"
            statusLabel =
              a.diasRestantes === 0
                ? "Hoje!"
                : `Em ${a.diasRestantes} dias (${fmtDate(
                    a.dataEsperada
                  )})`
            StatusIcon = Clock
          } else {
            statusCor = "#2563EB"
            statusLabel = `Em ${a.diasRestantes} dias — prevista ${fmtDate(
              a.dataEsperada
            )}`
            StatusIcon = CalendarClock
          }

          return (
            <div
              key={a.lanchaNome}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        LANCHA_COR[a.lanchaNome] ?? "#6B7280",
                    }}
                  />

                  <span className="text-sm font-semibold">
                    {a.lanchaNome}
                  </span>

                  <span className="text-xs text-muted-foreground">
                    · desde {fmtDate(a.dataBase)}
                  </span>
                </div>

                <div
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: statusCor }}
                >
                  <StatusIcon className="w-3.5 h-3.5" />
                  <span>{statusLabel}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {PASSOS.map((passo, idx) => {
                  const feito = a.feitos.has(passo.key)

                  const ehProximo =
                    !cicloCompleto &&
                    a.proximo?.key === passo.key

                  const dataStep =
                    passo.dias != null
                      ? addDias(a.dataBase, passo.dias)
                      : null

                  const cor = feito
                    ? "#16A34A"
                    : ehProximo
                    ? statusCor
                    : "#D1D5DB"

                  return (
                    <div
                      key={passo.key}
                      className="flex items-center gap-1 flex-1 min-w-0"
                    >
                      <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-all"
                          style={{
                            borderColor: cor,
                            backgroundColor: feito
                              ? cor
                              : "transparent",
                          }}
                        >
                          {feito ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          ) : ehProximo ? (
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: cor,
                              }}
                            />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-gray-300" />
                          )}
                        </div>

                        <span
                          className="text-[10px] font-medium text-center leading-none"
                          style={{
                            color: feito
                              ? "#16A34A"
                              : ehProximo
                              ? statusCor
                              : "#9CA3AF",
                          }}
                        >
                          {passo.label}
                        </span>

                        {ehProximo && dataStep && (
                          <span
                            className="text-[9px] font-semibold"
                            style={{ color: statusCor }}
                          >
                            {fmtDate(dataStep)}
                          </span>
                        )}

                        {ehProximo && !dataStep && (
                          <span className="text-[9px] text-muted-foreground">
                            a definir
                          </span>
                        )}
                      </div>

                      {idx < PASSOS.length - 1 && (
                        <ChevronRight
                          className="w-3 h-3 shrink-0 mb-3"
                          style={{
                            color: a.feitos.has(
                              PASSOS[idx + 1]?.key
                            )
                              ? "#16A34A"
                              : "#D1D5DB",
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
