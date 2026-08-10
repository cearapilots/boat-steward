import { useState, useMemo } from "react";
import {
  useOcorrencias, useManobras, useIndicadoresOp,
  useManutencoesPeriodicas, useManutencoesTipos,
} from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, LabelList,
  ScatterChart, Scatter, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Constantes ───────────────────────────────────────────────────────────────

const LANCHA_UUID_TO_CD: Record<string, number> = {
  "a0000000-0000-0000-0000-000000000001": 121,
  "a0000000-0000-0000-0000-000000000002": 1003,
  "a0000000-0000-0000-0000-000000000003": 117,
};

const LANCHA_NOME: Record<number, string> = { 121: "Flexeiras", 1003: "Fortim", 117: "Taíba" };
const LANCHA_COR:  Record<number, string> = { 121: "#2563EB",   1003: "#16A34A", 117: "#F97316" };
const LANCHAS = [
  { cd: 121,  nome: "Flexeiras" },
  { cd: 1003, nome: "Fortim"   },
  { cd: 117,  nome: "Taíba"    },
];

// "treinamento" é uma classe própria e NÃO está em selClasses (o filtro de
// Classificação lista apenas corretiva/preventiva/projeto/outros). Como
// `ocFiltradas` só aceita classes presentes em selClasses, treinamentos ficam
// fora de todos os KPIs e gráficos desta página — que é o comportamento
// desejado: treinar tripulação não é carga de manutenção.
function classifyTipo(tipo: string | null | undefined): "corretiva" | "preventiva" | "projeto" | "treinamento" | "outros" {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("projeto") || t.includes("melhoria") || t.includes("modificação")) return "projeto";
  if (t.includes("treinamento")) return "treinamento";
  if (t.includes("corretiva")) return "corretiva";
  if (t.includes("preventiva")) return "preventiva";
  return "outros";
}

// Horas que contam como CARGA DE MANUTENÇÃO nos KPIs e nos gráficos de taxa.
// Projeto/melhoria fica de fora por decisão de negócio: é investimento, não
// manutenção. Treinamento já é excluído antes, na origem (classifyTipo não
// devolve uma classe presente em selClasses).
// Atenção: os gráficos descritivos — empilhado de horas/mês e histograma de
// durações — NÃO usam este filtro, pois existem justamente para mostrar a
// composição, incluindo a barra roxa de projeto.
function contaComoManutencao(tipo: string | null | undefined): boolean {
  return classifyTipo(tipo) !== "projeto";
}

function extractFaina(tipo: string | null | undefined): string {
  return (tipo ?? "").replace(/\s*\((Corretiva|Preventiva)\)/gi, "").trim();
}

const COR_CLASSE: Record<string, string> = {
  corretiva:  "#DC2626",
  preventiva: "#16A34A",
  projeto:    "#8B5CF6",
  outros:     "#6B7280",
};

const LABEL_CLASSE: Record<string, string> = {
  corretiva:  "Corretiva",
  preventiva: "Preventiva",
  projeto:    "Projeto/Melhoria",
  outros:     "Outros",
};

const STATUS_COR: Record<string, string> = {
  ok:           "#16A34A",
  atencao:      "#F59E0B",
  critico:      "#DC2626",
  vencido:      "#991B1B",
  sem_registro: "#9CA3AF",
};

const STATUS_LABEL: Record<string, string> = {
  ok:           "OK",
  atencao:      "Atenção",
  critico:      "Crítico",
  vencido:      "Vencido",
  sem_registro: "Sem registro",
};

// ── Escalas dos heatmaps ─────────────────────────────────────────────────────
// Tons claros de propósito: o texto da célula é escuro e precisa continuar
// legível por cima. Como são cores fixas (não do tema), a célula força também a
// cor do texto — senão no modo escuro o texto claro sumiria sobre fundo claro.

const FAIXAS_RATIO = [
  { cor: "#DCFCE7", label: "0–25%"    },
  { cor: "#FEF9C3", label: "25–50%"   },
  { cor: "#FED7AA", label: "50–100%"  },
  { cor: "#FECACA", label: "100–200%" },
  { cor: "#FCA5A5", label: "200–300%" },
  { cor: "#F87171", label: ">300%"    },
  { cor: "#F3F4F6", label: "Baixa exposição" },
];

function ratioColor(ratio: number | null, exposicaoBaixa: boolean): string {
  if (exposicaoBaixa || ratio == null) return "#F3F4F6";
  if (ratio <= 25)  return "#DCFCE7";
  if (ratio <= 50)  return "#FEF9C3";
  if (ratio <= 100) return "#FED7AA";
  if (ratio <= 200) return "#FECACA";
  if (ratio <= 300) return "#FCA5A5";
  return "#F87171";
}

// Teto visual de 300%: acima disso a diferença já não informa nada — o mês foi
// atípico (pouca operação, muita parada) e o número exato fica no tooltip.
function ratioDisplay(ratio: number | null, exposicaoBaixa: boolean): string {
  if (exposicaoBaixa || ratio == null) return "—";
  return `${Math.min(ratio, 300).toFixed(0)}%`;
}

const FAIXAS_MTTR = [
  { cor: "#DCFCE7", label: "≤2h"     },
  { cor: "#FEF9C3", label: "2–6h"    },
  { cor: "#FED7AA", label: "6–24h"   },
  { cor: "#FECACA", label: "24–72h"  },
  { cor: "#F87171", label: ">72h"    },
  { cor: "#F9FAFB", label: "<3 obs." },
];

