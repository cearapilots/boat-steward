import { useMemo } from "react";
import {
  useDespesas, useManobras, useOcorrencias,
  useAbastecimentos, useIndicadoresOp,
} from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, LabelList,
  CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

// ── Constantes locais ────────────────────────────────────────────────────────
// Definidas aqui (e não importadas da CustosPage) porque a própria CustosPage
// importa este componente — importar de volta criaria ciclo.

const LANCHAS = [
  { nome: "Flexeiras", cd: 121,  cor: "#2563EB" },
  { nome: "Fortim",    cd: 1003, cor: "#16A34A" },
  { nome: "Taíba",     cd: 117,  cor: "#F97316" },
];

// Rótulos de centro de resultado que aparecem na planilha de despesas.
const CENTRO_PARA_LANCHA: Record<string, string> = {
  "Lancha Flexeiras": "Flexeiras",
  "Lancha Taíba III": "Taíba",
  "Flexeiras":        "Flexeiras",
  "Fortim":           "Fortim",
  "Taíba":            "Taíba",
};

const TIPO_MANUTENCAO   = "Manutenção e Reparos";
const TIPO_COMBUSTIVEL  = "Combustíveis e Lubrificantes";

// Trimestres são blocos fixos: T1=Jan–Mar, T2=Abr–Jun, T3=Jul–Set, T4=Out–Dez.
function trimestreDe(dataISO: string): string {
  const ano = dataISO.slice(0, 4);
  const mes = Number(dataISO.slice(5, 7));
  return `${ano}-T${Math.floor((mes - 1) / 3) + 1}`;
}

function rotuloTrimestre(trimestre: string): string {
  const [ano, t] = trimestre.split("-");
  return `${t}-${ano.slice(2)}`;   // "2026-T1" → "T1-26"
}

// Classificação idêntica à da página de Manutenção: projeto e treinamento não
// são intervenção de manutenção e ficam fora da contagem.
function classifyTipo(tipo: string | null | undefined): "corretiva" | "preventiva" | "outros" {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("projeto") || t.includes("melhoria") || t.includes("modificação")) return "outros";
  if (t.includes("treinamento")) return "outros";
  if (t.includes("corretiva"))   return "corretiva";
  if (t.includes("preventiva"))  return "preventiva";
  return "outros";
}

