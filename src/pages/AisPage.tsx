import { useState, useMemo } from "react";
import { useAisStatus, useAisBaseDia, useAisSaidas, type AisSaida } from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Info, Radio, RadioTower, Moon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/* ── Constantes ──────────────────────────────────────────────────────────── */

const LANCHA_COR: Record<number, string> = { 121: "#2563EB", 1003: "#16A34A", 117: "#F97316" };

// Cores por ESTADO, não por lancha: o empilhamento do gráfico fala de onde a
// lancha estava, e o leitor precisa reconhecer isso de relance.
const COR = {
  base:      "#2563EB",
  movimento: "#16A34A",
  parada:    "#F59E0B",
  cego:      "#9CA3AF",
};

const MOTIVO_ROTULO: Record<string, string> = {
  manobra:            "Manobra",
  travessia:          "Travessia entre portos",
  abastecimento:      "Abastecimento",
  prova_de_mar:       "Prova de mar",
  ocorrencia:         "Ocorrência aberta",
  sem_registro:       "Sem registro",
  movimento_no_berco: "Movimento no berço",
};

const MOTIVO_COR: Record<string, string> = {
  manobra:       "#2563EB",
  travessia:     "#0891B2",
  abastecimento: "#7C3AED",
  prova_de_mar:  "#DB2777",
  ocorrencia:    "#F59E0B",
  sem_registro:  "#64748B",
};

const BASE_ROTULO: Record<string, string> = {
  mucuripe_base: "Mucuripe",
  pecem_base:    "Pecém",
  iate_clube:    "Iate Clube",
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/* ── Utilitários ─────────────────────────────────────────────────────────── */

function mesesDisponiveis(qtd = 24) {
  const hoje = new Date();
  const out: { valor: string; rotulo: string }[] = [];
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ valor, rotulo: `${MESES[d.getMonth()]}/${d.getFullYear()}` });
  }
  return out;
}

function faixaDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function horaBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Ajuda({ children }: { children: React.ReactNode }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground inline-block ml-1 align-text-top cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </UITooltip>
  );
}

/* ── Página ──────────────────────────────────────────────────────────────── */

