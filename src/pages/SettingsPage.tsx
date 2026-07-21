import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  useConfiguracoes,
  useSaveConfiguracoes,
  useAtivosIntervalos,
  useSaveIntervalosTipo,
  useManutencoesTipos,
  useSavePeriodicidadeTipo,
  useSistemaInfo,
} from "@/hooks/useFleetData";

const VERSION = "1.0.0";

const TIPOS_ATIVOS = [
  { key: "motor", label: "Motor" },
  { key: "reversor", label: "Reversor" },
  { key: "gerador", label: "Gerador" },
];

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const normalized = iso.replace(" ", "T");
  const [datePart, timePart] = normalized.split("T");
  const [ano, mes, dia] = datePart.split("-");
  if (!timePart) return `${dia}/${mes}/${ano}`;
  return `${dia}/${mes}/${ano} ${timePart.slice(0, 5)}`;
}

export default function SettingsPage() {
  const { data: configData } = useConfiguracoes();
  const { data: ativosData } = useAtivosIntervalos();
  const { data: tiposData } = useManutencoesTipos();
  const { data: sistemaInfo } = useSistemaInfo();

  const saveConfigs = useSaveConfiguracoes();
  const saveIntervalos = useSaveIntervalosTipo();
  const savePeriodid = useSavePeriodicidadeTipo();

  const [amareloHoras, setAmareloHoras] = useState("50");
  const [vermelhoHoras, setVermelhoHoras] = useState("20");
  const [amareloOverhaul, setAmareloOverhaul] = useState("500");
  const [vermelhoOverhaul, setVermelhoOverhaul] = useState("200");
  const [amareloPeriodicas, setAmareloPeriodicas] = useState("10");

  const [intervalos, setIntervalos] = useState<Record<string, { troca: string; overhaul: string }>>({
    motor: { troca: "", overhaul: "" },
    reversor: { troca: "", overhaul: "" },
    gerador: { troca: "", overhaul: "" },
  });

  const [periodicidades, setPeriodicidades] = useState<Record<string, string>>({});
  const [savingIntervaloTipo, setSavingIntervaloTipo] = useState<string | null>(null);
  const [savingPeriodTipoId, setSavingPeriodTipoId] = useState<string | null>(null);

  useEffect(() => {
    if (!configData || !Array.isArray(configData)) return;
    const config = Object.fromEntries(
      (configData as any[]).map((r) => [r.chave, r.valor])
    );
    setAmareloHoras(config["semaforo_amarelo_horas"] ?? "50");
    setVermelhoHoras(config["semaforo_vermelho_horas"] ?? "20");
    setAmareloOverhaul(config["semaforo_amarelo_overhaul"] ?? "500");
    setVermelhoOverhaul(config["semaforo_vermelho_overhaul"] ?? "200");
    setAmareloPeriodicas(config["semaforo_amarelo_periodicas_dias"] ?? "10");
  }, [configData]);

  useEffect(() => {
    if (!ativosData || ativosData.length === 0) return;
    setIntervalos((prev) => {
      const next = { ...prev };
      for (const { key } of TIPOS_ATIVOS) {
        const first = ativosData.find((a) => a.tipo === key);
        if (first) {
          next[key] = {
            troca: first.intervalo_manutencao != null ? String(first.intervalo_manutencao) : "",
            overhaul: first.intervalo_overhaul != null ? String(first.intervalo_overhaul) : "",
          };
        }
      }
      return next;
    });
  }, [ativosData]);

  useEffect(() => {
    if (!tiposData || tiposData.length === 0) return;
    setPeriodicidades((prev) => {
      const next = { ...prev };
      for (const t of tiposData) {
        next[t.id] = String(t.periodicidade_dias);
      }
      return next;
    });
  }, [tiposData]);

  function handleSaveSemaforos() {
    const updates = [
      { chave: "semaforo_amarelo_horas", valor: amareloHoras },
      { chave: "semaforo_vermelho_horas", valor: vermelhoHoras },
      { chave: "semaforo_amarelo_overhaul", valor: amareloOverhaul },
      { chave: "semaforo_vermelho_overhaul", valor: vermelhoOverhaul },
      { chave: "semaforo_amarelo_periodicas_dias", valor: amareloPeriodicas },
    ];
    saveConfigs.mutate(updates, {
      onSuccess: () => toast.success("Limiares de semáforo salvos"),
      onError: (e: unknown) =>
        toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`),
    });
  }

  function handleSaveIntervalo(tipo: string) {
    const v = intervalos[tipo];
    const troca = Number(v.troca);
    const overhaul = v.overhaul !== "" ? Number(v.overhaul) : null;
    if (!v.troca || isNaN(troca) || troca <= 0) {
      toast.error("Intervalo de troca de óleo inválido");
      return;
    }
    setSavingIntervaloTipo(tipo);
    saveIntervalos.mutate(
      { tipo, intervalo_manutencao: troca, intervalo_overhaul: overhaul },
      {
        onSuccess: () => {
          toast.success(`Intervalos de ${tipo} salvos`);
          setSavingIntervaloTipo(null);
        },
        onError: (e: unknown) => {
          toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`);
          setSavingIntervaloTipo(null);
        },
      }
    );
  }

  function handleSavePeriodId(tipoId: string) {
    const dias = Number(periodicidades[tipoId]);
    if (isNaN(dias) || dias <= 0) {
      toast.error("Periodicidade inválida");
      return;
    }
    setSavingPeriodTipoId(tipoId);
    savePeriodid.mutate(
      { id: tipoId, periodicidade_dias: dias },
      {
        onSuccess: () => {
          toast.success("Periodicidade salva");
          setSavingPeriodTipoId(null);
        },
        onError: (e: unknown) => {
          toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`);
          setSavingPeriodTipoId(null);
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-accent">Parâmetros e integrações do sistema</p>
      </div>

      {/* Seção 1 — Alertas e Semáforos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas e Semáforos</CardTitle>
          <CardDescription>
            Limiares para acionamento dos alertas amarelo e vermelho. O limiar das periódicas já é aplicado no Dashboard e na página de Manutenção; os de troca de óleo e overhaul serão usados em uma próxima etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Troca de óleo — Alerta amarelo (h antes)</Label>
              <Input type="number" min={1} value={amareloHoras} onChange={(e) => setAmareloHoras(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Troca de óleo — Alerta vermelho (h antes)</Label>
              <Input type="number" min={1} value={vermelhoHoras} onChange={(e) => setVermelhoHoras(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Overhaul — Alerta amarelo (h antes)</Label>
              <Input type="number" min={1} value={amareloOverhaul} onChange={(e) => setAmareloOverhaul(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Overhaul — Alerta vermelho (h antes)</Label>
              <Input type="number" min={1} value={vermelhoOverhaul} onChange={(e) => setVermelhoOverhaul(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Periódicas — Alerta amarelo (dias antes)</Label>
              <Input type="number" min={1} value={amareloPeriodicas} onChange={(e) => setAmareloPeriodicas(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">O alerta vermelho das periódicas é acionado somente quando a manutenção vence.</p>
            </div>
          </div>
          <Button size="sm" onClick={handleSaveSemaforos} disabled={saveConfigs.isPending}>
            {saveConfigs.isPending ? "Salvando..." : "Salvar limiares"}
          </Button>
        </CardContent>
      </Card>

      {/* Seção 2 — Intervalos de Manutenção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Intervalos de Manutenção</CardTitle>
          <CardDescription>
            Atualiza o intervalo para todos os ativos do mesmo tipo simultaneamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Troca de óleo (h)</TableHead>
                <TableHead>Overhaul (h)</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIPOS_ATIVOS.map(({ key, label }) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      className="h-8 w-28"
                      value={intervalos[key]?.troca ?? ""}
                      onChange={(e) =>
                        setIntervalos((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], troca: e.target.value },
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      className="h-8 w-28"
                      placeholder="—"
                      value={intervalos[key]?.overhaul ?? ""}
                      onChange={(e) =>
                        setIntervalos((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], overhaul: e.target.value },
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveIntervalo(key)}
                      disabled={savingIntervaloTipo === key}
                    >
                      {savingIntervaloTipo === key ? "Salvando..." : "Salvar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Seção 3 — Periodicidade das Manutenções Periódicas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manutenções Periódicas</CardTitle>
          <CardDescription>Periodicidade de cada tipo de manutenção programada</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(tiposData ?? []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-1">
                <span className="flex-1 text-sm">{t.nome}</span>
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-24"
                  value={periodicidades[t.id] ?? ""}
                  onChange={(e) =>
                    setPeriodicidades((prev) => ({ ...prev, [t.id]: e.target.value }))
                  }
                />
                <span className="text-xs text-muted-foreground w-8">dias</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSavePeriodId(t.id)}
                  disabled={savingPeriodTipoId === t.id}
                >
                  {savingPeriodTipoId === t.id ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Seção 4 — Sobre o Sistema */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sobre o Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground font-medium">Versão</dt>
              <dd className="mt-0.5 font-mono">{VERSION}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground font-medium">Última sincronização WebPilot</dt>
              <dd className="mt-0.5 font-mono text-xs">{fmtDateTime(sistemaInfo?.ultimoSync ?? null)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground font-medium">Total de ativos cadastrados</dt>
              <dd className="mt-0.5">{sistemaInfo?.totalAtivos ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground font-medium">Total de registros no histórico</dt>
              <dd className="mt-0.5">{sistemaInfo?.totalHistorico ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
