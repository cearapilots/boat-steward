import { useManutencoes } from "@/hooks/useFleetData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

export default function HistoryPage() {
  const { data, isLoading } = useManutencoes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Manutenções</h1>
        <p className="text-sm text-accent">Log completo de eventos da frota</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Lancha</TableHead>
                    <TableHead>Posição</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Horímetro</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((r: any) => {
                    const extras = r.dados_extras ?? {};
                    const hLancha = extras.horimetro_lancha ?? extras.horimetro;
                    const hEquip = extras.horimetro_equipamento;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.data_evento ? new Date(r.data_evento).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell className="font-medium">{r.lancha?.nome ?? "—"}</TableCell>
                        <TableCell>{r.ativo?.posicao ?? "—"}</TableCell>
                        <TableCell>{r.ativo?.nome ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{typeLabels[r.tipo_evento] ?? r.tipo_evento}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {hLancha != null ? `${Number(hLancha).toLocaleString("pt-BR")}h (lancha) ` : ""}
                          {hEquip != null ? `${Number(hEquip).toLocaleString("pt-BR")}h (equip)` : ""}
                          {hLancha == null && hEquip == null ? "—" : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.descricao ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma manutenção registrada</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
