import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Mode = "historico" | "ocorrencia";

const typeLabels: Record<string, string> = {
  troca_oleo: "Troca de óleo",
  overhaul: "Overhaul",
  troca_posicao: "Troca de posição",
  revisao: "Revisão",
  revisao_rolamentos: "Revisão de rolamentos",
  revisao_geral: "Revisão geral",
  falha: "Falha",
  outro: "Outro",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const normalized = iso.replace(" ", "T");
  const [datePart, timePart] = normalized.split("T");
  const [ano, mes, dia] = datePart.split("-");
  if (!timePart) return `${dia}/${mes}/${ano}`;
  return `${dia}/${mes}/${ano} ${timePart.slice(0, 5)}`;
}

const inputClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const lbl = "text-xs text-muted-foreground font-medium";
const val = "text-sm mt-0.5";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  record: any | null;
}

export function HistoricoDetalheModal({ open, onOpenChange, mode, record }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [duracaoHoras, setDuracaoHoras] = useState("");
  const [efeito, setEfeito] = useState("__none__");

  useEffect(() => {
    if (!record || !open) return;
    if (mode === "historico") {
      setDescricao(record.descricao ?? "");
      setDataEvento(record.data_evento ? record.data_evento.slice(0, 10) : "");
    } else {
      setDescricao(record.descricao ?? "");
      setDataFim(record.data_fim ? record.data_fim.slice(0, 10) : "");
      setDuracaoHoras(record.duracao_horas != null ? String(record.duracao_horas) : "");
      setEfeito(record.efeito ?? "__none__");
    }
  }, [record, mode, open]);

  if (!record) return null;

  const isAutomatic = record.origem === "webpilot_sync";

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === "historico") {
        const { error } = await (supabase as any)
          .from("historico")
          .update({ descricao: descricao || null, data_evento: dataEvento || null })
          .eq("id", record.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["historico"] });
      } else {
        const { error } = await (supabase as any)
          .from("ocorrencias_webpilot")
          .update({
            descricao: descricao || null,
            data_fim: dataFim || null,
            duracao_horas: duracaoHoras !== "" ? Number(duracaoHoras) : null,
            efeito: efeito === "__none__" ? null : efeito,
          })
          .eq("id", record.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["ocorrencias_webpilot"] });
      }
      toast.success("Registro atualizado com sucesso");
      onOpenChange(false);
    } catch (err: any) {
      console.error("[HistoricoDetalheModal] erro ao salvar:", err);
      toast.error(`Erro ao salvar: ${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "historico" ? "Detalhe da Manutenção" : "Detalhe da Ocorrência"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {isAutomatic && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
              <span className="shrink-0">⚠️</span>
              <span>Este registro foi importado automaticamente. Edições manuais não serão sobrescritas pela sincronização.</span>
            </div>
          )}

          {/* Campos somente leitura */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Informações</h3>
            {mode === "historico" ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className={lbl}>Lancha</p>
                  <p className={val}>{record.lancha?.nome ?? "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Tipo</p>
                  <p className={val}>{typeLabels[record.tipo_evento] ?? record.tipo_evento ?? "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Ativo</p>
                  <p className={val}>{record.ativo?.nome ?? "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Posição</p>
                  <p className={val}>{record.ativo?.posicao ?? "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Origem</p>
                  <p className={val}>{isAutomatic ? "Importação automática" : "Manual"}</p>
                </div>
                {(() => {
                  const extras = record.dados_extras ?? {};
                  const hLancha = extras.horimetro_lancha ?? extras.horimetro;
                  const hEquip = extras.horimetro_equipamento;
                  if (hLancha == null && hEquip == null) return null;
                  return (
                    <div>
                      <p className={lbl}>Horímetro</p>
                      <p className={val + " font-mono text-xs"}>
                        {hLancha != null ? `${Number(hLancha).toLocaleString("pt-BR")}h (lancha)` : ""}
                        {hLancha != null && hEquip != null ? " / " : ""}
                        {hEquip != null ? `${Number(hEquip).toLocaleString("pt-BR")}h (equip)` : ""}
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className={lbl}>Lancha</p>
                  <p className={val}>{(record.lanchas as any)?.nome ?? "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Tipo de ocorrência</p>
                  <p className={val}>{record.tipo_ocorrencia ?? "—"}</p>
                </div>
                <div>
                  <p className={lbl}>Início</p>
                  <p className={val + " font-mono text-xs"}>{fmtDateTime(record.data_inicio)}</p>
                </div>
                <div>
                  <p className={lbl}>Origem</p>
                  <p className={val}>{isAutomatic ? "Importação automática" : "Manual"}</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Campos editáveis */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Editar</h3>
            {mode === "historico" ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className={lbl}>Data do evento</label>
                  <input
                    type="date"
                    value={dataEvento}
                    onChange={(e) => setDataEvento(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className={lbl}>Observação / Descrição</label>
                  <Textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    rows={8}
                    className="resize-y"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={lbl}>Data fim</label>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={lbl}>Duração (horas)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={duracaoHoras}
                      onChange={(e) => setDuracaoHoras(e.target.value)}
                      placeholder="—"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={lbl}>Efeito</label>
                  <Select value={efeito} onValueChange={setEfeito}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="Inoperante">Inoperante</SelectItem>
                      <SelectItem value="Operante">Operante</SelectItem>
                      <SelectItem value="Operante com Restrições">Operante com Restrições</SelectItem>
                      <SelectItem value="Não Altera">Não Altera</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className={lbl}>Descrição / Observação</label>
                  <Textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    rows={8}
                    className="resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