export default function AisPage() {
  const meses = useMemo(() => mesesDisponiveis(), []);
  const [mes, setMes] = useState(meses[0].valor);
  const { de, ate } = faixaDoMes(mes);

  const status = useAisStatus();
  const dias   = useAisBaseDia(de, ate);
  const saidas = useAisSaidas(de, ate);

  const lanchas = useMemo(() => {
    const m = new Map<number, string>();
    (dias.data ?? []).forEach(d => m.set(d.cd_lancha, d.ds_lancha));
    return [...m.entries()].map(([cd, nome]) => ({ cd, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dias.data]);

  // Totais do mês por lancha.
  const totais = useMemo(() => {
    return lanchas.map(l => {
      const g = (dias.data ?? []).filter(d => d.cd_lancha === l.cd);
      const soma = (f: (d: typeof g[number]) => number) => g.reduce((s, d) => s + Number(f(d) ?? 0), 0);
      const base = soma(d => d.horas_base);
      const mov  = soma(d => d.horas_fora_movimento);
      const par  = soma(d => d.horas_fora_parada);
      const cego = soma(d => d.horas_nao_resolvidas);
      const total = base + mov + par + cego;
      return {
        ...l, base, mov, par, cego, total,
        mucuripe: soma(d => d.horas_mucuripe),
        pecem:    soma(d => d.horas_pecem),
        cobertura: total > 0 ? (100 * (total - cego)) / total : 0,
      };
    });
  }, [lanchas, dias.data]);

  // Série diária empilhada, uma barra por dia com as lanchas somadas quando há
  // mais de uma — o seletor de lancha fica na própria legenda do gráfico.
  const [lanchaGrafico, setLanchaGrafico] = useState<number | "todas">("todas");
  const serie = useMemo(() => {
    const porDia = new Map<string, { dia: string; base: number; movimento: number; parada: number; cego: number }>();
    (dias.data ?? [])
      .filter(d => lanchaGrafico === "todas" || d.cd_lancha === lanchaGrafico)
      .forEach(d => {
        const k = d.dia;
        const at = porDia.get(k) ?? { dia: k, base: 0, movimento: 0, parada: 0, cego: 0 };
        at.base      += Number(d.horas_base ?? 0);
        at.movimento += Number(d.horas_fora_movimento ?? 0);
        at.parada    += Number(d.horas_fora_parada ?? 0);
        at.cego      += Number(d.horas_nao_resolvidas ?? 0);
        porDia.set(k, at);
      });
    return [...porDia.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map(d => ({ ...d, rotulo: d.dia.slice(8) }));
  }, [dias.data, lanchaGrafico]);

  // Saídas operacionais: exclui o movimento de berço, que não é saída.
  const operacionais = useMemo(
    () => (saidas.data ?? []).filter(s => !s.curta_e_perto),
    [saidas.data],
  );

  const porMotivo = useMemo(() => {
    const m = new Map<string, { motivo: string; saidas: number; horas: number }>();
    operacionais.forEach(s => {
      const at = m.get(s.motivo) ?? { motivo: s.motivo, saidas: 0, horas: 0 };
      at.saidas += 1;
      at.horas  += Number(s.horas_movimento ?? 0);
      m.set(s.motivo, at);
    });
    return [...m.values()].sort((a, b) => b.saidas - a.saidas);
  }, [operacionais]);

  const carregando = dias.isLoading || saidas.isLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 p-4 md:p-6">

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Posição das lanchas (AIS)</h1>
            <p className="text-sm text-muted-foreground">
              Onde cada lancha esteve, quanto tempo se moveu e por que saiu.
            </p>
          </div>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => <SelectItem key={m.valor} value={m.valor}>{m.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* ── Transmissão ───────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(status.data ?? []).map(s => {
            const h = s.horas_sem_transmitir;
            const semMmsi = s.ultima_posicao == null;
            const alerta = !semMmsi && h != null && h >= 6;
            return (
              <Card key={s.cd_lancha}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: LANCHA_COR[s.cd_lancha] ?? "#94A3B8" }}
                        />
                        <span className="font-medium">{s.lancha_nome}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {semMmsi ? "Não transmite AIS" : `Última posição ${horaBR(s.ultima_posicao)}`}
                      </p>
                    </div>
                    {semMmsi ? (
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <Radio className="h-3 w-3" /> sem MMSI
                      </Badge>
                    ) : (
                      <Badge variant={alerta ? "destructive" : "secondary"} className="shrink-0 gap-1">
                        <RadioTower className="h-3 w-3" />
                        {h != null ? `${n1(h)} h` : "—"}
                      </Badge>
                    )}
                  </div>
                  {!semMmsi && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {s.posicoes_24h} posições em 24 h · média de {s.media_diaria_30d != null ? n1(s.media_diaria_30d) : "—"}/dia em 30 dias
                      <Ajuda>
                        As horas sem transmitir são medidas contra o último sync bem-sucedido,
                        não contra o relógio de agora — senão toda lancha pareceria muda entre
                        uma sincronização e a seguinte. O alerta dispara a partir de 6 h.
                      </Ajuda>
                    </p>
                  )}
                  {semMmsi && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Esta lancha não aparece em nenhum número desta tela.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Totais do mês ─────────────────────────────────────────────── */}
        {carregando ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>
        ) : totais.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sem posições AIS neste mês.</CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {totais.map(t => (
              <Card key={t.cd}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LANCHA_COR[t.cd] ?? "#94A3B8" }} />
                    {t.nome}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      AIS enxergou {n1(t.cobertura)}% do mês
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metrica rotulo="Na base"   valor={t.base} total={t.total} cor={COR.base}
                      ajuda={<>Dentro da cerca do berço ou até 50 m dela. A cerca desenha o berço,
                        não a lancha amarrada nele — sem essa folga, a lancha parada cruzava a cerca
                        onze vezes em 35 minutos e cada cruzamento virava uma saída.</>} />
                    <Metrica rotulo="Em movimento" valor={t.mov} total={t.total} cor={COR.movimento} destaque
                      ajuda={<>Fora da base e navegando acima de 1 nó. <strong>É esta a medida de
                        operação</strong>, não o tempo fora — ver a coluna ao lado.</>} />
                    <Metrica rotulo="Parada fora" valor={t.par} total={t.total} cor={COR.parada}
                      ajuda={<>Fora da cerca mas sem navegar. Quase tudo é espera num ponto do Pecém
                        que não está cercado, a uns 550 m do berço. Somar isto ao tempo de operação
                        infla o número — por isso as duas colunas vêm separadas.</>} />
                    <Metrica rotulo="Sem AIS"   valor={t.cego} total={t.total} cor={COR.cego}
                      ajuda={<>Intervalos acima de 30 min sem posição. Não é zero nem é tempo fora:
                        é tempo sobre o qual não dá para afirmar nada. Nunca leia as outras colunas
                        sem olhar esta.</>} />
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>Mucuripe <strong className="text-foreground">{n1(t.mucuripe)} h</strong></span>
                    <span>Pecém <strong className="text-foreground">{n1(t.pecem)} h</strong></span>
                    <span>
                      Saídas operacionais{" "}
                      <strong className="text-foreground">
                        {operacionais.filter(s => s.cd_lancha === t.cd).length}
                      </strong>
                    </span>
                    <span>
                      Noturnas{" "}
                      <strong className="text-foreground">
                        {operacionais.filter(s => s.cd_lancha === t.cd && s.noturna).length}
                      </strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Dia a dia ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">
                Dia a dia
                <Ajuda>
                  Cada barra soma 24 h. Se um dia não fecha, é porque é o primeiro ou o último
                  da série — antes da primeira posição não existe intervalo para medir.
                </Ajuda>
              </CardTitle>
              <Select
                value={String(lanchaGrafico)}
                onValueChange={v => setLanchaGrafico(v === "todas" ? "todas" : Number(v))}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas somadas</SelectItem>
                  {lanchas.map(l => <SelectItem key={l.cd} value={String(l.cd)}>{l.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} unit=" h" />
                  <Tooltip
                    formatter={(v: number, nome: string) => [`${n2(v)} h`, nome]}
                    labelFormatter={(l) => `Dia ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="base"      name="Na base"      stackId="a" fill={COR.base} />
                  <Bar dataKey="movimento" name="Em movimento" stackId="a" fill={COR.movimento} />
                  <Bar dataKey="parada"    name="Parada fora"  stackId="a" fill={COR.parada} />
                  <Bar dataKey="cego"      name="Sem AIS"      stackId="a" fill={COR.cego} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ── Saídas ────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Por que saiu
                <Ajuda>
                  Cada saída é cruzada com manobras, abastecimentos, provas de mar e ocorrências
                  abertas. Quando mais de um se aplica, vale o primeiro desta ordem: manobra,
                  travessia, abastecimento, prova de mar, ocorrência.
                </Ajuda>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {porMotivo.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma saída no período.</p>
              )}
              {porMotivo.map(m => {
                const pct = operacionais.length ? (100 * m.saidas) / operacionais.length : 0;
                return (
                  <div key={m.motivo}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {MOTIVO_ROTULO[m.motivo] ?? m.motivo}
                        {m.motivo === "sem_registro" && (
                          <Ajuda>
                            Nenhuma das quatro fontes explica este movimento. Pode ser teste
                            pós-manutenção, reposicionamento, apoio não registrado ou registro que
                            ficou faltando. <strong>Levanta a pergunta, não a responde.</strong>
                          </Ajuda>
                        )}
                      </span>
                      <span className="tabular-nums font-medium">{m.saidas}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: MOTIVO_COR[m.motivo] ?? "#94A3B8" }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n1(m.horas)} h em movimento</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Saídas do período
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {operacionais.length} operacionais
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Início</TableHead>
                      <TableHead>Lancha</TableHead>
                      <TableHead>Rota</TableHead>
                      <TableHead className="text-right">Movimento</TableHead>
                      <TableHead className="text-right">Afast. máx.</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operacionais.map(s => <LinhaSaida key={`${s.cd_lancha}-${s.nr_saida}`} s={s} />)}
                    {operacionais.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          Nenhuma saída no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          Os dados AIS vêm do WebPilot uma vez por dia. A Taíba não tem MMSI e não aparece em
          nenhum número desta tela.
        </p>
      </div>
    </TooltipProvider>
  );
}

/* ── Peças ───────────────────────────────────────────────────────────────── */

function Metrica({
  rotulo, valor, total, cor, ajuda, destaque,
}: {
  rotulo: string; valor: number; total: number; cor: string;
  ajuda: React.ReactNode; destaque?: boolean;
}) {
  const pct = total > 0 ? (100 * valor) / total : 0;
  return (
    <div className={destaque ? "rounded-lg bg-muted/50 p-2 -m-2" : undefined}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: cor }} />
        {rotulo}
        <Ajuda>{ajuda}</Ajuda>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums leading-none">{n1(valor)}<span className="ml-1 text-sm font-normal text-muted-foreground">h</span></p>
      <p className="text-xs text-muted-foreground tabular-nums">{n1(pct)}%</p>
    </div>
  );
}

function LinhaSaida({ s }: { s: AisSaida }) {
  const rota =
    s.base_origem && s.base_destino
      ? s.base_origem === s.base_destino
        ? BASE_ROTULO[s.base_origem] ?? s.base_origem
        : `${BASE_ROTULO[s.base_origem] ?? s.base_origem} → ${BASE_ROTULO[s.base_destino] ?? s.base_destino}`
      : "—";
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        <span className="tabular-nums">{horaBR(s.inicio)}</span>
        {s.noturna && <Moon className="ml-1.5 inline h-3 w-3 text-muted-foreground align-text-top" />}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[s.cd_lancha] ?? "#94A3B8" }} />
          {s.ds_lancha}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{rota}</TableCell>
      <TableCell className="text-right tabular-nums">{n2(Number(s.horas_movimento ?? 0))} h</TableCell>
      <TableCell className="text-right tabular-nums">
        {s.afastamento_max_km != null ? `${n1(Number(s.afastamento_max_km))} km` : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: MOTIVO_COR[s.motivo] ?? "#94A3B8" }} />
          {MOTIVO_ROTULO[s.motivo] ?? s.motivo}
          {s.motivo === "manobra" && s.n_manobras > 1 && (
            <span className="text-xs text-muted-foreground">×{s.n_manobras}</span>
          )}
          {s.confianca === "cobertura_baixa" && (
            <Ajuda>
              O AIS cobriu menos de 70% desta saída. Pode ter acontecido coisa dentro do
              buraco — inclusive uma manobra que por isso não foi casada.
            </Ajuda>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}
