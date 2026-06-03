import { useMemo, useState } from "react";
import { useProvasMar, useLanchas } from "@/hooks/useFleetData";
import { DESCRICOES_PROVA } from "@/pages/ProvasMarRegistrar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const LANCHA_COLORS: Record<string, string> = {
  Flexeiras: "#2563EB",
  Fortim: "#16A34A",
  "Taíba": "#F59E0B",
};

const LANCHAS_ORDER = ["Flexeiras", "Fortim", "Taíba"];

function fmtDateShort(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

type MergedPoint = {
  data: string;
  dataLabel: string;
  [lancha: string]: string | number | null;
};

function buildLineData(
  filtered: ReturnType<typeof useProvasMar>["data"],
  field: "velocidade" | "rpm"
): MergedPoint[] {
  if (!filtered || filtered.length === 0) return [];
  const dates = [...new Set(filtered.map((p) => p.data))].sort();
  return dates.map((date) => {
    const point: MergedPoint = { data: date, dataLabel: fmtDateShort(date) };
    const dayProvas = filtered.filter((p) => p.data === date);
    for (const nome of LANCHAS_ORDER) {
      const prova = dayProvas.find((p) => p.lanchas?.nome === nome);
      point[nome] = prova?.[field] ?? null;
    }
    return point;
  });
}

type BarPoint = {
  desc: string;
  [lancha: string]: string | number | null;
};

function buildBarData(filtered: ReturnType<typeof useProvasMar>["data"]): BarPoint[] {
  if (!filtered || filtered.length === 0) return [];
  const descsComDados = DESCRICOES_PROVA.filter((desc) =>
    filtered.some((p) => p.descricao === desc && p.velocidade != null)
  );
  return descsComDados.map((desc) => {
    const point: BarPoint = { desc };
    for (const nome of LANCHAS_ORDER) {
      const provas = filtered.filter(
        (p) => p.descricao === desc && p.lanchas?.nome === nome && p.velocidade != null
      );
      if (provas.length > 0) {
        const media = provas.reduce((s, p) => s + (p.velocidade ?? 0), 0) / provas.length;
        point[nome] = Math.round(media * 10) / 10;
      } else {
        point[nome] = null;
      }
    }
    return point;
  });
}

function CustomTooltipLine({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-border rounded-md px-3 py-2 text-xs shadow-md space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((entry: any) => (
        entry.value != null && (
          <p key={entry.dataKey} style={{ color: entry.color }}>
            {entry.dataKey}: {entry.value}
          </p>
        )
      ))}
    </div>
  );
}

export default function ProvasMarEstatisticas() {
  const { data: provas, isLoading } = useProvasMar();
  const { data: lanchas } = useLanchas();

  const [filterLancha, setFilterLancha] = useState("__all__");
  const [filterDescricao, setFilterDescricao] = useState("__all__");

  const filtered = useMemo(() => {
    return (provas ?? []).filter((p) => {
      if (filterLancha !== "__all__" && p.lanchas?.nome !== filterLancha) return false;
      if (filterDescricao !== "__all__" && p.descricao !== filterDescricao) return false;
      return true;
    });
  }, [provas, filterLancha, filterDescricao]);

  const lineVelData = useMemo(() => buildLineData(filtered, "velocidade"), [filtered]);
  const lineRpmData = useMemo(() => buildLineData(filtered, "rpm"), [filtered]);
  const barData = useMemo(() => buildBarData(filtered), [filtered]);

  const lanchaNamesInData = useMemo(() => {
    const nomes = new Set(filtered.map((p) => p.lanchas?.nome ?? ""));
    return LANCHAS_ORDER.filter((n) => nomes.has(n));
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estatísticas de Provas de Mar</h1>
        </div>
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Estatísticas de Provas de Mar</h1>
        <p className="text-sm text-accent">Análise de desempenho por lancha e tipo de prova</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Lancha</span>
          <Select value={filterLancha} onValueChange={setFilterLancha}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {(lanchas ?? []).map((l: any) => (
                <SelectItem key={l.id} value={l.nome}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Descrição</span>
          <Select value={filterDescricao} onValueChange={setFilterDescricao}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {DESCRICOES_PROVA.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="self-end text-xs text-muted-foreground pt-1">
          {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum dado para os filtros selecionados
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Gráfico 1 — Velocidade */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução de Velocidade (nós)</CardTitle>
            </CardHeader>
            <CardContent>
              {lineVelData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sem dados de velocidade</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={lineVelData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="dataLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={["auto", "auto"]}
                      tickFormatter={(v) => `${v}`}
                      label={{ value: "nós", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11 } }}
                    />
                    <Tooltip content={<CustomTooltipLine />} />
                    <Legend />
                    {lanchaNamesInData.map((nome) => (
                      <Line
                        key={nome}
                        type="monotone"
                        dataKey={nome}
                        stroke={LANCHA_COLORS[nome]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 2 — RPM */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução de RPM</CardTitle>
            </CardHeader>
            <CardContent>
              {lineRpmData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sem dados de RPM</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={lineRpmData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="dataLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={["auto", "auto"]}
                      label={{ value: "RPM", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11 } }}
                    />
                    <Tooltip content={<CustomTooltipLine />} />
                    <Legend />
                    {lanchaNamesInData.map((nome) => (
                      <Line
                        key={nome}
                        type="monotone"
                        dataKey={nome}
                        stroke={LANCHA_COLORS[nome]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 3 — Velocidade média por descrição */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Velocidade Média por Tipo de Prova (nós)</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sem dados suficientes</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 60, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="desc"
                      tick={{ fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={["auto", "auto"]}
                      label={{ value: "nós", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 11 } }}
                    />
                    <Tooltip
                      formatter={(value: number) =>
                        [`${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} nós`]
                      }
                    />
                    <Legend />
                    {lanchaNamesInData.map((nome) => (
                      <Bar key={nome} dataKey={nome} fill={LANCHA_COLORS[nome]} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
