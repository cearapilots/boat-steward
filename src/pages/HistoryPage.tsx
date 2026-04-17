import { useManutencoes } from "@/hooks/useFleetData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const typeLabels: Record<string, string> = {
  troca_oleo: "Troca de óleo",
  overhaul: "Overhaul",
  revisao_rolamento: "Revisão rolamentos",
  outro: "Outro",
};

export default function HistoryPage() {
  const { data, isLoading } = useManutencoes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Manutenções</h1>
        <p className="text-sm text-muted-foreground">Log completo de eventos da frota</p>
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
                  {(data ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.data_manutencao).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="font-medium">{r.lancha?.nome ?? "—"}</TableCell>
                      <TableCell>{r.ativo?.posicao ?? "—"}</TableCell>
                      <TableCell>{r.ativo?.nome ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{typeLabels[r.tipo] ?? r.tipo}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.horimetro_lancha ? `${Number(r.horimetro_lancha).toLocaleString("pt-BR")}h (lancha) ` : ""}
                        {r.horimetro_equipamento ? `${Number(r.horimetro_equipamento).toLocaleString("pt-BR")}h (equip)` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.observacao ?? "—"}</TableCell>
                    </TableRow>
                  ))}
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
