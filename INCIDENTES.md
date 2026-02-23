# Registro de Incidentes — Dashboard Azure DevOps

> Documento criado para registrar incidentes, causas raiz e lições aprendidas.
> Consulte sempre antes de fazer mudanças no backend/frontend.

---

## Incidente #1 — CORS bloqueando todas as requisições do frontend

**Data:** 23/02/2026  
**Severidade:** Crítico (aplicação inteira fora do ar)  
**Tempo de resolução:** ~1h  

### Sintomas

- `Access to fetch at 'https://backend-hazel-three-14.vercel.app/api/auth/login' from origin 'https://devops-datasystem.vercel.app' has been blocked by CORS policy`
- Login, listagem de items, users, sync/status — TUDO bloqueado
- `ReferenceError: useEffect is not defined` no console

### Causa Raiz (em ordem cronológica)

1. **Commit `62c6383`** — *"feat: persistir ativo/inativo e cargo no backend"*
   - Adicionou `useEffect()` no `frontend/src/App.tsx` (linha 128) para buscar config global de abas
   - **MAS NÃO adicionou `useEffect` ao import** — o import era `import React, { useState, useMemo } from 'react'`
   - Resultado: `ReferenceError: useEffect is not defined` → tela branca

2. **Commit `27b7ff3`** — *"fix: CORS - add explicit OPTIONS preflight handler"* (tentativa de fix)
   - Ao tentar corrigir os erros de CORS reportados, foram adicionados `headers` no `backend/vercel.json`
   - **Combinar `headers` + `dest` nas rotas do `vercel.json` quebra o roteamento do Vercel Serverless**
   - Resultado: backend retornava **404 NOT_FOUND** para TODAS as rotas → CORS piorou

3. **Commit `54e14d1`** — Fix definitivo
   - `vercel.json` revertido para formato simples (só `src` + `dest`, sem `headers`)
   - CORS movido 100% para dentro do Express com 3 camadas de proteção
   - `process.exit(1)` removido (crashava cold start se JWT_SECRET faltasse)

### Correções Aplicadas

| Arquivo | O que mudou |
|---|---|
| `frontend/src/App.tsx` | Adicionado `useEffect` ao import do React |
| `backend/vercel.json` | Simplificado para `{ src: "/(.*)", dest: "server.js" }` sem headers |
| `backend/server.js` | CORS via `app.options('*')` + `app.use(setCorsHeaders)` + error handler global |
| `backend/CORS_SETUP.md` | Documentação permanente de como o CORS funciona |

### Lições Aprendidas

1. **Sempre verificar imports ao adicionar hooks do React.** Se usar `useEffect`, `useCallback`, etc., confirmar que está no import.

2. **NUNCA colocar `headers` nas rotas do `vercel.json` do backend.** Isso conflita com `dest` e causa 404. Todo CORS fica no Express.

3. **NUNCA usar `process.exit()` no servidor.** Se uma env var faltar, logar warning, não matar o processo. Senão o cold start falha e nenhuma rota funciona (inclusive CORS).

4. **Testar CORS após QUALQUER deploy do backend:**
   ```powershell
   # Teste de preflight
   Invoke-WebRequest "https://backend-hazel-three-14.vercel.app/api/auth/login" `
     -Method OPTIONS -UseBasicParsing `
     -Headers @{
       Origin="https://devops-datasystem.vercel.app"
       "Access-Control-Request-Method"="POST"
       "Access-Control-Request-Headers"="content-type"
     }
   # Esperado: Status 204, Header Access-Control-Allow-Origin presente
   ```

5. **Deploy do backend:**
   ```powershell
   cd backend
   vercel --prod --yes
   ```

6. **Deploy do frontend:**
   ```powershell
   cd frontend
   vercel --prod --yes
   ```

### Commits relacionados

| Commit | Descrição |
|---|---|
| `62c6383` | Introduziu o bug (useEffect sem import) |
| `27b7ff3` | Tentativa de fix que piorou (headers no vercel.json) |
| `649b19d` | Fix do useEffect import |
| `54e14d1` | Fix definitivo do CORS |
| `ca738db` | Documentação CORS_SETUP.md |

---

## Incidente #2 — GitHub auto-deploy buildando da raiz do monorepo (NOT_FOUND + vite command not found)

**Data:** 23/02/2026  
**Severidade:** Crítico (frontend e backend fora do ar em auto-deploy)  
**Tempo de resolução:** ~40min  

### Sintomas

- Frontend: `vite: command not found` → deploy Error (8s) em TODOS os auto-deploys do GitHub
- Backend: `Build Completed in /vercel/output [7ms]` → NOT_FOUND em TODAS as rotas
- Deploys manuais via CLI (`cd frontend && vercel --prod`) funcionavam (47s, Ready)
- Padrão alternado na lista de deploys: Error / Ready / Error / Ready

### Causa Raiz (cadeia de problemas)

1. **Monorepo sem `rootDirectory` configurado nos projetos Vercel**
   - Ambos os projetos (`frontend` e `backend`) tinham `rootDirectory=null`
   - Quando GitHub auto-deploy era triggerado, Vercel usava a **raiz do repo** como contexto de build
   - Na raiz, `package.json` só contém `pg` → `added 14 packages` (deveria ser 150+ para backend, 362+ para frontend)
   - `vite: command not found` no frontend, `server.js` não processado no backend

