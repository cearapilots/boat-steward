import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useLanchas, useCreateProvaMar } from "@/hooks/useFleetData";
import { DESCRICOES_PROVA } from "@/lib/provas-mar";

const PORTOS = ["Mucuripe", "Pecém"];

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  lancha_id: "",
  data: todayStr(),
  descricao: "",
  velocidade: "",
  rpm: "",
  consumo: "",
  peso: "",
  qtd_odm: "",
  mestre: "",
  horimetro: "",
  porto: "",
  vento_popa: false,
  mar_calmo: false,
  observacao: "",
});

type FormState = ReturnType<typeof emptyForm>;

export default function ProvasMarRegistrar() {
  const { data: lanchas } = useLanchas();
  const createProvaMar = useCreateProvaMar();
  const [form, setForm] = useState<FormState>(emptyForm());

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lancha_id || !form.data || !form.descricao) {
      toast.error("Lancha, data e descrição são obrigatórios");
      return;
    }

    const toNum = (v: string) => (v !== "" ? Number(v) : null);

    createProvaMar.mutate(
      {
        lancha_id: form.lancha_id,
        data: form.data,
        descricao: form.descricao,
        velocidade: toNum(form.velocidade),
        rpm: toNum(form.rpm),
        consumo_lts_hora: toNum(form.consumo),
        peso_kg: toNum(form.peso),
        qtd_odm_lts: toNum(form.qtd_odm),
        mestre: form.mestre || null,
        horimetro: toNum(form.horimetro),
        porto: form.porto || null,
        vento_de_popa: form.vento_popa,
        mar_calmo: form.mar_calmo,
        observacao: form.observacao || null,
      },
      {
        onSuccess: () => {
          toast.success("Prova de mar registrada com sucesso");
          setForm(emptyForm());
        },
        onError: (e) =>
          toast.error(`Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`),
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Registrar Prova de Mar</h1>
        <p className="text-sm text-accent">Registre os dados de uma corrida de velocidade</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da Prova</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Linha 1: Lancha / Data / Descrição */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Lancha *</Label>
                <Select value={form.lancha_id} onValueChange={(v) => set("lancha_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {(lanchas ?? []).map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={form.data}
                  max={todayStr()}
                  onChange={(e) => set("data", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Descrição *</Label>
                <Select value={form.descricao} onValueChange={(v) => set("descricao", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {DESCRICOES_PROVA.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 2: métricas numéricas */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Velocidade (nós)</Label>
                <Input
                  type="number" step="0.1" placeholder="ex: 18.5"
                  value={form.velocidade}
                  onChange={(e) => set("velocidade", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>RPM</Label>
                <Input
                  type="number" step="1" placeholder="ex: 2400"
                  value={form.rpm}
                  onChange={(e) => set("rpm", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Consumo (Lts/h)</Label>
                <Input
                  type="number" step="0.1" placeholder="ex: 120.5"
                  value={form.consumo}
                  onChange={(e) => set("consumo", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Peso (Kg)</Label>
                <Input
                  type="number" step="0.1" placeholder="ex: 25000"
                  value={form.peso}
                  onChange={(e) => set("peso", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Qtd ODM (Lts)</Label>
                <Input
                  type="number" step="0.1" placeholder="ex: 500"
                  value={form.qtd_odm}
                  onChange={(e) => set("qtd_odm", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Horímetro</Label>
                <Input
                  type="number" step="0.1" placeholder="ex: 4500"
                  value={form.horimetro}
                  onChange={(e) => set("horimetro", e.target.value)}
                />
              </div>
            </div>

            {/* Linha 3: Mestre / Porto */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Mestre</Label>
                <Input
                  type="text" placeholder="Nome do mestre"
                  value={form.mestre}
                  onChange={(e) => set("mestre", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Porto</Label>
                <Select value={form.porto} onValueChange={(v) => set("porto", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {PORTOS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-8 pt-1">
              <div className="flex items-center gap-3">
                <Label>Vento de popa?</Label>
                <Switch
                  checked={form.vento_popa}
                  onCheckedChange={(v) => set("vento_popa", v)}
                />
                <span className="text-sm text-muted-foreground">{form.vento_popa ? "Sim" : "Não"}</span>
              </div>
              <div className="flex items-center gap-3">
                <Label>Mar calmo?</Label>
                <Switch
                  checked={form.mar_calmo}
                  onCheckedChange={(v) => set("mar_calmo", v)}
                />
                <span className="text-sm text-muted-foreground">{form.mar_calmo ? "Sim" : "Não"}</span>
              </div>
            </div>

            {/* Observação */}
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                placeholder="Observações adicionais..."
                value={form.observacao}
                onChange={(e) => set("observacao", e.target.value)}
                rows={3}
              />
            </div>

            <div className="pt-1">
              <Button type="submit" disabled={createProvaMar.isPending}>
                {createProvaMar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
