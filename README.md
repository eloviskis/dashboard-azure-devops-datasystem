# Dashboard de Performance DevOps — Data System

Dashboard em tempo real para acompanhamento de performance, qualidade e entrega do time de desenvolvimento, integrado ao Azure DevOps.

## Infraestrutura (Produção)

| Camada | Tecnologia | URL |
|---|---|---|
| Frontend | React + TypeScript + Vite (Vercel) | https://devops-datasystem.vercel.app |
| Backend | Node.js + Express (Vercel serverless) | https://backend-hazel-three-14.vercel.app |
| Banco | PostgreSQL 16 (VPS própria) | 31.97.64.250:5433 |
| Sync | `sync-standalone.js` rodando localmente | — |

> **Importante:** o IP da VPS bloqueia conexões externas. A sincronização com o Azure DevOps **deve ser executada localmente** (máquina com acesso à rede autorizada).

## Estrutura de Pastas

```
/
├── backend/
│   ├── server.js              # API REST + startup PostgreSQL
│   ├── sync-standalone.js     # Sync principal (40 campos, inclui DOR/identificacao)
│   ├── sync-local.js          # Sync legado (sem todos os campos novos)
│   ├── sync-app/              # Executável empacotado do sync
│   └── *.js                   # Scripts de migração e verificação
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Roteamento de abas e filtros globais
│   │   ├── types.ts           # Tipos TypeScript (WorkItem, etc.)
│   │   └── components/        # Todos os componentes de dashboard
│   └── vite.config.ts
└── ARQUITETURA.md
```

## Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- Acesso à VPS (rede autorizada) para o banco de dados
- PAT do Azure DevOps com permissão de leitura em Work Items

### Backend

```sh
cd backend
npm install
# Crie .env com as variáveis (ver ARQUITETURA.md)
npm start
# Disponível em http://localhost:3001
```

### Frontend

```sh
cd frontend
npm install
npm run dev
# Disponível em http://localhost:5173
```

### Sincronizar dados do Azure DevOps

```sh
# Executa uma vez (recomendado para atualização manual)
cd backend
node sync-standalone.js --once

# Executa continuamente (a cada 30 min)
node sync-standalone.js
```

> Use `sync-standalone.js` — é o único que salva **todos os 40+ campos**, incluindo `ready_date` (DOR), `identificacao` e `falha_do_processo`.

## Deploy Manual (Vercel)

O auto-deploy via GitHub pode não disparar. Sempre fazer deploy manual após push:

```sh
# Frontend
cd frontend
vercel --prod

# Backend
cd backend
vercel --prod
```

## Abas do Dashboard

| Aba | Descrição |
|---|---|
| Visão Executiva | KPIs gerais, throughput, cycle time |
| Análise de Ciclo | Scatter plot, histograma, lead vs cycle time |
| Qualidade | Bugs vs Issues, MTTR, DOR, identificação da fonte, falha do processo |
| Análise de Demanda | Backlog, aging, priorização por clientes afetados (Reincidência) |
| Pull Requests | Métricas de PR, DORA |
| Impedimentos | Itens bloqueados e SLA |
| Por Cliente | Distribuição e throughput por cliente |
| Análise PO | DOR por criador, clientes afetados, gestão de backlog |
