# Arquitetura do Sistema — Dashboard Azure DevOps

## 🏗️ Infraestrutura (Fevereiro 2026)

### Banco de Dados
- **Tipo**: PostgreSQL 16.11
- **Localização**: VPS própria (`31.97.64.250:5433`)
- **Database**: `devops_dashboard` | **User**: `devops_dash`
- **SSL**: `rejectUnauthorized: false`
- **Conexão**: via `DATABASE_URL` no formato `postgresql://user:pass@host:port/database`

> O IP da VPS bloqueia conexões externas não autorizadas. O backend Vercel consegue conectar; a máquina de desenvolvimento local também (rede interna).

### Backend
- **Host**: Vercel (serverless)
- **URL Produção**: https://backend-hazel-three-14.vercel.app
- **Tecnologia**: Node.js + Express + `pg` (PostgreSQL)
- **Startup**: ao iniciar, executa `ALTER TABLE work_items ADD COLUMN IF NOT EXISTS` para garantir que todas as colunas existam em bancos criados antes de migrações recentes

### Frontend
- **Host**: Vercel
- **URL Produção**: https://devops-datasystem.vercel.app
- **Tecnologia**: React + TypeScript + Vite
- **Design System**: Tailwind CSS + Recharts

### Sincronizador
- **Script principal**: `backend/sync-standalone.js` (40+ campos, inclui todos os campos custom)
- **Execução**: local (máquina com acesso à rede da VPS)
- **Script legado**: `backend/sync-local.js` — **não usar** para sync completo; não salva `identificacao`, `falha_do_processo` e outros campos recentes

---

## 📝 Fluxo de Deploy

> **Atenção**: o auto-deploy via GitHub **não dispara** de forma confiável. Sempre fazer deploy manual após push.

### Frontend
```bash
git add frontend/
git commit -m "feat: ..."
git push origin main
cd frontend
vercel --prod
```

### Backend
```bash
git add backend/
git commit -m "feat: ..."
git push origin main
cd backend
vercel --prod
```

### Banco de Dados (migrações)
```bash
# Rodar script de migration com .env local
cd backend
node run_migration_<nome>.js
```

O `server.js` também aplica `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` automaticamente no startup para as colunas principais, então após um novo deploy o banco se auto-atualiza na próxima requisição.

---

## 🔄 Sincronização de Dados

```bash
# Sync único (recomendado para atualização manual)
cd backend
node sync-standalone.js --once

# Sync contínuo (a cada 30 min)
node sync-standalone.js
```

Carregar variáveis do `.env` antes de rodar (PowerShell):
```powershell
$h = @{}
Get-Content .env | Where-Object { $_ -match "=" -and $_ -notmatch "^#" } | ForEach-Object { $p = $_ -split "=",2; $h[$p[0].Trim()]=$p[1].Trim() }
$env:AZURE_ORG=$h.AZURE_ORG; $env:AZURE_PROJECT=$h.AZURE_PROJECT
$env:AZURE_PAT=$h.AZURE_PAT; $env:DATABASE_URL=$h.DATABASE_URL
node sync-standalone.js --once
```

---

## ⚙️ Variáveis de Ambiente

### Backend (`backend/.env`)
```env
DATABASE_URL=postgresql://devops_dash:PASSWORD@31.97.64.250:5433/devops_dashboard
AZURE_ORG=datasystemsoftwares
AZURE_PROJECT=USE
AZURE_PAT=<personal_access_token>
PORT=3001
JWT_SECRET=<secret>
```

> Usar sempre `DATABASE_URL` completa. Não usar variáveis separadas (`PGHOST`, `PGPORT`, etc.).

### Frontend (`frontend/.env`)
```env
VITE_API_URL=https://backend-hazel-three-14.vercel.app
```

---

## 📊 Campos Customizados Azure DevOps → Banco