2. **`.vercelignore` na raiz do repo com `backend/` listado**
   - O arquivo `.vercelignore` tinha `backend/` como primeira linha (para evitar upload de backend no frontend)
   - Vercel aplica `.vercelignore` **ANTES** de aplicar `rootDirectory`
   - Resultado: quando `rootDirectory=backend` foi configurado, TODOS os arquivos de `backend/` já tinham sido removidos
   - O build entrava em `backend/` e encontrava um **diretório vazio** → `Build Completed in 7ms` → NOT_FOUND

3. **Bug do Vercel CLI com rootDirectory em monorepos**
   - Ao tentar deploy manual (`cd backend && vercel --prod`) com `rootDirectory=backend` no projeto, o CLI tenta acessar `backend/backend/` (duplica o path)
   - Erro: `The provided path "...\backend\backend" does not exist`
   - Impossibilitava deploy manual como workaround

### Correções Aplicadas

| O que | Como |
|---|---|
| **rootDirectory** configurado nos projetos Vercel | API PATCH: `frontend → rootDirectory=frontend`, `backend → rootDirectory=backend` |
| **`.vercelignore`** corrigido | Removido `backend/` da lista (rootDirectory já isola; a entrada antiga deletava arquivos antes do rootDirectory) |
| **Script de deploy** | `deploy.ps1` criado usando Vercel Deployments API (não CLI), evitando bug de path duplicado |

### Log de build ANTES do fix (backend)

```
Removed 59 ignored files defined in .vercelignore   ← removeu TUDO de backend/
/backend/.env.example
/backend/server.js                                   ← servidor removido!
...
Build Completed in /vercel/output [7ms]              ← nada para buildar
```

### Log de build DEPOIS do fix (backend)

```
Removed 10 ignored files defined in .vercelignore   ← só .env, docs, etc
Installing dependencies...
added 150 packages in 2s                             ← dependencias instaladas!
Build Completed in /vercel/output [5s]               ← build real
Created build cache: 1s
Uploading build cache [6.44 MB]                      ← cache criado
```

### Lições Aprendidas

1. **Monorepos no Vercel PRECISAM de `rootDirectory` configurado.** Sem isso, auto-deploys do GitHub usam a raiz do repo e falham silenciosamente.

2. **`.vercelignore` é aplicado ANTES de `rootDirectory`.** Se você ignorar `backend/` no `.vercelignore` da raiz, o Vercel remove os arquivos ANTES de entrar em `backend/` como root. Com rootDirectory configurado, cada projeto já é isolado — não precisa ignorar o outro.

3. **Vercel CLI tem bug com rootDirectory em monorepos.** `cd subdir && vercel --prod` tenta acessar `subdir/subdir/`. Use a API diretamente ou `git push` para deploys.

4. **Deploys de 6-8s com "Ready" são suspeitos.** Um deploy real do backend leva ~14s (npm install + build). Deploys de <8s significam que nada foi installado/compilado.

5. **Deploy manual vs auto-deploy:**
   - Se o auto-deploy funciona: `git push` e pronto
   - Para deploy manual: usar `.\deploy.ps1` (que usa a API, não o CLI)

### Comandos de deploy atualizados

```powershell
# Via git push (RECOMENDADO - auto-deploy do GitHub)
git push origin main

# Manual via script (usa Vercel API)
.\deploy.ps1                     # Deploy ambos
.\deploy.ps1 -Target backend     # Só backend
.\deploy.ps1 -Target frontend    # Só frontend
.\deploy.ps1 -Target all -Wait   # Deploy e aguardar resultado

# Teste de CORS após deploy
Invoke-WebRequest "https://backend-hazel-three-14.vercel.app/api/auth/login" `
  -Method OPTIONS -UseBasicParsing `
  -Headers @{
    Origin="https://devops-datasystem.vercel.app"
    "Access-Control-Request-Method"="POST"
    "Access-Control-Request-Headers"="content-type"
  }
# Esperado: Status 204, Access-Control-Allow-Origin presente
```

### Commits relacionados

| Commit | Descrição |
|---|---|
| `5a18fce` | Fix: remove backend/ do .vercelignore + deploy.ps1 via API |

### Configuração Vercel (via API, permanente)

| Projeto | rootDirectory | projectId |
|---|---|---|
| frontend | `frontend` | `prj_urke5XjJu9wNs0aaE2np0dzc4HEv` |
| backend | `backend` | `prj_kLEwrUAJ4W58UW86xoYQoZYZlgd2` |

---

## Checklist Pré-Deploy

Antes de fazer push/deploy, sempre verificar:

- [ ] Todos os hooks do React usados estão importados (`useState`, `useEffect`, `useMemo`, `useCallback`, etc.)
- [ ] `backend/vercel.json` tem formato simples (sem `headers` nas rotas)
- [ ] Nenhum `process.exit()` no `backend/server.js` antes dos middlewares CORS
- [ ] `.vercelignore` na raiz **NÃO** lista `backend/` nem `frontend/` (rootDirectory já isola)
- [ ] Projetos Vercel têm `rootDirectory` configurado (`frontend` e `backend` respectivamente)
- [ ] Após deploy do backend, testar preflight OPTIONS com o comando acima
- [ ] Se deploy automático falha em <10s → verificar `.vercelignore` e rootDirectory