const brl = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil`
            : `R$ ${v.toFixed(0)}`;

const num = (v: number, casas = 1) => v.toFixed(casas).replace(".", ",");

type Ponto = {
  chave: string;
  lancha: string;
  trimestre: string;
  rotulo: string;
  parcial: boolean;
  manobras: number;
  nCorretivas: number;
  nPreventivas: number;
  intervencoes: number;
  pctCorretivas: number;
  horasManut: number;
  horasOp: number;
  custoManut: number;
  custoComb: number;
  litros: number;
  intervPor100:     number | null;
  custoManutPor100: number | null;
  litrosPorManobra: number | null;
  custoTotalPor100: number | null;
};

export interface AnaliseTrimestralProps {
  /** Anos selecionados no filtro da página. Vazio = todos. */
  filterAnos: string[];
  /** Centros selecionados no filtro da página. Vazio = todos. */
  filterLanchas: string[];
}

export default function AnaliseTrimestral({ filterAnos, filterLanchas }: AnaliseTrimestralProps) {
  const { data: despesas }       = useDespesas();
  const { data: manobras }       = useManobras();
  const { data: ocorrencias }    = useOcorrencias();
  const { data: abastecimentos } = useAbastecimentos();
  const { data: indicadores }    = useIndicadoresOp();

  const pontos = useMemo<Ponto[]>(() => {
    const lanchasAtivas = LANCHAS.filter(
      l => filterLanchas.length === 0 || filterLanchas.includes(l.nome),
    );
    const anoOk = (ano: string) => filterAnos.length === 0 || filterAnos.includes(ano);

    // Trimestre corrente ainda não fechou — o ponto existe, mas com menos
    // tempo acumulado; sinalizamos para não ser lido como queda real.
    const hoje = new Date();
    const trimestreAtual = `${hoje.getFullYear()}-T${Math.floor(hoje.getMonth() / 3) + 1}`;

    const mapa = new Map<string, Ponto>();
    const obter = (lancha: string, trimestre: string): Ponto => {
      const chave = `${lancha}|${trimestre}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave, lancha, trimestre,
          rotulo: rotuloTrimestre(trimestre),
          parcial: trimestre === trimestreAtual,
          manobras: 0, nCorretivas: 0, nPreventivas: 0, intervencoes: 0, pctCorretivas: 0,
          horasManut: 0, horasOp: 0, custoManut: 0, custoComb: 0, litros: 0,
          intervPor100: null, custoManutPor100: null,
          litrosPorManobra: null, custoTotalPor100: null,
        });
      }
      return mapa.get(chave)!;
    };

    const porCd = new Map(lanchasAtivas.map(l => [l.cd, l.nome]));

    // ── Manobras: o denominador de quase tudo ────────────────────────────────
    for (const m of (manobras ?? []) as any[]) {
      const lancha = porCd.get(Number(m.cd_lancha));
      if (!lancha) continue;
      const d = (m.dh_manobra ?? "").slice(0, 10);
      if (!d || !anoOk(d.slice(0, 4))) continue;
      obter(lancha, trimestreDe(d)).manobras += 1;
    }

    // ── Ocorrências: intervenções corretivas e preventivas ───────────────────
    // Sem recorte por efeito: aqui interessa toda faina de manutenção, não só
    // as que deixaram a lancha inoperante.
    for (const o of (ocorrencias ?? []) as any[]) {
      const lancha = porCd.get(Number(o.cd_lancha));
      if (!lancha) continue;
      const d = (o.data_inicio ?? "").slice(0, 10);
      if (!d || !anoOk(d.slice(0, 4))) continue;
      const cls = classifyTipo(o.tipo_ocorrencia);
      if (cls === "outros") continue;
      const p = obter(lancha, trimestreDe(d));
      if (cls === "corretiva") p.nCorretivas  += 1;
      else                     p.nPreventivas += 1;
      p.intervencoes += 1;
      p.horasManut   += Number(o.duracao_horas) || 0;
    }

    // ── Horas operadas (só para o tooltip) ───────────────────────────────────
    for (const i of (indicadores ?? []) as any[]) {
      const lancha = porCd.get(Number(i.cd_lancha));
      if (!lancha) continue;
      const d = (i.dh_leitura ?? "").slice(0, 10);
      if (!d || !anoOk(d.slice(0, 4))) continue;
      obter(lancha, trimestreDe(d)).horasOp += Number(i.dc_dif_be) || 0;
    }

    // ── Combustível consumido ────────────────────────────────────────────────
    for (const a of (abastecimentos ?? []) as any[]) {
      const lancha = porCd.get(Number(a.cd_lancha));
      if (!lancha) continue;
      const d = (a.dh_abastecimento ?? "").slice(0, 10);
      if (!d || !anoOk(d.slice(0, 4))) continue;
      obter(lancha, trimestreDe(d)).litros += Number(a.dc_litros) || 0;
    }

    // ── Custos: vêm da planilha, por centro de resultado ─────────────────────
    for (const d of (despesas ?? []) as any[]) {
      const lancha = CENTRO_PARA_LANCHA[(d.centro_resultado ?? "").trim()];
      if (!lancha || !lanchasAtivas.some(l => l.nome === lancha)) continue;
      const data = (d.data ?? "").slice(0, 10);
      if (!data || !anoOk(data.slice(0, 4))) continue;
      const tipo = (d.tipo_despesa ?? "").trim();
      if (tipo !== TIPO_MANUTENCAO && tipo !== TIPO_COMBUSTIVEL) continue;
      const p = obter(lancha, trimestreDe(data));
      if (tipo === TIPO_MANUTENCAO) p.custoManut += Number(d.valor) || 0;
      else                          p.custoComb  += Number(d.valor) || 0;
    }

    // ── Derivadas ────────────────────────────────────────────────────────────
    // Sem manobras no trimestre não há como normalizar: o ponto é descartado.
    return [...mapa.values()]
      .filter(p => p.manobras > 0)
      .map(p => ({
        ...p,
        pctCorretivas:    p.intervencoes > 0 ? Math.round(p.nCorretivas / p.intervencoes * 100) : 0,
        intervPor100:     p.intervencoes / p.manobras * 100,
        custoManutPor100: p.custoManut   / p.manobras * 100,
        litrosPorManobra: p.litros       / p.manobras,
        custoTotalPor100: (p.custoManut + p.custoComb) / p.manobras * 100,
      }))
      .sort((a, b) => a.lancha.localeCompare(b.lancha) || a.trimestre.localeCompare(b.trimestre));
  }, [despesas, manobras, ocorrencias, abastecimentos, indicadores, filterAnos, filterLanchas]);

  // Medianas para dividir os quadrantes — referência da própria frota.
  const medianas = useMemo(() => {
    const med = (vals: number[]) => {
      const s = vals.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : 0;
    };
    return {
      interv:     med(pontos.map(p => p.intervPor100     ?? NaN)),
      custoManut: med(pontos.map(p => p.custoManutPor100 ?? NaN)),
      litros:     med(pontos.map(p => p.litrosPorManobra ?? NaN)),
      custoTotal: med(pontos.map(p => p.custoTotalPor100 ?? NaN)),
    };
  }, [pontos]);

  const lanchasComDados = LANCHAS.filter(l => pontos.some(p => p.lancha === l.nome));

  function TooltipPonto({ payload }: any) {
    const p: Ponto | undefined = payload?.[0]?.payload;
    if (!p) return null;
    const linha = (rot: string, val: string) => (
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{rot}</span>
        <span className="font-mono tabular-nums">{val}</span>
      </div>
    );
    return (
      <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs space-y-0.5 min-w-[230px]">
        <p className="font-semibold pb-1">
          {p.lancha} · {p.rotulo}
          {p.parcial && <span className="ml-1 font-normal text-muted-foreground">(em curso)</span>}
        </p>
        {linha("Preventivas", String(p.nPreventivas))}
        {linha("Corretivas",  String(p.nCorretivas))}
        {linha("% corretivas", `${p.pctCorretivas}%`)}
        {linha("Horas em manutenção", `${num(p.horasManut)}h`)}
        {linha("Horas operadas",      `${num(p.horasOp)}h`)}
        {linha("Manobras",            String(p.manobras))}
        {linha("Custo manut./reparos", brl(p.custoManut))}
      </div>
    );
  }

  const semDados = pontos.length === 0;

  // ── Heatmap da tabela: escala relativa por coluna ─────────────────────────
  // Em todas as métricas, maior = pior. A cor é interpolada entre verde e
  // vermelho conforme a posição do valor no intervalo daquela coluna.
  function faixas(sel: (p: Ponto) => number | null) {
    const vals = pontos.map(sel).filter((v): v is number => v != null && Number.isFinite(v));
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }
  const escalas = {
    interv:     faixas(p => p.intervPor100),
    custoManut: faixas(p => p.custoManutPor100),
    litros:     faixas(p => p.litrosPorManobra),
    custoTotal: faixas(p => p.custoTotalPor100),
  };
  function corCelula(v: number | null, e: { min: number; max: number }): string {
    if (v == null || !Number.isFinite(v) || e.max <= e.min) return "transparent";
    const t = (v - e.min) / (e.max - e.min);
    return `hsl(${Math.round(130 - 130 * t)}, 65%, 88%)`;
  }

  return (
    <div className="space-y-4">

      {/* ── Scatter 1 — carga de manutenção × custo ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carga de Manutenção e Custo por Lancha-Trimestre</CardTitle>
          <p className="text-xs text-muted-foreground">
            Inclui preventivas e corretivas. Cada ponto é uma lancha num trimestre; o tamanho
            representa o total de manobras. As linhas tracejadas marcam a mediana da frota.
          </p>
        </CardHeader>
        <CardContent>
          {semDados ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem manobras registradas no período filtrado
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 15, right: 25, bottom: 25, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number" dataKey="intervPor100" name="Intervenções"
                  tick={{ fontSize: 10 }} tickFormatter={v => num(v, 0)}
                  label={{ value: "Intervenções / 100 manobras", position: "insideBottom", offset: -14, fontSize: 10 }}
                />
                <YAxis
                  type="number" dataKey="custoManutPor100" name="Custo"
                  tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  label={{ value: "R$ manut. / 100 manobras", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <ZAxis type="number" dataKey="manobras" range={[50, 420]} name="Manobras" />
                <ReferenceLine x={medianas.interv}     stroke="#9CA3AF" strokeDasharray="3 3" />
                <ReferenceLine y={medianas.custoManut} stroke="#9CA3AF" strokeDasharray="3 3" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<TooltipPonto />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {lanchasComDados.map(l => (
                  <Scatter
                    key={l.nome} name={l.nome} fill={l.cor} fillOpacity={0.75}
                    data={pontos.filter(p => p.lancha === l.nome)}
                  >
                    <LabelList dataKey="rotulo" position="top" offset={6} fontSize={8} fill="#6B7280" />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Scatter 2 — eficiência operacional ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eficiência Operacional por Lancha-Trimestre</CardTitle>
          <p className="text-xs text-muted-foreground">
            Consumo de combustível por manobra contra o custo somado de combustível e manutenção.
          </p>
        </CardHeader>
        <CardContent>
          {semDados ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Sem manobras registradas no período filtrado
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 15, right: 25, bottom: 25, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number" dataKey="litrosPorManobra" name="Litros"
                  tick={{ fontSize: 10 }} tickFormatter={v => num(v, 0)}
                  label={{ value: "Litros de combustível / manobra", position: "insideBottom", offset: -14, fontSize: 10 }}
                />
                <YAxis
                  type="number" dataKey="custoTotalPor100" name="Custo total"
                  tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  label={{ value: "R$ comb. + manut. / 100 manobras", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <ZAxis type="number" dataKey="manobras" range={[50, 420]} name="Manobras" />
                <ReferenceLine x={medianas.litros}     stroke="#9CA3AF" strokeDasharray="3 3" />
                <ReferenceLine y={medianas.custoTotal} stroke="#9CA3AF" strokeDasharray="3 3" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<TooltipPonto />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {lanchasComDados.map(l => (
                  <Scatter
                    key={l.nome} name={l.nome} fill={l.cor} fillOpacity={0.75}
                    data={pontos.filter(p => p.lancha === l.nome)}
                  >
                    <LabelList dataKey="rotulo" position="top" offset={6} fontSize={8} fill="#6B7280" />
                  </Scatter>
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Tabela sequencial com heatmap ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Métricas por Lancha-Trimestre</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mesmos indicadores dos gráficos, em ordem cronológica para leitura da evolução.
            A cor compara cada valor com os demais da mesma coluna — mais vermelho, pior.
          </p>
        </CardHeader>
        <CardContent>
          {semDados ? (
            <p className="text-center text-muted-foreground py-10 text-sm">Sem dados no período filtrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left  py-2 px-2 font-medium text-muted-foreground">Lancha</th>
                    <th className="text-left  py-2 px-2 font-medium text-muted-foreground">Trimestre</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Interv. / 100 man.</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">R$ manut. / 100 man.</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Litros / manobra</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">R$ comb.+manut. / 100 man.</th>
                  </tr>
                </thead>
                <tbody>
                  {pontos.map((p, i) => {
                    const trocaLancha = i > 0 && pontos[i - 1].lancha !== p.lancha;
                    const cor = LANCHAS.find(l => l.nome === p.lancha)?.cor ?? "#6B7280";
                    const celula = (v: number | null, e: { min: number; max: number }, txt: string) => (
                      <td
                        className="py-1.5 px-3 text-right font-mono tabular-nums"
                        style={{ backgroundColor: corCelula(v, e), color: v != null ? "#1F2937" : undefined }}
                      >
                        {txt}
                      </td>
                    );
                    return (
                      <tr key={p.chave} className={trocaLancha ? "border-t-2 border-border" : "border-t border-border/50"}>
                        <td className="py-1.5 px-2">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
                            {p.lancha}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {p.rotulo}
                          {p.parcial && (
                            <span className="text-[10px] text-muted-foreground ml-1">em curso</span>
                          )}
                        </td>
                        {celula(p.intervPor100,     escalas.interv,     num(p.intervPor100 ?? 0))}
                        {celula(p.custoManutPor100, escalas.custoManut, brl(p.custoManutPor100 ?? 0))}
                        {celula(p.litrosPorManobra, escalas.litros,     num(p.litrosPorManobra ?? 0))}
                        {celula(p.custoTotalPor100, escalas.custoTotal, brl(p.custoTotalPor100 ?? 0))}
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
