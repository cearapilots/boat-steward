import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAtivos, type SituacaoRow } from "@/hooks/useFleetData";

type Props = {
  open: boolean;
  onClose: () => void;
  ativoId: string | null;
  row: SituacaoRow | null;
};

function fmtDateBR(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d.length <= 10 ? d + "T00:00:00" : d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}

function fmtH(v: number | null | undefined) {
  if (v == null || isNaN(Number(v))) return "—";
  return `${Number(v).toLocaleString("pt-BR")}h`;
}

function fmtRestante(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Number(v);
  return n >= 0 ? `${n.toLocaleString("pt-BR")}h` : `${Math.abs(n).toLocaleString("pt-BR")}h atrás`;
}

export function AtivoDetalhesModal({ open, onClose, ativoId, row }: Props) {
  const { data: ativos } = useAtivos();
  const ativo = useMemo(
    () => (ativos ?? []).find((a: any) => a.id === ativoId) as any,
    [ativos, ativoId],
  );

  if (!ativoId) return null;

  const tipo = row?.tipo ?? ativo?.tipo ?? "—";
  const lanchaNome = row?.lancha_nome ?? ativo?.lancha?.nome ?? "Reserva";
  const posicao = row?.posicao ?? ativo?.posicao ?? null;
  const subtitulo = `${tipo}${posicao ? ` • ${lanchaNome} ${posicao}` : ` • ${lanchaNome}`}`;

  const isReversor = (tipo ?? "").toLowerCase().includes("revers");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row?.ativo_nome ?? ativo?.nome ?? "Ativo"}</DialogTitle>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <h4 className="text-sm font-semibold mb-2">Identificação</h4>
            <DLRow label="Marca" value={ativo?.marca ?? "—"} />
            <DLRow label="Modelo" value={ativo?.modelo ?? "—"} />
            <DLRow label="Ano de fabricação" value={ativo?.ano_fabricacao ?? "—"} />
            <DLRow label="Nº de série" value={ativo?.numero_serie ?? "—"} />
          </section>

          <Separator />

          <section>
            <h4 className="text-sm font-semibold mb-2">Horímetros</h4>
            <DLRow label="Horímetro atual" value={fmtH(row?.horas_equipamento_calculadas)} />
            <DLRow
              label="Última troca de óleo"
              value={`${fmtDateBR(row?.ultima_troca_data)} • ${fmtH(row?.ultima_troca_horimetro)}`}
            />
            <DLRow
              label="Próxima troca de óleo"
              value={`${fmtH(row?.proxima_troca_horimetro)} • restam ${fmtRestante(row?.horas_restantes_troca)}`}
            />
            {isReversor ? (
              <>
                <DLRow label="Último overhaul" value="—" />
                <DLRow label="Próximo overhaul" value="—" />
              </>
            ) : (
              <>
                <DLRow
                  label="Último overhaul"
                  value={`${fmtDateBR(row?.data_overhaul ?? ativo?.data_overhaul)} • ${fmtH(ativo?.horimetro_overhaul)}`}
                />
                <DLRow
                  label="Próximo overhaul"
                  value={
                    row?.horas_restantes_overhaul == null
                      ? "—"
                      : `restam ${fmtRestante(row?.horas_restantes_overhaul)}`
                  }
                />
              </>
            )}
          </section>

          <Separator />

          <section>
            <h4 className="text-sm font-semibold mb-2">Posição Atual</h4>
            <DLRow label="Lancha" value={lanchaNome} />
            <DLRow label="Slot" value={posicao ?? "Reserva"} />
            <DLRow label="Instalado desde" value={fmtDateBR(row?.ultima_atualizacao)} />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DLRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
