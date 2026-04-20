# FleetControl — Documentação Técnica do Projeto

> Documento-mestre para alinhar humano + IA (Claude/Lovable) no desenvolvimento, manutenção e debug. **Sempre que mudar arquitetura, banco ou fluxos críticos, atualize este arquivo.**

---

## 1. Visão Geral / Ideia

**FleetControl** é um painel web para gestão de manutenção preventiva de uma frota de **lanchas** (catamarãs/barcos de transporte) operadas por uma empresa offshore. Cada lancha possui múltiplos **ativos** (motores, geradores, etc.) instalados em **posições** (BB = bombordo, BE = boreste, gerador, reserva).

### Problema que resolve
- Os horímetros das lanchas crescem continuamente, mas cada **motor/gerador** tem um horímetro próprio que depende de quando foi instalado naquela lancha.
- É preciso saber **quando trocar óleo** (a cada ~250h) e **quando fazer overhaul** (~3000h) de cada equipamento, considerando que motores são **trocados de posição entre lanchas** ao longo do tempo.
- Operadores precisam de um semáforo visual (verde / amarelo / vermelho) por equipamento e um log auditável de manutenções.

### Conceitos-chave
- **Lancha**: barco com horímetro próprio (motor principal) + horímetro de gerador.
- **Ativo**: equipamento físico rastreável (motor MTU #1234, gerador Cummins #5678…). Tem nº de série e histórico próprio.
- **Posição**: vínculo temporal `(ativo ↔ lancha ↔ slot)` com `data_instalacao` e `data_remocao`. É o que permite reconstruir o histórico quando um motor migra entre lanchas.
- **Horas do equipamento (calculadas)**: `horímetro_lancha_atual − horímetro_lancha_na_instalação + offset_instalação`. O `offset` representa horas que o equipamento já tinha antes de entrar na lancha atual.
- **Semáforo**: derivado de `horas_restantes_troca` na view `v_situacao_atual`.
  - `verde` → folga > limiar amarelo
  - `amarelo` → próximo do limite
  - `vermelho` → vencido

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Build / Dev | Vite 5 |
| UI | React 18 + TypeScript 5 |
| Estilo | Tailwind CSS v3 + shadcn/ui (Radix) |
| Estado servidor | TanStack Query (React Query) |
| Roteamento | react-router-dom v6 |
| Backend | Supabase (Postgres + Auth + RLS) |
| Notificações | Sonner |
| Datas | date-fns (locale pt-BR) |
| Ícones | lucide-react |

**Nada de Next.js, Vue, Angular.** Projeto puramente client-side servido como SPA.

---

## 3. Estrutura de Pastas

```
src/
├── App.tsx                    # Provider tree + rotas
├── main.tsx                   # Entry
├── index.css                  # Design tokens (HSL) + boat colors
├── components/
│   ├── AppLayout.tsx          # Sidebar desktop + header mobile
│   ├── MaintenanceModal.tsx   # Modal de registrar manutenção (insere em manutencoes + historico)
│   ├── StatusIndicator.tsx    # Bolinha + label do semáforo
│   ├── NavLink.tsx
│   └── ui/                    # shadcn (não editar à toa)
├── hooks/
│   ├── useFleetData.ts        # ⭐ Todas as queries/mutations Supabase
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── pages/
│   ├── Dashboard.tsx          # Cards por lancha c/ semáforo (usa v_situacao_atual)
│   ├── Motors.tsx             # Posição atual + timeline de motores
│   ├── HistoryPage.tsx        # Tabela de eventos da tabela `historico`
│   ├── SettingsPage.tsx       # Stub — parâmetros (não persistido ainda)
│   └── NotFound.tsx
├── integrations/supabase/
│   ├── client.ts              # createClient (anon key, NÃO editar)
│   └── types.ts               # Gerado automaticamente, NÃO editar
└── lib/utils.ts               # cn() helper

supabase/
├── config.toml
└── migrations/                # SQL versionado (read-only via tooling)
```

---

## 4. Banco de Dados (Supabase)

Project ref: `ejmlhoxhiupdobdlzjnh`

### 4.1 Tabelas

#### `lanchas`
Cadastro das embarcações.
| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| nome | varchar | "Flexeiras", "Fortim", "Taíba", "Reserva"… (dinâmico, não hardcode) |
| id_webpilot | varchar | ID externo p/ sync futuro |
| horimetro | numeric | Horímetro atual da lancha (motor) |
| horimetro_gerador | numeric | Horímetro do gerador da lancha |
| ultima_atualizacao | timestamptz | |

#### `ativos`
Equipamentos físicos rastreáveis.
| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| nome | varchar | Ex: "MTU 16V2000 #4521" |
| tipo | varchar | "motor", "gerador", … |
| numero_serie | varchar | |
| lancha_id | uuid → lanchas | Lancha **atual** (denormalização) |
| posicao | varchar | Slot atual: "BB", "BE", "gerador", "reserva" |
| horimetro_equipamento | numeric | Horímetro independente do equipamento |
| offset_instalacao | numeric | Horas pré-existentes ao instalar |
| intervalo_manutencao | int | Padrão: 250h |
| intervalo_overhaul | int | Padrão: 3000h |
| ultima_troca_data / ultima_troca_horimetro | | Atualizado por trigger |
| data_overhaul / horimetro_overhaul | | Atualizado por trigger |
| ativo | bool | Soft delete |

#### `posicoes`
Histórico temporal de instalação (ativo ↔ lancha ↔ slot).
| Coluna | Tipo | Notas |
|---|---|---|
| ativo_id | uuid | |
| lancha_id | uuid | NULL = no estoque/reserva |
| posicao | varchar | |
| data_instalacao | date | |
| data_remocao | date | NULL = posição atual |
| horimetro_lancha_instalacao | numeric | |
| horimetro_equipamento_instalacao | numeric | |
| offset_calculado | numeric | |
| horas_operadas | numeric | Calculado por trigger ao remover |

#### `manutencoes`
Eventos de manutenção estruturados (alimenta triggers que atualizam `ativos`).
| Coluna | Tipo | Notas |
|---|---|---|
| ativo_id | uuid | obrigatório |
| lancha_id | uuid | |
| tipo | varchar | `troca_oleo`, `overhaul`, `revisao_rolamentos`, `revisao_geral`, `outro` |
| data_manutencao | timestamptz | |
| horimetro_lancha / horimetro_equipamento | numeric | |
| observacao | text | |
| origem | varchar | `manual`, `webpilot`, … |

> ⚠️ Na migração inicial dos dados, eventos vieram só para `historico`. Toda **nova** manutenção registrada pelo modal grava nas **duas** tabelas.

#### `historico`
Log unificado de eventos (manutenção, falhas, trocas de posição, sync). É a fonte da página /historico.
| Coluna | Tipo | Notas |
|---|---|---|
| tipo_evento | varchar | mesmo enum de `manutencoes.tipo` + `falha`, `troca_posicao`… |
| descricao | text | |
| ativo_id / lancha_id | uuid | |
| data_evento | timestamptz | |
| dados_extras | jsonb | `{ horimetro_lancha, horimetro_equipamento, … }` |
| origem | varchar | |

#### `sync_log`
Registro de execuções de sincronização externa (WebPilot etc.).

### 4.2 View `v_situacao_atual`
**Coração do Dashboard.** Faz o JOIN de `ativos` + `lanchas` + última manutenção e retorna por equipamento ativo:
- `horas_equipamento_calculadas`
- `proxima_troca_horimetro`, `horas_restantes_troca`
- `horas_restantes_overhaul`
- `status_semaforo` (`verde` | `amarelo` | `vermelho`)
- `status_overhaul`

### 4.3 Funções / Triggers
- `trigger_set_updated_at` — bumps `updated_at`.
- `trigger_calcular_horas_operadas` — ao preencher `data_remocao` em `posicoes`, calcula `horas_operadas`.
- `trigger_atualizar_ativo_apos_manutencao` — após insert em `manutencoes`:
  - se `tipo = 'troca_oleo'` → atualiza `ativos.ultima_troca_*`
  - se `tipo = 'overhaul'` → atualiza `ativos.horimetro_overhaul` + `data_overhaul`

### 4.4 RLS (estado atual)
| Tabela | anon SELECT | authenticated ALL |
|---|---|---|
| lanchas, ativos, posicoes, historico, manutencoes | ✅ permitido | ✅ permitido |
| sync_log | ❌ | ✅ |

> 🔒 **Débito de segurança conhecido:** anon pode LER tudo porque ainda não há autenticação no app. Quando login for implementado, derrubar as policies `"leitura publica *"` e exigir `authenticated`.

---

## 5. Arquitetura Front-End

### 5.1 Camada de dados (`src/hooks/useFleetData.ts`)
**Toda** comunicação com o Supabase passa por esse arquivo. Hooks expostos:

| Hook | Tabela / View | Uso |
|---|---|---|
| `useSituacaoAtual()` | `v_situacao_atual` | Dashboard |
| `useLanchas()` | `lanchas` | Configurações / selects |
| `useAtivos()` | `ativos` (+ join lancha) | Motors |
| `usePosicoes()` | `posicoes` (+ joins) | Motors (histórico/timeline) |
| `useManutencoes()` | `historico` (+ joins) | HistoryPage |
| `useCreateManutencao()` | INSERT em `manutencoes` **e** `historico` | MaintenanceModal |

**Regras:**
- Componentes **nunca** chamam `supabase.from(...)` direto. Sempre via hook.
- `useCreateManutencao` invalida `["historico"]` e `["situacao_atual"]` no sucesso.

### 5.2 Páginas

- **Dashboard** (`/`) — Agrupa linhas da view por `lancha_id` dinamicamente. Cards mostram horímetros + lista de equipamentos com semáforo + botão para abrir o modal. **Não tem nomes de lancha hardcoded.**
- **Motors** (`/motores`) — Filtra `posicoes`/`ativos` por `tipo === "motor"`. 3 blocos: posição atual, timeline (barra proporcional a horas operadas), histórico tabular com filtro.
- **HistoryPage** (`/historico`) — Lê `historico`, mostra ~107 registros migrados + novos manuais. Mapeia `tipo_evento` para labels PT-BR.
- **SettingsPage** (`/configuracoes`) — UI stub, **não persiste** ainda.

### 5.3 Design System
- Tokens em `src/index.css` (todos HSL). Cores semânticas: `--primary`, `--status-ok/warn/danger`, `--boat-flexeiras/fortim/taiba/reserva`, `--sidebar-*`.
- Componentes consomem via Tailwind (`bg-status-ok`, `text-boat-fortim` etc.). **Nunca** usar cores literais (`text-red-500`).
- Fonte: Inter.

### 5.4 Roteamento (`src/App.tsx`)
```
/                → Dashboard
/motores         → Motors
/historico       → HistoryPage
/configuracoes   → SettingsPage
*                → NotFound
```
Tudo dentro do `<AppLayout>` (sidebar fixa md+, header colapsável mobile).

---

## 6. Fluxos Críticos

### 6.1 Registrar manutenção
1. Usuário clica no ícone 🔧 numa linha do Dashboard.
2. `MaintenanceModal` abre pré-preenchido com horímetros atuais (vindos da row da view).
3. Submit → `useCreateManutencao.mutateAsync({...})`:
   - INSERT em `manutencoes` (origem `manual`).
   - Trigger atualiza `ativos` (data/horímetro da última troca ou overhaul).
   - INSERT espelhado em `historico` com `dados_extras` em JSONB.
4. Invalida queries → Dashboard recalcula semáforo.

### 6.2 Sincronização externa (futuro)
Edge Function (não implementada ainda) puxaria horímetros da API WebPilot, atualizaria `lanchas.horimetro` e gravaria evento em `historico` + linha em `sync_log`.

---

## 7. Variáveis de Ambiente

Auto-populadas pela integração Supabase em `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Secrets server-side (Edge Functions): `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`.

---

## 8. Convenções

- **Idioma:** UI e mensagens em **pt-BR**. Código, identifiers e nomes de arquivos em inglês quando possível (mas nomes de tabelas/colunas Supabase são em PT — manter).
- **Datas:** sempre `format(..., { locale: ptBR })` ou `toLocaleDateString("pt-BR")`.
- **Números:** `.toLocaleString("pt-BR")` para horímetros.
- **Nunca** hardcodar nomes de lanchas. A frota muda.
- **Nunca** editar `src/integrations/supabase/types.ts` à mão (regenerado pela Lovable).

---

## 9. Débitos / Roadmap

- [ ] Autenticação (Supabase Auth email/senha) + restringir RLS para `authenticated`.
- [ ] Tabela `user_roles` + função `has_role` (ver guideline de roles) para distinguir operador / gestor.
- [ ] Persistir parâmetros de SettingsPage (criar tabela `configuracoes` ou usar Supabase storage de settings).
- [ ] Edge Function de sincronização WebPilot.
- [ ] Filtros (lancha, tipo, range de datas) e busca em `/historico`.
- [ ] Exportar histórico para CSV/PDF.
- [ ] Notificações (e-mail/push) quando semáforo virar vermelho.
- [ ] Testes (vitest configurado mas só com exemplo).

---

## 10. Como debugar problemas comuns

| Sintoma | Provável causa | Onde olhar |
|---|---|---|
| Páginas vazias (arrays `[]`) | RLS bloqueando anon | Policies das tabelas |
| Dashboard não atualiza após salvar | Esqueceu `invalidateQueries` | `useCreateManutencao.onSuccess` |
| `horas_restantes_troca` errado | View desatualizada ou trigger não disparou | View `v_situacao_atual` + trigger `trigger_atualizar_ativo_apos_manutencao` |
| Cor do semáforo errada | Mapeamento `statusFromSemaforo` ou tokens HSL | `Dashboard.tsx` + `index.css` |
| Tipos TS quebrados após mudança no DB | `types.ts` desatualizado | Aguardar regeneração automática Lovable |

---

## 11. Para a IA (Claude / Lovable)

Quando o usuário pedir mudanças, **sempre**:
1. Ler este documento antes de propor mudanças estruturais.
2. Conferir o schema real em `src/integrations/supabase/types.ts` (read-only).
3. Roteamento de dados: novo dado de Supabase → novo hook em `useFleetData.ts`, **nunca** chamar `supabase` direto de uma página.
4. UI: novos tokens de cor → adicionar em `index.css` (HSL) e `tailwind.config.ts`. Não usar cores brutas.
5. Migrações de DB: usar tooling de migração, nunca editar `types.ts`.
6. Manter pt-BR em strings visíveis ao usuário.
7. Atualizar este `PROJECT.md` quando mudar arquitetura, schema, fluxos ou adicionar páginas.
