# Arquitetura do Sistema - Dashboard Azure DevOps

## 🏗️ Infraestrutura ATUAL (Fevereiro 2026)

### Banco de Dados
- **Tipo**: PostgreSQL 16.11
- **Localização**: VPS própria (31.97.64.250:5433)
- **Database**: devops_dashboard
- **User**: devops_dash
- **Conexão**: Via `DATABASE_URL` no formato `postgresql://user:pass@host:port/database`
- **SSL**: Habilitado com `rejectUnauthorized: false`

### Backend
- **Host**: Vercel (serverless)
- **URL Produção**: https://backend-hazel-three-14.vercel.app
- **Tecnologia**: Node.js + Express
- **Funções**: 
  - API REST para dashboard
  - Sincronização automática com Azure DevOps (a cada 15 minutos)
  - Sincronização manual via `/api/sync` (autenticado)
- **Conexão ao Banco**: Usa `DATABASE_URL` com driver `pg` (PostgreSQL)

### Frontend
- **Host**: Vercel
- **URL Produção**: https://devops-datasystem.vercel.app
- **Tecnologia**: React + TypeScript + Vite
- **Design System**: Tailwind CSS + Recharts
- **Build**: Static site generation (SSR no Vercel)

## 📝 Fluxo de Deploy

### 1. Alterações no Banco de Dados
```bash
# Opção A: Conectar diretamente na VPS via psql
ssh user@31.97.64.250
psql -h localhost -p 5433 -U devops_dash -d devops_dashboard

# Opção B: Criar script de migration e rodar localmente
# O script usa DATABASE_URL do .env para conectar na VPS
node backend/run_migration_<nome>.js
```

### 2. Alterações no Backend
```bash
# Commit e push para main
git add backend/
git commit -m "feat: nova funcionalidade backend"
git push origin main

# Deploy manual (se necessário)
cd backend
vercel --prod
```

### 3. Alterações no Frontend
```bash
# Commit e push para main
git add frontend/
git commit -m "feat: nova funcionalidade frontend"
git push origin main

# Deploy manual (se necessário)
cd frontend
vercel --prod
```

## 🔄 Sincronização de Dados

### Automática (Produção)
- Backend no Vercel tem cron job configurado
- Roda a cada **15 minutos**
- Sincroniza itens alterados nos últimos **180 dias**
- Logs disponíveis em `/api/sync-log`

### Manual (Desenvolvimento Local)
```bash
# Sync completo
cd backend
node sync-standalone.js --once

# Sync contínuo (a cada X minutos)
node sync-standalone.js
```

## ⚙️ Variáveis de Ambiente

### Backend (.env)
```env
# PostgreSQL na VPS
DATABASE_URL=postgresql://devops_dash:PASSWORD@31.97.64.250:5433/devops_dashboard

# Azure DevOps
AZURE_ORG=datasystemsoftwares
AZURE_PROJECT=USE
AZURE_PAT=<personal_access_token>

# Servidor
PORT=3001
JWT_SECRET=<secret>
```

**IMPORTANTE**: Sempre use `DATABASE_URL` completa. Não use variáveis separadas como `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

### Frontend (.env)
```env
# URL do backend em produção
VITE_API_URL=https://backend-hazel-three-14.vercel.app
```

## 🔧 Scripts Úteis

### Verificação de Campos
```bash
# Verificar se todos os campos Custom estão mapeados corretamente
cd backend
node verify_all_fields.js
```

### Teste de Conexão
```bash
# Testar conexão com banco PostgreSQL na VPS
cd backend
node test_connection.js
```

### Estatísticas DOR/DOD
```bash
# Ver estatísticas de Definition of Ready e Definition of Done
cd backend
node check_dor_dod.js
```

## 📊 Campos Customizados Azure DevOps

### Novos campos adicionados (2026-02-18):
- **Identificação**: `Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5`
  - Valores: Cliente, Interno, Monitoramento, Parceiro, Testes automatizados
  
- **Falha do Processo**: `Custom.Falhadoprocesso`
  - Valores: 10 opções (ver find_all_picklists.js)

## 🔍 Scripts Úteis

```bash
# Listar todos campos customizados da API
node backend/find_all_picklists.js

# Mapear campos de um work item específico
node backend/mapCustomFields.js

# Sincronizar dados do Azure DevOps
node backend/sync-standalone.js

# Testar conexão com banco
node test-db-connection.js
```

## 📝 Notas Importantes

1. **Sempre verificar** se DATABASE_URL aponta para a VPS
2. **Migrations** devem ser executadas diretamente no PostgreSQL da VPS
3. **Vercel** faz deploy automático do backend/frontend via Git
4. **Sincronização** é feita do backend Vercel → VPS PostgreSQL
