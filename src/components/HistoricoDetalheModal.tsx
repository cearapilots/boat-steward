import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

type Mode = "historico" | "ocorrencia";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  record: any | null;
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoricoDetalheModal({ open, onOpenChange, mode, record }: Props) {
  const qc = useQueryClient();
  const [descricao, setDescricao] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [tipo, setTipo] = useState("");
  const [efeito, setEfeito] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record) return;
    setDescricao(record.descricao ?? "");
    if (mode === "ocorrencia") {
      setDataInicio(toLocalInput(record.data_inicio));
      setDataFim(toLocalInput(record.data_fim));
      setTipo(record.tipo_ocorrencia ?? "");
      setEfeito(record.efeito ?? "");
    } else {
      setDataInicio(toLocalInput(record.data_evento));
    }
  }, [record, mode]);

  if (!record) return null;

  const lanchaNome =
    mode === "ocorrencia" ? record.lanchas?.nome : record.lancha?.nome;

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === "ocorrencia") {
        const payload: any = {
          descricao: descricao || null,
          tipo_ocorrencia: tipo || null,
          efeito: efeito || null,
          data_inicio: dataInicio ? new Date(dataInicio).toISOString() : null,
          data_fim: dataFim ? new Date(dataFim).toISOString() : null,
        };
        const { error } = await (supabase as any)
          .from("ocorrencias_webpilot")
          .update(payload)
          .eq("id", record.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["ocorrencias_webpilot"] });
      } else {
        const payload: any = {
          descricao: descricao || null,
          data_evento: dataInicio ? new Date(dataInicio).toISOString() : null,
        };
        const { error } = await supabase
          .from("historico")
          .update(payload)
          .eq("id", record.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["historico"] });
      }
      toast({ title: "Alterações salvas" });
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "ocorrencia" ? "Detalhe da Ocorrência" : "Detalhe da Manutenção"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Lancha</span>
              <p className="font-medium">{lanchaNome ?? "—"}</p>
            </div>
            {mode === "ocorrencia" ? (
              <div>
                <span className="text-muted-foreground">Duração</span>
                <p className="font-mono">
                  {record.duracao_horas != null
                    ? `${Number(record.duracao_horas).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h`
                    : "—"}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-muted-foreground">Posição</span>
                  <p className="font-medium">{record.ativo?.posicao ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ativo</span>
                  <p className="font-medium">{record.ativo?.nome ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo de evento</span>
                  <p>
                    <Badge variant="secondary">{record.tipo_evento}</Badge>
                  </p>
                </div>
              </>
            )}
          </div>

          {mode === "ocorrencia" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="data_inicio">Início</Label>
                  <Input id="data_inicio" type="datetime-local" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="data_fim">Fim</Label>
                  <Input id="data_fim" type="datetime-local" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tipo">Tipo</Label>
                  <Input id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="efeito">Efeito</Label>
                  <Select value={efeito || "__none__"} onValueChange={(v) => setEfeito(v === "__none__" ? "" : v)}>
                    <SelectTrigger id="efeito"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="Inoperante">Inoperante</SelectItem>
                      <SelectItem value="Operante com Restrições">Operante com Restrições</SelectItem>
                      <SelectItem value="Operante">Operante</SelectItem>
                      <SelectItem value="Não Altera">Não Altera</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {mode === "historico" && (
            <div>
              <Label htmlFor="data_evento">Data do evento</Label>
              <Input id="data_evento" type="datetime-local" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
          )}

          <div>
            <Label htmlFor="descricao">{mode === "ocorrencia" ? "Descrição / Observação" : "Observação"}</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={8}
              className="resize-y"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
