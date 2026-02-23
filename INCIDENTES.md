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

## Checklist Pré-Deploy

Antes de fazer push/deploy, sempre verificar:

- [ ] Todos os hooks do React usados estão importados (`useState`, `useEffect`, `useMemo`, `useCallback`, etc.)
- [ ] `backend/vercel.json` tem formato simples (sem `headers` nas rotas)
- [ ] Nenhum `process.exit()` no `backend/server.js` antes dos middlewares CORS
- [ ] Após deploy do backend, testar preflight OPTIONS com o comando acima
