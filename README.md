# Dashboard de Performance DevOps — Data System

Dashboard em tempo real para acompanhamento de performance, qualidade e entrega do time de desenvolvimento, integrado ao Azure DevOps.

---

> ## ⛔ ANTES DE MUDAR QUALQUER COISA, LEIA ISTO
>
> Toda a aplicação (frontend + backend) roda na **VPS** (187.77.55.172 / dsmetrics.online).
> O backend roda via **PM2** e o frontend é servido pelo **Nginx**.
>
> Resumo rápido:
> - **NUNCA** use `process.exit()` no `backend/server.js`
> - **SEMPRE** verifique imports do React ao adicionar hooks
> - Após alterações no frontend: `npm run build` e copiar `dist/` para `/var/www/devops-dashboard/dist/`
> - Após alterações no backend: copiar `server.js` para VPS e `pm2 restart devops-backend`

---

## Infraestrutura (Produção)

| Camada | Tecnologia | URL |
|---|---|---|
| Frontend | React + TypeScript + Vite (Nginx) | https://dsmetrics.online |
| Backend | Node.js + Express (PM2) | https://dsmetrics.online/api |
| Banco | PostgreSQL 16 (VPS) | localhost:5432/devops_dashboard |
| Sync | Auto-sync a cada 30 min (dentro do backend) | — |

> **Toda a infraestrutura roda na VPS 187.77.55.172** — frontend (Nginx), backend (PM2, porta 3001), e banco PostgreSQL.

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

## Deploy

O deploy é feito manualmente na VPS via SCP + SSH.

```sh
# Frontend: build e copiar para VPS
cd frontend
npm run build
scp -r dist/* root@187.77.55.172:/var/www/devops-dashboard/dist/

# Backend: copiar server.js e reiniciar PM2
scp backend/server.js root@187.77.55.172:/opt/devops-dashboard/backend/
ssh root@187.77.55.172 "pm2 restart devops-backend"
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
