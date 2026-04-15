import { maintenanceHistory } from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const typeLabels: Record<string, string> = {
  oil_change: "Troca de óleo",
  overhaul: "Overhaul",
  bearing_revision: "Revisão rolamentos",
  other: "Outro",
};

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Manutenções</h1>
        <p className="text-sm text-muted-foreground">Log completo de eventos da frota</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Lancha</TableHead>
                  <TableHead>Equipamento</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Horímetro</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenanceHistory.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.date).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{r.boatName}</TableCell>
                    <TableCell>{r.slot}</TableCell>
                    <TableCell>{r.assetName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{typeLabels[r.type] ?? r.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.boatHours ? `${r.boatHours.toLocaleString("pt-BR")}h (lancha)` : ""}
                      {r.equipmentHours ? `${r.equipmentHours.toLocaleString("pt-BR")}h (equip)` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{r.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
