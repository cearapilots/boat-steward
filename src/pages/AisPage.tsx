import { useState, useMemo } from "react";
import {
  useAisStatus, useAisBaseDia, useAisSaidas,
  useFadigaPeriodos, useFadigaSemana, useAisTravessias, useAisMes,
  useAisFalhas, useAisVelocidade, useAisIateClube, useAtividadeManutencao,
  type AisSaida, type FadigaPeriodo, type FadigaSemana, type AisTravessia, type AisMes,
  type AisFalha, type AisVelocidade, type AisIateClube, type AtividadeManutencao,
} from "@/hooks/useFleetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Info, Radio, RadioTower, Moon, AlertTriangle, Wrench, SignalZero } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/* ── Constantes ──────────────────────────────────────────────────────────── */

const LANCHA_COR: Record<number, string> = { 121: "#2563EB", 1003: "#16A34A", 117: "#F97316" };

// Cores por ESTADO, não por lancha: o empilhamento fala de onde a lancha estava.
const COR = { base: "#2563EB", movimento: "#16A34A", parada: "#F59E0B", cego: "#9CA3AF" };

const MOTIVO_ROTULO: Record<string, string> = {
  manobra: "Manobra", travessia: "Travessia entre portos", abastecimento: "Abastecimento",
  prova_de_mar: "Prova de mar", ocorrencia: "Ocorrência aberta", sem_registro: "Sem registro",
  movimento_no_berco: "Movimento no berço",
};
const MOTIVO_COR: Record<string, string> = {
  manobra: "#2563EB", travessia: "#0891B2", abastecimento: "#7C3AED",
  prova_de_mar: "#DB2777", ocorrencia: "#F59E0B", sem_registro: "#64748B",
};
const BASE_ROTULO: Record<string, string> = {
  mucuripe_base: "Mucuripe", pecem_base: "Pecém", iate_clube: "Iate Clube",
};
const GRAU_COR: Record<string, string> = { normal: "#16A34A", atencao: "#F59E0B", critico: "#DC2626" };
const GRAU_ROTULO: Record<string, string> = { normal: "Normal", atencao: "Atenção", critico: "Crítico" };

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Só `ais_com_defeito` é problema. As outras duas o documento da gestão já
// descrevia como corriqueiras — o sinal cai ao navegar para longe.
const CLASSE_ROTULO: Record<string, string> = {
  ais_com_defeito:    "AIS com defeito",
  queda_em_operacao:  "Queda em operação",
  queda_em_travessia: "Queda em travessia",
  indeterminado:      "Indeterminado",
};
const CLASSE_COR: Record<string, string> = {
  ais_com_defeito:    "#DC2626",
  queda_em_operacao:  "#94A3B8",
  queda_em_travessia: "#94A3B8",
  indeterminado:      "#CBD5E1",
};

const CONTEXTO_ROTULO: Record<string, string> = {
  no_berco:           "No berço",
  proximo_a_base:     "Próximo à base",
  travessia_ou_longe: "Travessia ou longe",
};

/* ── Utilitários ─────────────────────────────────────────────────────────── */

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mediana(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mesesDisponiveis(qtd = 24) {
  const hoje = new Date();
  return Array.from({ length: qtd }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: `${MESES[d.getMonth()]}/${d.getFullYear()}`,
    };
  });
}

function faixaDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