| Campo Azure DevOps | Coluna DB | Tipo | Descrição |
|---|---|---|---|
| `Custom.DOR` | `ready_date` | TEXT | Data de Definition of Ready |
| `Custom.7ac99842-...` | `identificacao` | TEXT | Quem identificou o problema: Cliente / Interno / Monitoramento / Parceiro / Testes automatizados |
| `Custom.Falhadoprocesso` | `falha_do_processo` | TEXT | Categoria de falha de processo que originou o defeito |
| `Custom.REINCIDENCIA` | `reincidencia` | TEXT | **Quantidade de clientes** afetados pelo mesmo problema (não é contador de recorrência) |
| `Custom.causaRaiz` | `causa_raiz` | TEXT | Causa raiz técnica |
| `Custom.rootCauseTask` | `root_cause_task` | TEXT | Task/categoria da causa raiz |
| `Microsoft.VSTS.Scheduling.StoryPoints` | `story_points` | REAL | Story points |
| `Microsoft.VSTS.Scheduling.OriginalEstimate` | `original_estimate` | REAL | Estimativa original |

### Colunas garantidas via ALTER TABLE no startup do server.js
`ready_date`, `done_date`, `root_cause_task`, `root_cause_team`, `root_cause_version`, `dev`, `platform`, `application`, `branch_base`, `delivered_version`, `base_version`, `identificacao`, `falha_do_processo`, `first_activation_date`, `original_estimate`, `remaining_work`, `completed_work`, `parent_id`

---

## 🧩 Componentes do Dashboard

### Aba: Qualidade (`ReworkAnalysisChart.tsx`)
- **KPIs**: Bugs (Dev) | Issues (Produção) | Taxa de Detecção em Dev | Issues Abertas + MTTR médio
- **Bugs vs Issues**: gráfico de barras com contagem real (sem taxa), clicável para ver itens
- **Tendência Mensal**: linha Bugs + Issues por mês — avalia se qualidade está melhorando
- **MTTR por Time**: barras horizontais coloridas (verde ≤7d / amarelo ≤14d / vermelho >14d)
- **Fonte de Identificação**: pizza Cliente vs Interno — alto % Cliente indica falha no QA interno
- **Falha do Processo**: ranking de categorias de falha (exibido somente se campo preenchido)

> Card "Detecção em Dev" = `Bugs / (Bugs + Issues) × 100` — quanto maior, melhor o QA.

### Aba: Análise de Demanda / PO (`POAnalysisDashboard.tsx`)
- **DOR por Criador**: top 15 com taxa de Definition of Ready
  - Se `ready_date` = NULL para todos → exibe "⚠️ Requer nova sincronização" em vez de 0%
- **Priorização por Impacto — Clientes Afetados**: tabela com itens onde `reincidencia > 0`, ordenados por quantidade de clientes, com destaque vermelho/laranja para top impactadores
  - Colunas: Clientes, #ID/Título (link Azure DevOps), Tipo, Responsável, Time, Estado, Causa Raiz

### Campo Reincidência — semântica correta
- `reincidencia = 1` → o problema afeta 1 cliente
- `reincidencia = 5` → o mesmo problema afeta 5 clientes diferentes
- **Não** significa "a tarefa voltou" ou "foi reaberta"
- Usado em `POAnalysisDashboard` para priorização de demanda

### ErrorBoundary (`ErrorBoundary.tsx`)
- Aceita prop `name?: string`
- Exibe detalhes do erro em `<details>` com component stack
- Log prefixado: `[ErrorBoundary:Dashboard-<aba>]`
- Cada aba do dashboard está isolada em seu próprio boundary

---

## 🔧 Scripts Disponíveis

```bash
# Sync principal (40+ campos)
node backend/sync-standalone.js --once

# Listar todos campos customizados da API
node backend/find_all_picklists.js

# Mapear campos de um work item específico
node backend/mapCustomFields.js

# Verificar campo DOR em item específico
node backend/check_ready_field.js

# Verificar campo causa raiz
node backend/check_causa_raiz_fields.js

# Testar conexão com banco
node test-db-connection.js
```

