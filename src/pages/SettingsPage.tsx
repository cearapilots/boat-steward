import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-accent">Parâmetros e integrações do sistema</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parâmetros de Manutenção</CardTitle>
            <CardDescription>Intervalos padrão para troca de óleo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Intervalo troca de óleo (horas)</Label>
              <Input type="number" defaultValue="250" />
            </div>
            <div className="space-y-2">
              <Label>Intervalo overhaul (horas)</Label>
              <Input type="number" defaultValue="3000" />
            </div>
            <div className="space-y-2">
              <Label>Alerta amarelo (horas antes)</Label>
              <Input type="number" defaultValue="100" />
            </div>
            <div className="space-y-2">
              <Label>Alerta vermelho (horas antes)</Label>
              <Input type="number" defaultValue="50" />
            </div>
            <Button onClick={() => toast.success("Parâmetros salvos")}>Salvar</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integração API</CardTitle>
            <CardDescription>Configurar sincronização de horímetros</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL do WebPilot</Label>
              <Input placeholder="https://api.webpilot.com/..." />
            </div>
            <div className="space-y-2">
              <Label>Token de acesso</Label>
              <Input type="password" placeholder="••••••••" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Sincronização automática</Label>
              <Switch />
            </div>
            <div className="space-y-2">
              <Label>Intervalo (minutos)</Label>
              <Input type="number" defaultValue="60" />
            </div>
            <Button onClick={() => toast.success("Configuração salva")}>Salvar</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
