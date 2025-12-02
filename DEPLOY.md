# Deploy Instructions

## Frontend (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/eloviskis/dashboard-azure-devops-datasystem)

### Manual Deploy via Dashboard:

1. Acesse: https://vercel.com/new
2. Importe: `eloviskis/dashboard-azure-devops-datasystem`
3. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Environment Variables:
   ```
   VITE_API_URL=https://seu-backend.onrender.com
   ```
5. Deploy!

## Backend (Render)

### Via Dashboard:

1. Acesse: https://dashboard.render.com/select-repo
2. Conecte: `eloviskis/dashboard-azure-devops-datasystem`
3. Configure:
   - **Name:** `dashboard-datasystem-api`
   - **Environment:** Node
   - **Region:** Oregon (US West)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
4. Environment Variables:
   ```
   AZURE_PAT=seu-token-aqui
   ```
5. Create Web Service

### Após deploy do backend:

1. Copie a URL do backend (ex: `https://dashboard-datasystem-api.onrender.com`)
2. Vá nas configurações da Vercel
3. Atualize `VITE_API_URL` com a URL do backend
4. Redeploy o frontend

## Estrutura de Deploy

```
Frontend (Vercel)  →  Backend (Render)  →  Azure DevOps API
     ↓                      ↓
  VITE_API_URL          AZURE_PAT
                       SQLite DB
```

## URLs após deploy:

- **Frontend:** https://seu-projeto.vercel.app
- **Backend:** https://dashboard-datasystem-api.onrender.com

## Notas:

- ⚠️ Plano gratuito do Render hiberna após 15 min de inatividade
- ✅ Primeiro acesso pode levar ~30 segundos para despertar
- 🔄 Sync automático do Azure DevOps a cada 30 minutos
- 💾 Dados persistidos em SQLite no Render