function mttrColor(valor: number | null): string {
  if (valor == null) return "#F9FAFB";
  if (valor <= 2)    return "#DCFCE7";
  if (valor <= 6)    return "#FEF9C3";
  if (valor <= 24)   return "#FED7AA";
  if (valor <= 72)   return "#FECACA";
  return "#F87171";
}

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ABR[parseInt(m) - 1]}/${y.slice(2)}`;
}

function horasNoMes(
  dataInicio: string,
  dataFim: string | null,
  duracaoHoras: number | null,
  monthStart: Date,
  monthEnd: Date,
): number {
  const s = new Date(dataInicio).getTime();
  let e: number;
  if (dataFim) {
    e = new Date(dataFim).getTime();
  } else if (duracaoHoras != null && duracaoHoras > 0) {
    e = s + duracaoHoras * 3_600_000;
  } else {
    return 0;
  }
  const cs = Math.max(s, monthStart.getTime());
  const ce = Math.min(e, monthEnd.getTime());
  if (cs >= ce) return 0;
  return (ce - cs) / 3_600_000;
}

function monthsInRange(de: string, ate: string): string[] {
  const months: string[] = [];
  const [startY, startM] = de.slice(0, 7).split("-").map(Number);
  const [endY,   endM  ] = ate.slice(0, 7).split("-").map(Number);
  let y = startY, m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

const BUCKETS = [
  { label: "<1h",  min: 0,   max: 1        },
  { label: "1–4h", min: 1,   max: 4        },
  { label: "4–8h", min: 4,   max: 8        },
  { label: "8–24h",min: 8,   max: 24       },
  { label: "1–3d", min: 24,  max: 72       },
  { label: "3–7d", min: 72,  max: 168      },
  { label: ">7d",  min: 168, max: Infinity  },
];

const todayStr    = new Date().toISOString().slice(0, 10);
const oneYearAgo  = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// Linha de detalhamento por lancha exibida abaixo do número da frota em cada
// scorecard. As cores vêm de LANCHA_COR para bater com o filtro e os gráficos.
function LanchaBreakdown({ items, fmt }: {
  items: Array<{ nome: string; cor: string; valor: number | null }>;
  fmt: (v: number) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border space-y-1">
      {items.map(i => (
        <div key={i.nome} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: i.cor }} />
            <span className="text-muted-foreground truncate">{i.nome}</span>
          </span>
          <span className="font-mono tabular-nums shrink-0">
            {i.valor != null ? fmt(i.valor) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ManutencaoPage() {
  const { data: ocorrencias }  = useOcorrencias();
  const { data: manobras }     = useManobras();
  const { data: indicadores }  = useIndicadoresOp();
  const { data: periodicas }   = useManutencoesPeriodicas();
  const { data: manutTipos }   = useManutencoesTipos();

  const [filterDe,      setFilterDe]      = useState(oneYearAgo);
  const [filterAte,     setFilterAte]     = useState(todayStr);
  const [selLanchas,    setSelLanchas]    = useState<number[]>([121, 1003, 117]);
  const [selClasses,    setSelClasses]    = useState<string[]>(["corretiva", "preventiva", "projeto", "outros"]);
  const [selFainas,     setSelFainas]     = useState<string[]>([]);  // vazio = todas
  const [filterEfeitos, setFilterEfeitos] = useState<string[]>([]);  // vazio = todos
  const [fainaSearch,   setFainaSearch]   = useState("");
  const [segmentarPorLancha, setSegmentarPorLancha] = useState(false);
  const [mttrMode, setMttrMode] = useState<"media" | "mediana" | "p90">("media");
  const [complianceSort, setComplianceSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "dias", dir: "asc" });

  function toggleLancha(cd: number) {
    setSelLanchas(prev =>
      prev.includes(cd) ? (prev.length > 1 ? prev.filter(x => x !== cd) : prev) : [...prev, cd]
    );
  }

  function toggleClasse(c: string) {
    setSelClasses(prev =>
      prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c]
    );
  }

  function toggleFaina(f: string) {
    setSelFainas(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  function toggleEfeito(e: string) {
    setFilterEfeitos(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const lanchasLabel = selLanchas.length === LANCHAS.length ? "Todas"
    : selLanchas.map(cd => LANCHA_NOME[cd]).join(", ");

  const classesLabel = selClasses.length === 4 ? "Todas"
    : selClasses.map(c => LABEL_CLASSE[c]).join(", ");

  const fainasLabel = selFainas.length === 0 ? "Todas"
    : selFainas.length === 1 ? (selFainas[0].length > 20 ? selFainas[0].slice(0, 19) + "…" : selFainas[0])
    : `${selFainas.length} fainas`;

  const efeitosLabel = filterEfeitos.length === 0 ? "Todos"
    : filterEfeitos.length === 1 ? filterEfeitos[0]
    : `${filterEfeitos.length} efeitos`;

  // ── Fainas dinâmicas ─────────────────────────────────────────────────────
  const allFainas = useMemo(() => {
    const s = new Set<string>();
    for (const o of (ocorrencias ?? []) as any[]) {
      const f = extractFaina(o.tipo_ocorrencia);
      if (f) s.add(f);
    }
    return [...s].sort();
  }, [ocorrencias]);

  const EFEITOS = ["Inoperante", "Operante com Restrições", "Operante", "Não Altera"];

  // ── Ocorrências filtradas ─────────────────────────────────────────────────
  // Sem pré-filtro de efeito para não excluir eventos classificados como 'outros'
  const ocFiltradas = useMemo(() => {
    return ((ocorrencias ?? []) as any[]).filter(o => {
      if (o.cd_lancha === null || !selLanchas.includes(o.cd_lancha)) return false;
      const d = (o.data_inicio ?? "").slice(0, 10);
      if (d < filterDe || d > filterAte) return false;
      if (!selClasses.includes(classifyTipo(o.tipo_ocorrencia))) return false;
      if (selFainas.length > 0 && !selFainas.includes(extractFaina(o.tipo_ocorrencia))) return false;
      if (filterEfeitos.length > 0 && !filterEfeitos.includes(o.efeito)) return false;
      return true;
    });
  }, [ocorrencias, filterDe, filterAte, selLanchas, selClasses, selFainas, filterEfeitos]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    // Somatórios da frota e por lancha usam exatamente a mesma fórmula, para
    // que o detalhamento das lanchas feche com o total exibido acima dele.
    const somaHoras = (lista: any[]) => lista
      .filter((o: any) => contaComoManutencao(o.tipo_ocorrencia))
      .reduce((s: number, o: any) => s + (Number(o.duracao_horas) || 0), 0);

    // Corretiva que tirou a lancha de operação. O recorte "Inoperante" segue o
    // mesmo critério já usado no gráfico de % Manut/Operada.
    const contaCorretivas = (lista: any[]) => lista.filter((o: any) =>
      classifyTipo(o.tipo_ocorrencia) === "corretiva" &&
      (o.efeito ?? "").trim() === "Inoperante"
    ).length;

    const noPeriodo = (d: string) => d >= filterDe && d <= filterAte;

    const horasOpDe = (cds: number[]) => ((indicadores ?? []) as any[])
      .filter(i => cds.includes(Number(i.cd_lancha)) && noPeriodo((i.dh_leitura ?? "").slice(0, 10)))
      .reduce((s: number, i: any) => s + (Number(i.dc_dif_be) || 0), 0);

    const manobrasDe = (cds: number[]) => ((manobras ?? []) as any[])
      .filter(m => cds.includes(Number(m.cd_lancha)) && noPeriodo((m.dh_manobra ?? "").slice(0, 10)))
      .length;

    const horasManut  = somaHoras(ocFiltradas);
    const horasOp     = horasOpDe(selLanchas);
    const nManobras   = manobrasDe(selLanchas);
    const corretivas  = contaCorretivas(ocFiltradas);

    // Detalhamento por lancha — só as selecionadas no filtro.
    const porLancha = LANCHAS.filter(l => selLanchas.includes(l.cd)).map(l => {
      const ocL       = (ocFiltradas as any[]).filter(o => Number(o.cd_lancha) === l.cd);
      const horasManutL = somaHoras(ocL);
      const horasOpL    = horasOpDe([l.cd]);
      const nManobrasL  = manobrasDe([l.cd]);
      const corretivasL = contaCorretivas(ocL);
      return {
        cd: l.cd,
        nome: l.nome,
        cor: LANCHA_COR[l.cd],
        horasManut:      horasManutL,
        ratioManutOp:    horasOpL   > 0 ? horasManutL / horasOpL * 100     : null,
        horasPorManobra: nManobrasL > 0 ? horasManutL / nManobrasL          : null,
        taxaCorretivas:  nManobrasL > 0 ? corretivasL / nManobrasL * 100    : null,
        nManobras:       nManobrasL,
      };
    });

    return {
      horasManut,
      horasOp,
      ratioManutOp:    horasOp > 0 ? (horasManut / horasOp * 100) : null,
      horasPorManobra: nManobras > 0 ? horasManut / nManobras : null,
      taxaCorretivas:  nManobras > 0 ? corretivas / nManobras * 100 : null,
      nManobras,
      porLancha,
    };
  }, [ocFiltradas, indicadores, manobras, filterDe, filterAte, selLanchas]);

  // ── Gráfico 1: Horas por mês empilhadas ──────────────────────────────────
  const dadosHorasMes = useMemo(() => {
    const months = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);
    return months.map(month => {
      const [my, mm] = month.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);
      const pt: Record<string, any> = { mes: fmtMes(month), corretiva: 0, preventiva: 0, projeto: 0, outros: 0 };
      for (const o of ocFiltradas as any[]) {
        if (!o.data_inicio) continue;
        const h = horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
        if (h <= 0) continue;
        const cls = classifyTipo(o.tipo_ocorrencia);
        pt[cls] = Math.round(((pt[cls] ?? 0) + h) * 10) / 10;
      }
      return pt;
    });
  }, [ocFiltradas, filterDe, filterAte]);

  // ── Gráfico 1b: mesmas horas, mas separadas por lancha ───────────────────
  // Chaves compostas "Lancha_classe" para o Recharts empilhar por lancha
  // (stackId = nome da lancha) e agrupar as lanchas lado a lado no mês.
  const dadosHorasMesLancha = useMemo(() => {
    if (!segmentarPorLancha) return [];
    const classes = ["corretiva", "preventiva", "projeto", "outros"] as const;
    const months  = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);
    return months.map(month => {
      const [my, mm] = month.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);
      const pt: Record<string, any> = { mes: fmtMes(month) };
      for (const l of LANCHAS) {
        for (const c of classes) pt[`${l.nome}_${c}`] = 0;
      }
      for (const o of ocFiltradas as any[]) {
        if (!o.data_inicio) continue;
        const nome = LANCHA_NOME[Number(o.cd_lancha)];
        if (!nome) continue;
        const h = horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
        if (h <= 0) continue;
        const key = `${nome}_${classifyTipo(o.tipo_ocorrencia)}`;
        if (key in pt) pt[key] = Math.round((pt[key] + h) * 10) / 10;
      }
      return pt;
    });
  }, [ocFiltradas, segmentarPorLancha, filterDe, filterAte]);

  // ── Gráfico 2: matriz lancha × mês do índice de intervenção ──────────────
  // Substitui o antigo gráfico de linhas: com 3 lanchas e 12+ meses as linhas
  // se cruzavam demais. A matriz mostra todos os pares de uma vez e destaca
  // meses de baixa exposição, onde o percentual não é comparável.
  const dadosMatrizRatio = useMemo(() => {
    const months = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);

    // Horas operadas por mês e lancha (mesmo filtro de data dos demais KPIs)
    const opMap = new Map<string, Map<number, number>>();
    for (const i of (indicadores ?? []) as any[]) {
      const d   = (i.dh_leitura ?? "").slice(0, 10);
      const mes = d.slice(0, 7);
      if (!mes || d < filterDe || d > filterAte) continue;
      if (!opMap.has(mes)) opMap.set(mes, new Map());
      const om = opMap.get(mes)!;
      om.set(Number(i.cd_lancha), (om.get(Number(i.cd_lancha)) ?? 0) + (Number(i.dc_dif_be) || 0));
    }

    const linhas = LANCHAS.filter(l => selLanchas.includes(l.cd)).map(l => {
      const meses = months.map(mes => {
        const [my, mm] = mes.split("-").map(Number);
        const monthStart = new Date(my, mm - 1, 1);
        const monthEnd   = new Date(my, mm,     1);

        let hManut = 0;
        for (const o of ocFiltradas as any[]) {
          if (Number(o.cd_lancha) !== l.cd || !o.data_inicio) continue;
          if ((o.efeito ?? "").trim() !== "Inoperante") continue;
          if (!contaComoManutencao(o.tipo_ocorrencia)) continue;
          hManut += horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
        }
        const hOp = opMap.get(mes)?.get(l.cd) ?? 0;
        return {
          mes,
          ratio: hOp > 0 ? hManut / hOp * 100 : null,
          hManut: Math.round(hManut * 10) / 10,
          hOp:    Math.round(hOp * 10) / 10,
          exposicaoBaixa: hOp < 20,
        };
      });
      return { lancha: l.nome, cd: l.cd, cor: LANCHA_COR[l.cd], meses };
    });

    // Linha da frota: recalcula sobre os totais, não é média das lanchas.
    // Limiar de exposição 3x maior porque agrega três embarcações.
    const frota = months.map((mes, i) => {
      const hManut = linhas.reduce((s, l) => s + l.meses[i].hManut, 0);
      const hOp    = linhas.reduce((s, l) => s + l.meses[i].hOp,    0);
      return {
        mes,
        ratio: hOp > 0 ? hManut / hOp * 100 : null,
        hManut: Math.round(hManut * 10) / 10,
        hOp:    Math.round(hOp * 10) / 10,
        exposicaoBaixa: hOp < 60,
      };
    });

    return {
      months,
      linhas: [...linhas, { lancha: "Frota", cd: 0, cor: "#374151", meses: frota }],
    };
  }, [ocFiltradas, indicadores, selLanchas, filterDe, filterAte]);

  // ── Gráfico 3: horas de manutenção por 100 manobras ──────────────────────
  // Normaliza a carga pelo uso: 3 séries (total, corretiva, preventiva).
  // Projeto e treinamento ficam de fora (contaComoManutencao).
  const dadosCargaManobra = useMemo(() => {
    const manobraMap = new Map<string, number>();
    for (const m of (manobras ?? []) as any[]) {
      if (!selLanchas.includes(Number(m.cd_lancha))) continue;
      const d   = (m.dh_manobra ?? "").slice(0, 10);
      const mes = d.slice(0, 7);
      if (!mes || d < filterDe || d > filterAte) continue;
      manobraMap.set(mes, (manobraMap.get(mes) ?? 0) + 1);
    }

    const months = monthsInRange(filterDe || oneYearAgo, filterAte || todayStr);
    return months.map(mes => {
      const [my, mm] = mes.split("-").map(Number);
      const monthStart = new Date(my, mm - 1, 1);
      const monthEnd   = new Date(my, mm,     1);

      let hTotal = 0, hCorretiva = 0, hPreventiva = 0;
      for (const o of ocFiltradas as any[]) {
        if (!o.data_inicio) continue;
        if (!contaComoManutencao(o.tipo_ocorrencia)) continue;
        const h = horasNoMes(o.data_inicio, o.data_fim, o.duracao_horas, monthStart, monthEnd);
        if (h <= 0) continue;
        hTotal += h;
        const cls = classifyTipo(o.tipo_ocorrencia);
        if (cls === "corretiva")  hCorretiva  += h;
        if (cls === "preventiva") hPreventiva += h;
      }

      const n = manobraMap.get(mes) ?? 0;
      const por100 = (h: number) => n > 0 ? Math.round(h / n * 100 * 10) / 10 : null;
      return {
        mes: fmtMes(mes),
        total:      por100(hTotal),
        corretiva:  por100(hCorretiva),
        preventiva: por100(hPreventiva),
      };
    });
  }, [ocFiltradas, manobras, selLanchas, filterDe, filterAte]);

  // ── Gráfico 4: horas de manutenção por faina ─────────────────────────────
  // Eixo em HORAS (não em contagem): uma faina rara mas demorada pesa mais que
  // uma frequente e rápida. Projeto/treinamento ficam de fora; "outros" segue
  // como faixa própria — somá-lo à preventiva inflaria esse número.
  const dadosHorasFaina = useMemo(() => {
    const map = new Map<string, { corretiva: number; preventiva: number; outros: number }>();
    for (const o of ocFiltradas as any[]) {
      if (!contaComoManutencao(o.tipo_ocorrencia)) continue;
      const cls = classifyTipo(o.tipo_ocorrencia);
      if (cls !== "corretiva" && cls !== "preventiva" && cls !== "outros") continue;
      const f = extractFaina(o.tipo_ocorrencia) || "Sem tipo";
      if (!map.has(f)) map.set(f, { corretiva: 0, preventiva: 0, outros: 0 });
      map.get(f)![cls] += Number(o.duracao_horas) || 0;
    }
    return [...map.entries()]
      .map(([faina, v]) => {
        const total = v.corretiva + v.preventiva + v.outros;
        const r1 = (n: number) => Math.round(n * 10) / 10;
        return {
          faina,
          corretiva:  r1(v.corretiva),
          preventiva: r1(v.preventiva),
          outros:     r1(v.outros),
          total:      r1(total),
          pctCorretiva:  total > 0 ? Math.round(v.corretiva  / total * 100) : 0,
          pctPreventiva: total > 0 ? Math.round(v.preventiva / total * 100) : 0,
          pctOutros:     total > 0 ? Math.round(v.outros     / total * 100) : 0,
        };
      })
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [ocFiltradas]);

  // ── Gráfico 6: dispersão de priorização por faina ────────────────────────
  // Cruza frequência (nº de corretivas) com impacto (horas paradas). O que
  // interessa é o canto superior direito: quebra muito E demora para resolver.
  const dadosScatter = useMemo(() => {
    const map = new Map<string, { n: number; horas: number }>();
    for (const o of ocFiltradas as any[]) {
      if (classifyTipo(o.tipo_ocorrencia) !== "corretiva") continue;
      if ((o.efeito ?? "").trim() !== "Inoperante") continue;
      const f = extractFaina(o.tipo_ocorrencia) || "Sem tipo";
      if (!map.has(f)) map.set(f, { n: 0, horas: 0 });
      const e = map.get(f)!;
      e.n     += 1;
      e.horas += Number(o.duracao_horas) || 0;
    }
    return [...map.entries()]
      .filter(([, v]) => v.n >= 2)   // 1 ocorrência não caracteriza recorrência
      .map(([faina, v]) => ({
        faina,
        ocorrencias: v.n,
        horas: Math.round(v.horas * 10) / 10,
      }));
  }, [ocFiltradas]);

  // Medianas dividem o gráfico em quadrantes — referência relativa à própria
  // frota, não a um alvo externo arbitrário.
  const medianas = useMemo(() => {
    const med = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    return {
      ocorr: med(dadosScatter.map(d => d.ocorrencias)),
      horas: med(dadosScatter.map(d => d.horas)),
    };
  }, [dadosScatter]);

  function corQuadrante(d: { ocorrencias: number; horas: number }): string {
    const freq  = d.ocorrencias >= medianas.ocorr;
    const grave = d.horas       >= medianas.horas;
    if (freq && grave) return "#DC2626";  // alta prioridade
    if (freq)          return "#F59E0B";  // recorrente, baixa severidade
    if (grave)         return "#F97316";  // raro mas grave
    return "#16A34A";                     // baixa preocupação
  }

  // ── Gráfico 7: MTTR por faina × lancha ───────────────────────────────────
  // Mediana e P90 existem porque a média é distorcida por um único evento
  // longo — comum quando falta peça e a lancha fica dias parada.
  const dadosMttr = useMemo(() => {
    const map = new Map<string, Map<string, number[]>>();
    for (const o of ocFiltradas as any[]) {
      if (classifyTipo(o.tipo_ocorrencia) !== "corretiva") continue;
      if ((o.efeito ?? "").trim() !== "Inoperante") continue;
      const h = Number(o.duracao_horas);
      if (!h || h <= 0) continue;
      const faina  = extractFaina(o.tipo_ocorrencia) || "Sem tipo";
      const lancha = LANCHA_NOME[Number(o.cd_lancha)];
      if (!lancha) continue;
      if (!map.has(faina)) map.set(faina, new Map());
      const fm = map.get(faina)!;
      if (!fm.has(lancha)) fm.set(lancha, []);
      fm.get(lancha)!.push(h);
    }

    // Menos de 3 observações não sustenta uma estatística — célula fica vazia.
    const stat = (vals: number[]): number | null => {
      if (vals.length < 3) return null;
      const s = [...vals].sort((a, b) => a - b);
      if (mttrMode === "media")   return s.reduce((a, b) => a + b, 0) / s.length;
      if (mttrMode === "mediana") return s[Math.floor(s.length / 2)];
      return s[Math.min(Math.ceil(s.length * 0.9) - 1, s.length - 1)];
    };

    const colunas = [...LANCHAS.filter(l => selLanchas.includes(l.cd)).map(l => l.nome), "Frota"];

    const linhas = [...map.entries()].map(([faina, fm]) => {
      const cells: Record<string, { valor: number | null; n: number }> = {};
      for (const col of colunas) {
        const vals = col === "Frota" ? [...fm.values()].flat() : (fm.get(col) ?? []);
        cells[col] = { valor: stat(vals), n: vals.length };
      }
      return { faina, cells, totalObs: [...fm.values()].flat().length };
    })
    // Fainas sem nenhuma célula preenchida só ocupariam espaço
    .filter(r => colunas.some(c => r.cells[c].valor != null))
    .sort((a, b) => (b.cells["Frota"].valor ?? 0) - (a.cells["Frota"].valor ?? 0));

    return { colunas, linhas };
  }, [ocFiltradas, selLanchas, mttrMode]);

  // ── Gráfico 5: Histograma durações ────────────────────────────────────────
  const dadosHistograma = useMemo(() => {
    return BUCKETS.map(b => {
      const bucket = (ocFiltradas as any[]).filter(o => {
        const h = Number(o.duracao_horas) || 0;
        return h >= b.min && h < b.max;
      });
      return {
        label:      b.label,
        corretiva:  bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "corretiva").length,
        preventiva: bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "preventiva").length,
        projeto:    bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "projeto").length,
        outros:     bucket.filter((o: any) => classifyTipo(o.tipo_ocorrencia) === "outros").length,
      };
    });
  }, [ocFiltradas]);

  // ── Compliance periódicas ─────────────────────────────────────────────────
  const complianceByLancha = useMemo(() => {
    void manutTipos; // cache warming
    const filtered = (periodicas ?? []).filter(p =>
      selLanchas.includes(LANCHA_UUID_TO_CD[p.lancha_id] ?? -1)
    );
    const byLancha = new Map<string, typeof filtered>();
    for (const p of filtered) {
      if (!byLancha.has(p.lancha_nome)) byLancha.set(p.lancha_nome, []);
      byLancha.get(p.lancha_nome)!.push(p);
    }
    return byLancha;
  }, [periodicas, selLanchas, manutTipos]);

  const complianceFlatSorted = useMemo(() => {
    const rows: any[] = [];
    for (const [, items] of complianceByLancha.entries()) {
      for (const item of items) rows.push(item);
    }
    const statusOrder: Record<string, number> = { vencido: 0, critico: 1, atencao: 2, ok: 3, sem_registro: 4 };
    return rows.sort((a, b) => {
      const dir = complianceSort.dir === "asc" ? 1 : -1;
      if (complianceSort.key === "dias") {
        const da = a.dias_restantes ?? Infinity;
        const db = b.dias_restantes ?? Infinity;
        return (da - db) * dir;
      }
      if (complianceSort.key === "nome")   return a.tipo_nome.localeCompare(b.tipo_nome)     * dir;
      if (complianceSort.key === "lancha") return a.lancha_nome.localeCompare(b.lancha_nome) * dir;
      return ((statusOrder[a.status_semaforo] ?? 5) - (statusOrder[b.status_semaforo] ?? 5)) * dir;
    });
  }, [complianceByLancha, complianceSort]);

  const vencidosCount = useMemo(
    () => complianceFlatSorted.filter(x => x.status_semaforo === "vencido" || x.status_semaforo === "critico").length,
    [complianceFlatSorted],
  );

  const fmtH    = (v: number) => `${v.toFixed(1)}h`;
  const fmtPct  = (v: number) => `${v.toFixed(1)}%`;
  const fmtH2   = (v: number) => `${v.toFixed(2)}h`;
  const fmtTaxa = (v: number) => v.toFixed(2);
  const fmtInt  = (v: number) => String(Math.round(v));

  const KPI_CARDS: Array<{
    label: string;
    value: string;
    fmt: (v: number) => string;
    pick: (l: (typeof kpis.porLancha)[number]) => number | null;
  }> = [
    {
      label: "Total h Manutenção",
      value: fmtH(kpis.horasManut),
      fmt: fmtH,   pick: l => l.horasManut,
    },
    {
      label: "% Manut / Operada",
      value: kpis.ratioManutOp !== null ? fmtPct(kpis.ratioManutOp) : "—",
      fmt: fmtPct, pick: l => l.ratioManutOp,
    },
    {
      label: "Corretivas / 100 Manobras",
      value: kpis.taxaCorretivas !== null ? fmtTaxa(kpis.taxaCorretivas) : "—",
      fmt: fmtTaxa, pick: l => l.taxaCorretivas,
    },
    {
      label: "h Manut / Manobra",
      value: kpis.horasPorManobra !== null ? fmtH2(kpis.horasPorManobra) : "—",
      fmt: fmtH2,  pick: l => l.horasPorManobra,
    },
    {
      label: "Nº Manobras",
      value: String(kpis.nManobras),
      fmt: fmtInt, pick: l => l.nManobras,
    },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manutenção</h1>
        <p className="text-sm text-accent">Análise de ocorrências e manutenções das lanchas</p>
      </div>

      {/* Banner — manutenções vencidas / críticas */}
      {vencidosCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-400">
            <strong>
              {vencidosCount} {vencidosCount === 1 ? "manutenção vencida ou crítica" : "manutenções vencidas ou críticas"}
            </strong>
            {" "}— verifique a tabela de Manutenções Periódicas abaixo.
          </span>
        </div>
      )}

      {/* Filtros — mesmo padrão visual de OperacoesPage */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">

            {/* Lanchas — Popover com checkboxes */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Lanchas</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{lanchasLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {LANCHAS.map(l => (
                    <label key={l.cd} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={selLanchas.includes(l.cd)} onCheckedChange={() => toggleLancha(l.cd)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LANCHA_COR[l.cd] }} />
                      <span className="text-sm">{l.nome}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Datas — input nativo igual OperacoesPage */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">De</span>
              <input type="date" value={filterDe} onChange={e => setFilterDe(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Até</span>
              <input type="date" value={filterAte} onChange={e => setFilterAte(e.target.value)} className={inputClass} />
            </div>

            {/* Classificação — Popover com checkboxes */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[150px]">
                  <span className="font-medium">Classificação</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{classesLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {(["corretiva", "preventiva", "projeto", "outros"] as const).map(c => (
                    <label key={c} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={selClasses.includes(c)} onCheckedChange={() => toggleClasse(c)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR_CLASSE[c] }} />
                      <span className="text-sm">{LABEL_CLASSE[c]}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Faina — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[150px]">
                  <span className="font-medium">Faina</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{fainasLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="pb-2">
                  <input
                    type="text"
                    placeholder="Buscar faina…"
                    value={fainaSearch}
                    onChange={e => setFainaSearch(e.target.value)}
                    className={inputClass + " w-full"}
                  />
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {allFainas
                    .filter(f => f.toLowerCase().includes(fainaSearch.toLowerCase()))
                    .map(f => (
                      <label key={f} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                        <Checkbox checked={selFainas.includes(f)} onCheckedChange={() => toggleFaina(f)} />
                        <span className="text-sm">{f}</span>
                      </label>
                    ))}
                  {allFainas.filter(f => f.toLowerCase().includes(fainaSearch.toLowerCase())).length === 0 && (
                    <p className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhuma faina encontrada</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Efeito — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-3 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground transition-colors min-w-[140px]">
                  <span className="font-medium">Efeito</span>
                  <span className="text-muted-foreground text-xs flex-1 text-right truncate">{efeitosLabel}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-2" align="start">
                <div className="space-y-1">
                  {EFEITOS.map(e => (
                    <label key={e} className="flex items-center gap-2 rounded px-2 py-1.5 cursor-pointer hover:bg-accent">
                      <Checkbox checked={filterEfeitos.includes(e)} onCheckedChange={() => toggleEfeito(e)} />
                      <span className="text-sm">{e}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPI_CARDS.map(({ label, value, fmt, pick }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-0.5">{value}</p>
              <LanchaBreakdown
                items={kpis.porLancha.map(l => ({ nome: l.nome, cor: l.cor, valor: pick(l) }))}
                fmt={fmt}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico 1 — Horas de manutenção por mês (barras empilhadas) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-base">Horas de Manutenção por Mês</CardTitle>
            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <span className="text-xs text-muted-foreground">Por lancha</span>
              <Switch checked={segmentarPorLancha} onCheckedChange={setSegmentarPorLancha} />
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {dadosHorasMes.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">Sem dados no período</p>
          ) : (
            <ResponsiveContainer width="100%" height={segmentarPorLancha ? 340 : 280}>
              <BarChart
                data={segmentarPorLancha ? dadosHorasMesLancha : dadosHorasMes}
                margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `${v}h`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [
                  `${Number(v).toFixed(1)}h`, LABEL_CLASSE[name] ?? name,
                ]} />
                <Legend formatter={v => LABEL_CLASSE[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                {segmentarPorLancha
                  // Uma pilha por lancha (stackId = nome), lado a lado no mês.
                  // A cor identifica a lancha; a opacidade, a classificação.
                  ? LANCHAS.filter(l => selLanchas.includes(l.cd)).flatMap(l => ([
                      <Bar key={`${l.nome}_corretiva`}  dataKey={`${l.nome}_corretiva`}
                           stackId={l.nome} fill={LANCHA_COR[l.cd]}
                           name={`${l.nome} — Corretiva`} />,
                      <Bar key={`${l.nome}_preventiva`} dataKey={`${l.nome}_preventiva`}
                           stackId={l.nome} fill={LANCHA_COR[l.cd]} fillOpacity={0.6}
                           name={`${l.nome} — Preventiva`} />,
                      <Bar key={`${l.nome}_projeto`}    dataKey={`${l.nome}_projeto`}
                           stackId={l.nome} fill={LANCHA_COR[l.cd]} fillOpacity={0.35}
                           name={`${l.nome} — Projeto`} />,
                      <Bar key={`${l.nome}_outros`}     dataKey={`${l.nome}_outros`}
                           stackId={l.nome} fill={LANCHA_COR[l.cd]} fillOpacity={0.18}
                           name={`${l.nome} — Outros`} radius={[3, 3, 0, 0]} />,
                    ]))
                  : ([
                      <Bar key="corretiva"  dataKey="corretiva"  stackId="a" fill={COR_CLASSE.corretiva}  />,
                      <Bar key="preventiva" dataKey="preventiva" stackId="a" fill={COR_CLASSE.preventiva} />,
                      <Bar key="projeto"    dataKey="projeto"    stackId="a" fill={COR_CLASSE.projeto}    />,
                      <Bar key="outros"     dataKey="outros"     stackId="a" fill={COR_CLASSE.outros} radius={[3, 3, 0, 0]} />,
                    ])}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gráfico 2 — Matriz do índice de intervenção (largura total) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Índice de Tempo de Intervenção por Hora Operada</CardTitle>
          <p className="text-xs text-muted-foreground">
            Horas paradas em manutenção (inoperante) sobre horas operadas. Exclui projetos e treinamentos.
          </p>
        </CardHeader>
        <CardContent>
          {dadosMatrizRatio.months.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[92px]">
                        Lancha
                      </th>
                      {dadosMatrizRatio.months.map(m => (
                        <th key={m} className="py-1.5 px-1 font-medium text-muted-foreground text-center min-w-[52px]">
                          {fmtMes(m)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dadosMatrizRatio.linhas.map(l => (
                      <tr key={l.lancha} className={l.cd === 0 ? "border-t-2 border-border font-semibold" : ""}>
                        <td className="py-1.5 px-2 sticky left-0 bg-card z-10">
                          <span className="flex items-center gap-1.5">
                            {l.cd > 0 && (
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
                            )}
                            <span>{l.lancha}</span>
                          </span>
                        </td>
                        {l.meses.map(m => (
                          <td
                            key={m.mes}
                            className="py-1.5 px-1 text-center"
                            style={{ backgroundColor: ratioColor(m.ratio, m.exposicaoBaixa), color: "#1F2937" }}
                            title={m.exposicaoBaixa
                              ? `${fmtMes(m.mes)}: exposição baixa (${m.hOp}h operadas) — percentual não comparável`
                              : `${fmtMes(m.mes)}: ${m.ratio?.toFixed(1) ?? "—"}% (${m.hManut}h manut / ${m.hOp}h operadas)`}
                          >
                            <span className="font-mono text-[11px]">
                              {ratioDisplay(m.ratio, m.exposicaoBaixa)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
                {FAIXAS_RATIO.map(f => (
                  <span key={f.label} className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: f.cor }} />
                    {f.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Gráficos 3 + 4 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Gráfico 3 — Horas de manutenção por 100 manobras */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Horas de Manutenção por 100 Manobras</CardTitle>
            <p className="text-xs text-muted-foreground">
              Carga normalizada pelo uso. Exclui projetos de melhoria e treinamentos.
            </p>
          </CardHeader>
          <CardContent>
            {dadosCargaManobra.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dadosCargaManobra} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${v}h`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any, n: string) => [`${Number(v).toFixed(1)}h / 100 man`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total"      name="Total"
                        stroke="#1E40AF" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="corretiva"  name="Corretiva"
                        stroke={COR_CLASSE.corretiva}  strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="preventiva" name="Preventiva"
                        stroke={COR_CLASSE.preventiva} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 4 — Horas de manutenção por tipo de faina */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Horas em Manutenção por Tipo de Faina</CardTitle>
            <p className="text-xs text-muted-foreground">
              Rótulos mostram a participação de cada classificação na faina.
            </p>
          </CardHeader>
          <CardContent>
            {dadosHorasFaina.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, dadosHorasFaina.length * 32 + 50)}>
                <BarChart
                  data={dadosHorasFaina}
                  layout="vertical"
                  margin={{ top: 5, right: 45, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={v => `${v}h`} tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="faina" type="category"
                    tick={{ fontSize: 9 }} width={130}
                    tickFormatter={v => v.length > 22 ? v.slice(0, 22) + "…" : v}
                  />
                  <Tooltip
                    formatter={(v: number, name: string, p: any) => {
                      const total = p?.payload?.total ?? 0;
                      const pct = total > 0 ? Math.round(Number(v) / total * 100) : 0;
                      return [`${Number(v).toFixed(1)}h (${pct}%)`, LABEL_CLASSE[name] ?? name];
                    }}
                  />
                  <Legend formatter={v => LABEL_CLASSE[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="corretiva"  stackId="a" fill={COR_CLASSE.corretiva}>
                    <LabelList dataKey="pctCorretiva" position="center" fontSize={9} fill="#fff"
                               formatter={(v: number) => v >= 15 ? `${v}%` : ""} />
                  </Bar>
                  <Bar dataKey="preventiva" stackId="a" fill={COR_CLASSE.preventiva}>
                    <LabelList dataKey="pctPreventiva" position="center" fontSize={9} fill="#fff"
                               formatter={(v: number) => v >= 15 ? `${v}%` : ""} />
                  </Bar>
                  <Bar dataKey="outros"     stackId="a" fill={COR_CLASSE.outros}>
                    <LabelList dataKey="total" position="right" fontSize={9} fill="#6B7280"
                               formatter={(v: number) => `${Number(v).toFixed(0)}h`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Gráficos 6 + 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Gráfico 6 — Dispersão de priorização por faina */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispersão de Priorização por Faina</CardTitle>
            <p className="text-xs text-muted-foreground">
              Só corretivas inoperantes, com 2+ ocorrências. As linhas marcam a mediana da frota.
            </p>
          </CardHeader>
          <CardContent>
            {dadosScatter.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">
                Sem fainas com 2 ou mais corretivas no período
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      type="number" dataKey="ocorrencias" name="Ocorrências"
                      tick={{ fontSize: 10 }}
                      label={{ value: "Nº de corretivas", position: "insideBottom", offset: -12, fontSize: 10 }}
                    />
                    <YAxis
                      type="number" dataKey="horas" name="Horas"
                      tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`}
                    />
                    <ReferenceLine x={medianas.ocorr} stroke="#9CA3AF" strokeDasharray="3 3" />
                    <ReferenceLine y={medianas.horas} stroke="#9CA3AF" strokeDasharray="3 3" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ payload }: any) => {
                        const d = payload?.[0]?.payload;
                        if (!d) return null;
                        return (
                          <div className="bg-popover border border-border rounded-md shadow-md px-2.5 py-1.5 text-xs">
                            <p className="font-semibold">{d.faina}</p>
                            <p>{d.ocorrencias} ocorrências · {d.horas}h paradas</p>
                            <p className="text-muted-foreground">
                              Média de {(d.horas / d.ocorrencias).toFixed(1)}h por evento
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={dadosScatter}>
                      {dadosScatter.map((d, i) => (
                        <Cell key={i} fill={corQuadrante(d)} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
                  {[
                    { cor: "#DC2626", label: "Alta prioridade (frequente e demorada)" },
                    { cor: "#F59E0B", label: "Recorrente, resolve rápido" },
                    { cor: "#F97316", label: "Rara, mas para a lancha por muito tempo" },
                    { cor: "#16A34A", label: "Baixa preocupação" },
                  ].map(q => (
                    <span key={q.label} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: q.cor }} />
                      {q.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 5 — Distribuição de durações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição de Duração das Manutenções</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosHistograma} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [v, LABEL_CLASSE[name] ?? name]} />
                <Legend formatter={v => LABEL_CLASSE[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="corretiva"  stackId="a" fill={COR_CLASSE.corretiva}  />
                <Bar dataKey="preventiva" stackId="a" fill={COR_CLASSE.preventiva} />
                <Bar dataKey="projeto"    stackId="a" fill={COR_CLASSE.projeto}    />
                <Bar dataKey="outros"     stackId="a" fill={COR_CLASSE.outros}     radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 7 — Matriz MTTR por faina × lancha */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">MTTR por Faina — Tempo de Reparo Corretivo</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Só corretivas inoperantes. Células com menos de 3 observações ficam vazias.
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {([
                { k: "media",   label: "Média"   },
                { k: "mediana", label: "Mediana" },
                { k: "p90",     label: "P90"     },
              ] as const).map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => setMttrMode(k)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    mttrMode === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dadosMttr.linhas.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Nenhuma faina com 3 ou mais corretivas inoperantes no período
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[130px]">
                        Faina
                      </th>
                      {dadosMttr.colunas.map(c => (
                        <th key={c} className="py-1.5 px-3 font-medium text-muted-foreground text-center min-w-[80px]">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dadosMttr.linhas.map(row => (
                      <tr key={row.faina} className="border-t border-border">
                        <td className="py-1.5 px-2 sticky left-0 bg-card z-10 font-medium">
                          {row.faina}
                        </td>
                        {dadosMttr.colunas.map(c => {
                          const cell = row.cells[c];
                          return (
                            <td
                              key={c}
                              className="py-1.5 px-3 text-center"
                              style={{ backgroundColor: mttrColor(cell.valor), color: "#1F2937" }}
                              title={cell.valor != null
                                ? `${row.faina} × ${c}: ${cell.valor.toFixed(1)}h (${cell.n} ocorrências)`
                                : `${row.faina} × ${c}: dados insuficientes (${cell.n} ocorrências)`}
                            >
                              <span className="font-mono text-[11px]">
                                {cell.valor != null ? `${cell.valor.toFixed(1)}h` : "—"}
                              </span>
                              {cell.valor != null && cell.n < 5 && (
                                <span className="text-[8px] opacity-60 ml-0.5">({cell.n})</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground flex-wrap">
                {FAIXAS_MTTR.map(f => (
                  <span key={f.label} className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: f.cor }} />
                    {f.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Gráfico 8 — Compliance Manutenções Periódicas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status das Manutenções Periódicas</CardTitle>
        </CardHeader>
        <CardContent>
          {complianceFlatSorted.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem dados de manutenções periódicas
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {([
                      { key: "nome",   label: "Tipo"       },
                      { key: "lancha", label: "Lancha"     },
                      { key: "status", label: "Status"     },
                      { key: "dias",   label: "Dias Rest." },
                    ] as const).map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => setComplianceSort(prev => ({
                          key,
                          dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
                        }))}
                        className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                      >
                        {label}
                        {complianceSort.key === key ? (complianceSort.dir === "asc" ? " ↑" : " ↓") : ""}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Próxima Data</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Periodicidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {complianceFlatSorted.map(item => {
                    const isOverdue = (item.dias_restantes ?? 0) < 0;
                    return (
                      <tr key={`${item.lancha_nome}-${item.tipo_id}`} className="hover:bg-muted/40">
                        <td className="px-3 py-2.5 font-medium">{item.tipo_nome}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.lancha_nome}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COR[item.status_semaforo] }} />
                            <span className="text-xs font-medium" style={{ color: STATUS_COR[item.status_semaforo] }}>
                              {STATUS_LABEL[item.status_semaforo]}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {item.dias_restantes === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : isOverdue ? (
                            <span className="text-red-600 font-semibold">{Math.abs(item.dias_restantes)}d vencido</span>
                          ) : (
                            <span className={item.dias_restantes <= 7 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                              {item.dias_restantes}d
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {item.proxima_data ? item.proxima_data.slice(0, 10).split("-").reverse().join("/") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {item.periodicidade_dias}d
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