function horaBR(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR",
    { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function dataBR(d: string | null) {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a.slice(2)}`;
}
function rotuloMes(am: string) {
  const [a, m] = am.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
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

function Numero({ rotulo, valor, sufixo, cor, ajuda, destaque }: {
  rotulo: string; valor: string; sufixo?: string; cor?: string;
  ajuda?: React.ReactNode; destaque?: boolean;
}) {
  return (
    <div className={destaque ? "rounded-lg bg-muted/50 p-2 -m-2" : undefined}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {cor && <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: cor }} />}
        {rotulo}
        {ajuda && <Ajuda>{ajuda}</Ajuda>}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums leading-none">
        {valor}
        {sufixo && <span className="ml-1 text-sm font-normal text-muted-foreground">{sufixo}</span>}
      </p>
    </div>
  );
}

/* ── Página ──────────────────────────────────────────────────────────────── */

export default function AisPage() {
  const meses = useMemo(() => mesesDisponiveis(), []);
  const [mes, setMes] = useState(meses[0].valor);
  const [aba, setAba] = useState("operacao");
  const { de, ate } = faixaDoMes(mes);

  const status      = useAisStatus();
  const dias        = useAisBaseDia(de, ate);
  const saidas      = useAisSaidas(de, ate);
  const fadiga      = useFadigaPeriodos(de, ate);
  const semanas     = useFadigaSemana();
  const travessias  = useAisTravessias();
  const serieMensal = useAisMes();
  const falhas      = useAisFalhas(de, ate);
  const velocidade  = useAisVelocidade();
  const iateClube   = useAisIateClube();
  const manutencao  = useAtividadeManutencao(de, ate);

  const lanchas = useMemo(() => {
    const m = new Map<number, string>();
    (dias.data ?? []).forEach(d => m.set(d.cd_lancha, d.ds_lancha));
    return [...m.entries()].map(([cd, nome]) => ({ cd, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dias.data]);

  const totais = useMemo(() => lanchas.map(l => {
    const g = (dias.data ?? []).filter(d => d.cd_lancha === l.cd);
    const soma = (f: (d: typeof g[number]) => unknown) => g.reduce((s, d) => s + num(f(d)), 0);
    const base = soma(d => d.horas_base);
    const mov  = soma(d => d.horas_fora_movimento);
    const par  = soma(d => d.horas_fora_parada);
    const cego = soma(d => d.horas_nao_resolvidas);
    const total = base + mov + par + cego;
    return { ...l, base, mov, par, cego, total,
      mucuripe: soma(d => d.horas_mucuripe), pecem: soma(d => d.horas_pecem),
      cobertura: total > 0 ? (100 * (total - cego)) / total : 0 };
  }), [lanchas, dias.data]);

  const [lanchaGrafico, setLanchaGrafico] = useState<number | "todas">("todas");
  const serie = useMemo(() => {
    const porDia = new Map<string, { dia: string; base: number; movimento: number; parada: number; cego: number }>();
    (dias.data ?? [])
      .filter(d => lanchaGrafico === "todas" || d.cd_lancha === lanchaGrafico)
      .forEach(d => {
        const at = porDia.get(d.dia) ?? { dia: d.dia, base: 0, movimento: 0, parada: 0, cego: 0 };
        at.base += num(d.horas_base); at.movimento += num(d.horas_fora_movimento);
        at.parada += num(d.horas_fora_parada); at.cego += num(d.horas_nao_resolvidas);
        porDia.set(d.dia, at);
      });
    return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
      .map(d => ({ ...d, rotulo: d.dia.slice(8) }));
  }, [dias.data, lanchaGrafico]);

  const operacionais = useMemo(() => (saidas.data ?? []).filter(s => !s.curta_e_perto), [saidas.data]);

  const porMotivo = useMemo(() => {
    const m = new Map<string, { motivo: string; saidas: number; horas: number }>();
    operacionais.forEach(s => {
      const at = m.get(s.motivo) ?? { motivo: s.motivo, saidas: 0, horas: 0 };
      at.saidas += 1; at.horas += num(s.horas_movimento);
      m.set(s.motivo, at);
    });
    return [...m.values()].sort((a, b) => b.saidas - a.saidas);
  }, [operacionais]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 p-4 md:p-6">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Posição das lanchas (AIS)</h1>
            <p className="text-sm text-muted-foreground">
              Onde cada lancha esteve, quanto tempo se moveu e por que saiu.
            </p>
          </div>
          {aba !== "mensal" && (
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {meses.map(m => <SelectItem key={m.valor} value={m.valor}>{m.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── Transmissão ─────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(status.data ?? []).map(s => {
            const h = s.horas_sem_transmitir;
            const semMmsi = s.ultima_posicao == null;
            const alerta = !semMmsi && h != null && num(h) >= 6;
            return (
              <Card key={s.cd_lancha}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: LANCHA_COR[s.cd_lancha] ?? "#94A3B8" }} />
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
                        <RadioTower className="h-3 w-3" />{h != null ? `${n1(num(h))} h` : "—"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {semMmsi ? "Esta lancha não aparece em nenhum número desta tela." : (
                      <>
                        {s.posicoes_24h} posições em 24 h · média de{" "}
                        {s.media_diaria_30d != null ? n1(num(s.media_diaria_30d)) : "—"}/dia em 30 dias
                        <Ajuda>
                          As horas sem transmitir são medidas contra o último sync bem-sucedido, não
                          contra o relógio de agora — senão toda lancha pareceria muda entre uma
                          sincronização e a seguinte. O alerta dispara a partir de 6 h.
                        </Ajuda>
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="operacao">Operação</TabsTrigger>
            <TabsTrigger value="fadiga">Fadiga</TabsTrigger>
            <TabsTrigger value="travessias">Travessias</TabsTrigger>
            <TabsTrigger value="transmissao">Transmissão</TabsTrigger>
            <TabsTrigger value="mensal">Mensal</TabsTrigger>
          </TabsList>

          {/* ══ OPERAÇÃO ═══════════════════════════════════════════════ */}
          <TabsContent value="operacao" className="space-y-6 mt-4">
            {dias.isLoading ? (
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
                        <Numero rotulo="Na base" valor={n1(t.base)} sufixo="h" cor={COR.base}
                          ajuda={<>Dentro da cerca do berço ou até 50 m dela. A cerca desenha o berço,
                            não a lancha amarrada nele — sem essa folga, a lancha parada cruzava a
                            cerca onze vezes em 35 minutos e cada cruzamento virava uma saída.</>} />
                        <Numero rotulo="Em movimento" valor={n1(t.mov)} sufixo="h" cor={COR.movimento} destaque
                          ajuda={<>Fora da base e navegando acima de 1 nó. <strong>É esta a medida de
                            operação</strong>, não o tempo fora.</>} />
                        <Numero rotulo="Parada fora" valor={n1(t.par)} sufixo="h" cor={COR.parada}
                          ajuda={<>Fora da cerca mas sem navegar. Quase tudo é espera num ponto do Pecém
                            que não está cercado, a uns 550 m do berço.</>} />
                        <Numero rotulo="Sem AIS" valor={n1(t.cego)} sufixo="h" cor={COR.cego}
                          ajuda={<>Intervalos acima de 30 min sem posição. Não é zero nem é tempo fora:
                            é tempo sobre o qual não dá para afirmar nada.</>} />
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <span>Mucuripe <strong className="text-foreground">{n1(t.mucuripe)} h</strong></span>
                        <span>Pecém <strong className="text-foreground">{n1(t.pecem)} h</strong></span>
                        <span>Saídas <strong className="text-foreground">
                          {operacionais.filter(s => s.cd_lancha === t.cd).length}</strong></span>
                        <span>Noturnas <strong className="text-foreground">
                          {operacionais.filter(s => s.cd_lancha === t.cd && s.noturna).length}</strong></span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    Dia a dia
                    <Ajuda>Cada barra soma 24 h. Se um dia não fecha, é o primeiro ou o último da
                      série — antes da primeira posição não existe intervalo para medir.</Ajuda>
                  </CardTitle>
                  <Select value={String(lanchaGrafico)}
                          onValueChange={v => setLanchaGrafico(v === "todas" ? "todas" : Number(v))}>
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
                      <Tooltip formatter={(v: number, nome: string) => [`${n2(v)} h`, nome]}
                               labelFormatter={l => `Dia ${l}`}
                               contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="base" name="Na base" stackId="a" fill={COR.base} />
                      <Bar dataKey="movimento" name="Em movimento" stackId="a" fill={COR.movimento} />
                      <Bar dataKey="parada" name="Parada fora" stackId="a" fill={COR.parada} />
                      <Bar dataKey="cego" name="Sem AIS" stackId="a" fill={COR.cego} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Por que saiu
                    <Ajuda>Cada saída é cruzada com manobras, abastecimentos, provas de mar e
                      ocorrências abertas. Quando mais de um se aplica, vale o primeiro desta ordem:
                      manobra, travessia, abastecimento, prova de mar, ocorrência.</Ajuda>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {porMotivo.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma saída no período.</p>}
                  {porMotivo.map(m => {
                    const pct = operacionais.length ? (100 * m.saidas) / operacionais.length : 0;
                    return (
                      <div key={m.motivo}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            {MOTIVO_ROTULO[m.motivo] ?? m.motivo}
                            {m.motivo === "sem_registro" && (
                              <Ajuda>Nenhuma das quatro fontes explica este movimento. Pode ser teste
                                pós-manutenção, reposicionamento, apoio não registrado ou registro que
                                ficou faltando. <strong>Levanta a pergunta, não a responde.</strong></Ajuda>
                            )}
                          </span>
                          <span className="tabular-nums font-medium">{m.saidas}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full"
                               style={{ width: `${pct}%`, background: MOTIVO_COR[m.motivo] ?? "#94A3B8" }} />
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
                          <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                            Nenhuma saída no período.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══ FADIGA ═════════════════════════════════════════════════ */}
          <TabsContent value="fadiga" className="space-y-6 mt-4">
            <AbaFadiga periodos={fadiga.data ?? []} carregando={fadiga.isLoading}
                       semanas={semanas.data ?? []} lanchas={lanchas}
                       manutencao={manutencao.data ?? []} />
          </TabsContent>

          {/* ══ TRAVESSIAS ═════════════════════════════════════════════ */}
          <TabsContent value="travessias" className="space-y-6 mt-4">
            <AbaTravessias todas={travessias.data ?? []} carregando={travessias.isLoading}
                           de={de} ate={ate} velocidade={velocidade.data ?? []} mes={mes} />
          </TabsContent>

          {/* ══ MENSAL ═════════════════════════════════════════════════ */}
          <TabsContent value="transmissao" className="space-y-6 mt-4">
            <AbaTransmissao falhas={falhas.data ?? []} carregando={falhas.isLoading} />
          </TabsContent>

          <TabsContent value="mensal" className="space-y-6 mt-4">
            <AbaMensal linhas={serieMensal.data ?? []} carregando={serieMensal.isLoading}
                       iate={iateClube.data ?? []} />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Os dados AIS vêm do WebPilot uma vez por dia. A Taíba não tem MMSI e não aparece em
          nenhum número desta tela.
        </p>
      </div>
    </TooltipProvider>
  );
}

/* ── Aba: Fadiga ─────────────────────────────────────────────────────────── */

function AbaFadiga({ periodos, carregando, semanas, lanchas, manutencao }: {
  periodos: FadigaPeriodo[];
  carregando: boolean;
  semanas: FadigaSemana[];
  lanchas: { cd: number; nome: string }[];
  manutencao: AtividadeManutencao[];
}) {
  const [soAlerta, setSoAlerta] = useState(true);
  const visiveis = soAlerta ? periodos.filter(p => p.grau !== "normal") : periodos;
  const delta = periodos.length ? num(periodos[0].delta_min) : 60;

  const porLancha = lanchas.map(l => {
    const g = periodos.filter(p => p.cd_lancha === l.cd);
    const dur = g.map(p => num(p.duracao_h));
    return {
      ...l, n: g.length,
      medianaJornada: mediana(dur),
      maior: dur.length ? Math.max(...dur) : 0,
      acima12: g.filter(p => p.excede_12h).length,
      criticos: g.filter(p => p.grau === "critico").length,
      noites: g.filter(p => num(p.horas_madrugada) > 0).length,
      movimento: g.reduce((s, p) => s + num(p.horas_movimento), 0),
    };
  });

  if (carregando) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>;
  }

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex gap-3 py-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Isto mede a lancha, não a pessoa.</p>
            <p className="text-muted-foreground">
              Não existe registro de tripulação no sistema, então “a Fortim trabalhou 14 h” não diz
              quem estava a bordo. A semana é ancorada na terça, quando a guarnição troca, mas a
              troca em si não é registrada. Os limiares vêm da MSC.1/Circ.1598 da IMO, que também
              adverte: ferramentas de fadiga apontam ponto quente, não decidem escala.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {porLancha.map(l => (
          <Card key={l.cd}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: LANCHA_COR[l.cd] ?? "#94A3B8" }} />
                {l.nome}
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {l.n} períodos no mês
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Numero rotulo="Jornada mediana" valor={n1(l.medianaJornada)} sufixo="h"
                  ajuda={<>Mediana, não média: uma jornada longa isolada distorceria a média.</>} />
                <Numero rotulo="Maior jornada" valor={n1(l.maior)} sufixo="h" />
                <Numero rotulo="Acima de 12 h" valor={String(l.acima12)} cor={GRAU_COR.atencao}
                  ajuda={<>O limiar de 12 h vem do §34 do guia da IMO: “accident rates rise
                    exponentially after 12 hours of consecutive work, particularly when working
                    at night”.</>} />
                <Numero rotulo="Críticos" valor={String(l.criticos)} cor={GRAU_COR.critico} destaque={l.criticos > 0}
                  ajuda={<>Jornada acima de 16 h, ou acima de 12 h atravessando a madrugada. É a
                    combinação que o guia nomeia — não é severidade calculada por nós.</>} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {l.noites} períodos entraram na madrugada · {n1(l.movimento)} h de movimento no mês
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Semana da turma
              <Ajuda>De terça a terça, que é quando a guarnição troca. A coluna de maior folga é
                proposital: o §20.3 da IMO diz que descanso fragmentado não se soma — “six 1-hour
                naps do not have the same benefit as one 6-hour period of sleep”.</Ajuda>
            </CardTitle>
            <span className="text-xs text-muted-foreground">últimas semanas, todas as lanchas</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[22rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead className="text-right">Períodos</TableHead>
                  <TableHead className="text-right">Jornada</TableHead>
                  <TableHead className="text-right">Madrugada</TableHead>
                  <TableHead className="text-right">Noites</TableHead>
                  <TableHead className="text-right">&gt; 12 h</TableHead>
                  <TableHead className="text-right">Maior folga</TableHead>
                  <TableHead className="text-right">Folgas &lt; 6 h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semanas.map(s => (
                  <TableRow key={`${s.cd_lancha}-${s.semana_turma}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">{dataBR(s.semana_turma)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[s.cd_lancha] ?? "#94A3B8" }} />
                        {s.ds_lancha}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.periodos_trabalho}</TableCell>
                    <TableCell className="text-right tabular-nums">{n1(num(s.horas_trabalho))} h</TableCell>
                    <TableCell className="text-right tabular-nums">{n1(num(s.horas_madrugada))} h</TableCell>
                    <TableCell className="text-right tabular-nums">{s.noites_trabalhadas}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(s.periodos_acima_12h) > 0
                        ? <span className="font-medium" style={{ color: GRAU_COR.atencao }}>{s.periodos_acima_12h}</span>
                        : s.periodos_acima_12h}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.maior_folga_h != null ? `${n1(num(s.maior_folga_h))} h` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(s.folgas_abaixo_de_6h) > 0
                        ? <span className="font-medium" style={{ color: GRAU_COR.atencao }}>{s.folgas_abaixo_de_6h}</span>
                        : s.folgas_abaixo_de_6h}
                    </TableCell>
                  </TableRow>
                ))}
                {semanas.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Sem dados.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Períodos de trabalho
              <Ajuda>Um período é uma sequência de movimento, esticada em {delta} min antes e
                depois para cobrir preparação e encerramento. Esse valor é provisório — a gestão
                ainda vai definir o número real.</Ajuda>
            </CardTitle>
            <button onClick={() => setSoAlerta(v => !v)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {soAlerta ? `mostrar todos (${periodos.length})` : "mostrar só atenção e críticos"}
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[24rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead className="text-right">Jornada</TableHead>
                  <TableHead className="text-right">Movimento</TableHead>
                  <TableHead className="text-right">Densidade</TableHead>
                  <TableHead className="text-right">Madrugada</TableHead>
                  <TableHead>Grau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(p => (
                  <TableRow key={`${p.cd_lancha}-${p.nr_periodo}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">{horaBR(p.inicio_trabalho)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[p.cd_lancha] ?? "#94A3B8" }} />
                        {p.ds_lancha}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{n1(num(p.duracao_h))} h</TableCell>
                    <TableCell className="text-right tabular-nums">{n1(num(p.horas_movimento))} h</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {num(p.densidade_pct)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(p.horas_madrugada) > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Moon className="h-3 w-3 text-muted-foreground" />{n1(num(p.horas_madrugada))} h
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-sm" style={{ background: GRAU_COR[p.grau] }} />
                        {GRAU_ROTULO[p.grau] ?? p.grau}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {visiveis.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {soAlerta ? "Nenhum período de atenção ou crítico neste mês." : "Sem períodos neste mês."}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Manutenção no período
            <Ajuda>
              A nota de fadiga dizia que só daria para considerar manutenção se fosse registrada
              com início e término certinho. É: 922 das 924 ocorrências têm janela completa.
              <strong> Mas a janela descreve o estado da lancha, não a presença da guarnição</strong> —
              corretiva com lancha inoperante pode ser espera de peça. Por isso estas horas ficam
              aqui ao lado, e não somadas à jornada acima.
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[18rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead>Efeito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manutencao.map(m => (
                  <TableRow key={m.cd_ocorrencia}>
                    <TableCell className="whitespace-nowrap tabular-nums">{horaBR(m.data_inicio)}</TableCell>
                    <TableCell className="whitespace-nowrap">{m.ds_lancha}</TableCell>
                    <TableCell className="text-muted-foreground">{m.tipo_ocorrencia}</TableCell>
                    <TableCell className="text-right tabular-nums">{n1(num(m.duracao_h))} h</TableCell>
                    <TableCell>
                      <span className="text-xs" style={m.inoperante ? { color: GRAU_COR.critico } : undefined}>
                        {m.efeito ?? "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {manutencao.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma manutenção registrada neste mês.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ── Aba: Travessias ─────────────────────────────────────────────────────── */

function AbaTravessias({ todas, carregando, de, ate, velocidade, mes }: {
  todas: AisTravessia[]; carregando: boolean; de: string; ate: string;
  velocidade: AisVelocidade[]; mes: string;
}) {
  const porSentido = useMemo(() => {
    const m = new Map<string, AisTravessia[]>();
    todas.forEach(t => { const g = m.get(t.sentido) ?? []; g.push(t); m.set(t.sentido, g); });
    return [...m.entries()].map(([sentido, g]) => ({
      sentido, n: g.length,
      duracao:   mediana(g.map(t => num(t.duracao_h))),
      movimento: mediana(g.map(t => num(t.horas_movimento))),
      sog:       mediana(g.filter(t => t.sog_mediano != null).map(t => num(t.sog_mediano))),
      sogMax:    g.length ? Math.max(...g.map(t => num(t.sog_max))) : 0,
      noturnas:  g.filter(t => t.noturna).length,
    })).sort((a, b) => b.n - a.n);
  }, [todas]);

  const doMes = useMemo(
    () => todas.filter(t => t.dia_inicio >= de && t.dia_inicio <= ate),
    [todas, de, ate],
  );

  if (carregando) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {porSentido.map(s => (
          <Card key={s.sentido}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{s.sentido}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {s.n} travessias na série · {s.noturnas} noturnas
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <Numero rotulo="Duração" valor={n2(s.duracao)} sufixo="h"
                  ajuda={<><strong>Mediana, sempre.</strong> Há travessias em que o AIS apagou no
                    caminho e a duração vai a centenas de horas — a média não significa nada aqui.</>} />
                <Numero rotulo="Navegando" valor={n2(s.movimento)} sufixo="h" cor={COR.movimento} />
                <Numero rotulo="Velocidade" valor={n1(s.sog)} sufixo="kn"
                  ajuda={<>Mediana do SOG nas posições acima de 1 nó. Pico registrado no sentido:{" "}
                    {n1(s.sogMax)} kn.</>} />
              </div>
            </CardContent>
          </Card>
        ))}
        {porSentido.length === 0 && (
          <Card className="md:col-span-2"><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma travessia detectada.</CardContent></Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Velocidade de operação
            <span className="ml-2 text-xs font-normal text-muted-foreground">{rotuloMes(mes)}</span>
            <Ajuda>
              A mesma lancha tem três regimes. <strong>Mediana e percentis, nunca média</strong>:
              o SOG traz picos espúrios isolados — há leitura de 18,9 kn com a lancha amarrada no
              Pecém, contrariada pelas posições vizinhas. Leituras acima de 40 kn são descartadas
              como erro de transponder.
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lancha</TableHead>
                <TableHead>Contexto</TableHead>
                <TableHead className="text-right">Posições</TableHead>
                <TableHead className="text-right">Mediana</TableHead>
                <TableHead className="text-right">p90</TableHead>
                <TableHead className="text-right">p99</TableHead>
                <TableHead className="text-right">Máx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {velocidade.filter(v => v.ano_mes === mes)
                .sort((a, b) => a.ds_lancha.localeCompare(b.ds_lancha)
                             || a.contexto.localeCompare(b.contexto))
                .map(v => (
                <TableRow key={`${v.cd_lancha}-${v.contexto}`}>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[v.cd_lancha] ?? "#94A3B8" }} />
                      {v.ds_lancha}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CONTEXTO_ROTULO[v.contexto] ?? v.contexto}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{v.n_posicoes}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{n1(num(v.sog_mediano))} kn</TableCell>
                  <TableCell className="text-right tabular-nums">{n1(num(v.sog_p90))}</TableCell>
                  <TableCell className="text-right tabular-nums">{n1(num(v.sog_p99))}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{n1(num(v.sog_max))}</TableCell>
                </TableRow>
              ))}
              {velocidade.filter(v => v.ano_mes === mes).length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Sem posições neste mês.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Travessias do mês
            <span className="ml-2 text-xs font-normal text-muted-foreground">{doMes.length} no período</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[26rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Saída</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead>Sentido</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead className="text-right">Navegando</TableHead>
                  <TableHead className="text-right">SOG mediano</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doMes.map(t => (
                  <TableRow key={`${t.cd_lancha}-${t.nr_saida}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {horaBR(t.inicio)}
                      {t.noturna && <Moon className="ml-1.5 inline h-3 w-3 text-muted-foreground align-text-top" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[t.cd_lancha] ?? "#94A3B8" }} />
                        {t.ds_lancha}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{t.sentido}</TableCell>
                    <TableCell className="text-right tabular-nums">{n2(num(t.duracao_h))} h</TableCell>
                    <TableCell className="text-right tabular-nums">{n2(num(t.horas_movimento))} h</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.sog_mediano != null ? `${n1(num(t.sog_mediano))} kn` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.cobertura_pct != null ? (
                        <span style={num(t.cobertura_pct) < 70 ? { color: GRAU_COR.atencao } : undefined}>
                          {n1(num(t.cobertura_pct))}%
                        </span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {doMes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma travessia neste mês.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ── Aba: Mensal ─────────────────────────────────────────────────────────── */

function AbaMensal({ linhas, carregando, iate }: {
  linhas: AisMes[]; carregando: boolean; iate: AisIateClube[];
}) {
  const lanchas = useMemo(() => {
    const m = new Map<number, string>();
    linhas.forEach(l => m.set(l.cd_lancha, l.ds_lancha));
    return [...m.entries()].map(([cd, nome]) => ({ cd, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [linhas]);

  const serie = useMemo(() => {
    const m = new Map<string, Record<string, string | number>>();
    linhas.forEach(l => {
      const at = m.get(l.ano_mes) ?? { ano_mes: l.ano_mes, rotulo: rotuloMes(l.ano_mes) };
      at[`mov_${l.cd_lancha}`] = num(l.horas_movimento);
      m.set(l.ano_mes, at);
    });
    return [...m.values()].sort((a, b) => a.ano_mes.localeCompare(b.ano_mes));
  }, [linhas]);

  if (carregando) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Horas em movimento, mês a mês
            <Ajuda>Só o tempo navegando fora da base. Não usa “tempo fora” porque este inclui a
              espera parada num ponto do Pecém que não está cercado.</Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} unit=" h" />
                <Tooltip formatter={(v: number, nome: string) => [`${n1(v)} h`, nome]}
                         contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {lanchas.map(l => (
                  <Line key={l.cd} type="monotone" dataKey={`mov_${l.cd}`} name={l.nome}
                        stroke={LANCHA_COR[l.cd] ?? "#94A3B8"} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fechamento mensal</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Movimento</TableHead>
                  <TableHead className="text-right">Parada fora</TableHead>
                  <TableHead className="text-right">Sem AIS</TableHead>
                  <TableHead className="text-right">
                    Mov ÷ Base
                    <Ajuda>Movimento sobre base, não “fora” sobre base — o tempo parado fora inclui
                      espera. A coluna ao lado mostra quanto do mês foi no Pecém, porque essa razão
                      oscila conforme a lancha passe o mês num porto ou no outro.</Ajuda>
                  </TableHead>
                  <TableHead className="text-right">Pecém</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...linhas].sort((a, b) => b.ano_mes.localeCompare(a.ano_mes)
                                          || String(a.ds_lancha).localeCompare(String(b.ds_lancha)))
                  .map(l => (
                  <TableRow key={`${l.ano_mes}-${l.cd_lancha}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">{rotuloMes(l.ano_mes)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[l.cd_lancha] ?? "#94A3B8" }} />
                        {l.ds_lancha}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{n1(num(l.horas_base))}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{n1(num(l.horas_movimento))}</TableCell>
                    <TableCell className="text-right tabular-nums">{n1(num(l.horas_parada))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {n1(num(l.horas_nao_resolvidas))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.razao_movimento_base != null ? n2(num(l.razao_movimento_base)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {l.share_pecem_pct != null ? `${num(l.share_pecem_pct)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.saidas}</TableCell>
                  </TableRow>
                ))}
                {linhas.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Sem dados.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Iate Clube
            <Ajuda>
              Duas grandezas que é fácil confundir, e a confusão exagera o uso do clube em vinte
              vezes. <strong>Dentro da cerca</strong> é o tempo no clube — 2,47 h da Flexeiras em
              agosto/2026. <strong>Movimento das saídas</strong> é o das saídas inteiras que
              passaram por lá — 59,28 h no mesmo mês. O clube é ponto de transbordo, não estadia.
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[20rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead className="text-right">Dentro da cerca</TableHead>
                  <TableHead className="text-right">Saídas que passaram</TableHead>
                  <TableHead className="text-right">Noturnas</TableHead>
                  <TableHead className="text-right">Movimento das saídas</TableHead>
                  <TableHead className="text-right">% no clube</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {iate.map(i => (
                  <TableRow key={`${i.ano_mes}-${i.cd_lancha}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">{rotuloMes(i.ano_mes)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[i.cd_lancha] ?? "#94A3B8" }} />
                        {i.ds_lancha}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {n2(num(i.horas_dentro_da_cerca))} h
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.saidas_que_passaram}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{i.noturnas}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {i.horas_movimento_das_saidas != null ? `${n1(num(i.horas_movimento_das_saidas))} h` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.pct_da_saida_no_clube != null ? `${n1(num(i.pct_da_saida_no_clube))}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {iate.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma passagem registrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ── Aba: Transmissão ────────────────────────────────────────────────────── */

function AbaTransmissao({ falhas, carregando }: { falhas: AisFalha[]; carregando: boolean }) {
  const defeitos = falhas.filter(f => f.classe === "ais_com_defeito");

  const porClasse = useMemo(() => {
    const m = new Map<string, { classe: string; n: number; horas: number; alerta: number }>();
    falhas.forEach(f => {
      const at = m.get(f.classe) ?? { classe: f.classe, n: 0, horas: 0, alerta: 0 };
      at.n += 1; at.horas += num(f.duracao_h); at.alerta += f.acima_do_alerta ? 1 : 0;
      m.set(f.classe, at);
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [falhas]);

  if (carregando) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>;
  }

  return (
    <>
      <Card className="border-sky-500/40 bg-sky-500/5">
        <CardContent className="flex gap-3 py-4">
          <SignalZero className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Só uma dessas classes é problema.</p>
            <p className="text-muted-foreground">
              O sinal cair enquanto a lancha navega para longe, ou durante a travessia entre portos,
              é esperado — a própria gestão já descrevia isso. O que aponta transponder com defeito é
              a lancha <strong>atracada antes e depois</strong> do buraco: ela não saiu do lugar e
              mesmo assim sumiu.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {porClasse.map(c => (
          <Card key={c.classe}>
            <CardContent className="pt-5">
              <Numero
                rotulo={CLASSE_ROTULO[c.classe] ?? c.classe}
                valor={String(c.n)}
                cor={CLASSE_COR[c.classe]}
                destaque={c.classe === "ais_com_defeito" && c.n > 0}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {n1(c.horas)} h somadas · {c.alerta} acima de 6 h
              </p>
            </CardContent>
          </Card>
        ))}
        {porClasse.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-4">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum intervalo sem posição neste mês.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            AIS com defeito
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {defeitos.length} no período
            </span>
            <Ajuda>
              Lancha atracada antes e depois do buraco. O limiar de alerta de 6 h está em
              <code className="mx-1">configuracoes.ais_horas_sem_transmitir_alerta</code> e pode ser
              mudado sem tocar no código.
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[24rem] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Sumiu em</TableHead>
                  <TableHead>Voltou em</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defeitos.map(f => (
                  <TableRow key={`${f.cd_lancha}-${f.inicio}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">{horaBR(f.inicio)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {horaBR(f.fim)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: LANCHA_COR[f.cd_lancha] ?? "#94A3B8" }} />
                        {f.ds_lancha}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span style={f.acima_do_alerta ? { color: GRAU_COR.critico, fontWeight: 500 } : undefined}>
                        {n1(num(f.duracao_h))} h
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {defeitos.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma falha de transponder neste mês.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ── Peças ───────────────────────────────────────────────────────────────── */

function LinhaSaida({ s }: { s: AisSaida }) {
  const rota = s.base_origem && s.base_destino
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
      <TableCell className="text-right tabular-nums">{n2(num(s.horas_movimento))} h</TableCell>
      <TableCell className="text-right tabular-nums">
        {s.afastamento_max_km != null ? `${n1(num(s.afastamento_max_km))} km` : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: MOTIVO_COR[s.motivo] ?? "#94A3B8" }} />
          {MOTIVO_ROTULO[s.motivo] ?? s.motivo}
          {s.motivo === "manobra" && s.n_manobras > 1 && (
            <span className="text-xs text-muted-foreground">×{s.n_manobras}</span>
          )}
          {s.confianca === "cobertura_baixa" && (
            <Ajuda>O AIS cobriu menos de 70% desta saída. Pode ter acontecido coisa dentro do
              buraco — inclusive uma manobra que por isso não foi casada.</Ajuda>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}
