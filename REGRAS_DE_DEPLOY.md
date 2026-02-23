# ⛔ REGRAS DE DEPLOY — LEIA ANTES DE TOCAR NO CÓDIGO

> **Este documento existe porque já derrubamos a aplicação 2 vezes.**
> Se você não seguir estas regras, **vai quebrar o frontend, o backend, ou ambos.**
> Consulte [INCIDENTES.md](INCIDENTES.md) para ver o que acontece quando as regras são ignoradas.

---

## 🏗️ Como este projeto funciona

Este é um **monorepo** com 2 projetos **separados** no Vercel:

```
/                          ← raiz do repositório (NÃO é um projeto Vercel)
├── frontend/              ← Projeto Vercel "frontend" (React + Vite)
│   ├── vercel.json
│   ├── package.json
│   └── src/
├── backend/               ← Projeto Vercel "backend" (Express serverless)
│   ├── vercel.json
│   ├── package.json
│   └── server.js
├── .vercelignore          ← ⚠️ CUIDADO — afeta AMBOS os projetos
├── deploy.ps1             ← Script de deploy via API
└── REGRAS_DE_DEPLOY.md   ← ESTE ARQUIVO
```

Cada projeto tem `rootDirectory` configurado no Vercel:
- Projeto **frontend** → `rootDirectory = frontend`
- Projeto **backend** → `rootDirectory = backend`

---

## ✅ COMO FAZER DEPLOY (o jeito certo)

### Opção 1: Git push (RECOMENDADO)

```sh
git add .
git commit -m "sua mensagem"
git push origin main
```

Isso dispara auto-deploy de **ambos** os projetos no Vercel automaticamente.

### Opção 2: Script manual (se precisar forçar redeploy)

```powershell
.\deploy.ps1                     # Deploy ambos em produção
.\deploy.ps1 -Target backend     # Só backend
.\deploy.ps1 -Target frontend    # Só frontend
.\deploy.ps1 -Target all -Wait   # Deploy e aguarda resultado
```

### ❌ NUNCA FAÇA ISSO

```sh
# NÃO funciona — bug do Vercel CLI com rootDirectory em monorepos
cd backend
vercel --prod     # ❌ Erro: "backend/backend does not exist"

cd frontend
vercel --prod     # ❌ Erro: "frontend/frontend does not exist"
```

---

## 🚫 LISTA DO QUE NUNCA FAZER

### 1. NUNCA adicione `backend/` ou `frontend/` no `.vercelignore`

```diff
# .vercelignore
- backend/          ← ❌ PROIBIDO — remove arquivos ANTES do rootDirectory
- frontend/         ← ❌ PROIBIDO — mesma razão
  node_modules/     ← ✅ OK
  *.db              ← ✅ OK
```

**Por quê?** O Vercel aplica `.vercelignore` na raiz **ANTES** de entrar no `rootDirectory`.
Se `backend/` estiver no ignore, o Vercel deleta todos os arquivos de backend e depois tenta
entrar em `backend/` → diretório vazio → NOT_FOUND em todas as rotas.

### 2. NUNCA coloque `headers` nas rotas do `backend/vercel.json`

```diff
# backend/vercel.json
  "routes": [
    {
-     "src": "/(.*)", "dest": "server.js",
-     "headers": { "Access-Control-Allow-Origin": "*" }   ← ❌ PROIBIDO
+     "src": "/(.*)", "dest": "server.js"                 ← ✅ CORRETO
    }
  ]
```

**Por quê?** Combinar `headers` + `dest` no vercel.json quebra o roteamento serverless.
CORS é tratado 100% pelo Express no `server.js`.

### 3. NUNCA use `process.exit()` no `backend/server.js`

```diff
- if (!JWT_SECRET) process.exit(1);    ← ❌ PROIBIDO — mata o cold start
+ if (!JWT_SECRET) console.error('⚠️ JWT_SECRET not set');  ← ✅ CORRETO
```

**Por quê?** Se o processo morrer no cold start, NENHUMA rota funciona (inclusive CORS).

### 4. SEMPRE verifique imports ao adicionar hooks do React

```diff
# Se usar useEffect, useCallback, etc., CONFIRMAR que está no import:
- import React, { useState, useMemo } from 'react';
+ import React, { useState, useMemo, useEffect } from 'react';
```

**Por quê?** `useEffect is not defined` causa tela branca no frontend inteiro.

### 5. NUNCA altere `rootDirectory` dos projetos Vercel sem saber o que está fazendo

Os projetos estão configurados assim (via API do Vercel):

| Projeto | projectId | rootDirectory |
|---|---|---|
| frontend | `prj_urke5XjJu9wNs0aaE2np0dzc4HEv` | `frontend` |
| backend | `prj_kLEwrUAJ4W58UW86xoYQoZYZlgd2` | `backend` |

Se `rootDirectory` for removido ou alterado, os auto-deploys do GitHub vão buildar da raiz
do repo (onde package.json só tem `pg`) e falhar.

---

## 🔍 COMO VERIFICAR SE O DEPLOY FUNCIONOU

### Teste rápido (PowerShell)

```powershell
# 1. Backend está respondendo?
Invoke-WebRequest "https://backend-hazel-three-14.vercel.app/api/auth/login" `
  -Method OPTIONS -UseBasicParsing `
  -Headers @{
    Origin="https://devops-datasystem.vercel.app"
    "Access-Control-Request-Method"="POST"
    "Access-Control-Request-Headers"="content-type"
  }
# Esperado: Status 204

# 2. Frontend carrega?
Invoke-WebRequest "https://devops-datasystem.vercel.app" -UseBasicParsing
# Esperado: Status 200
```

### Sinais de problema

| Sinal | Significado | Solução |
|---|---|---|
| Deploy "Ready" em <8 segundos | Build vazio, nada compilou | Verificar `.vercelignore` e rootDirectory |
| `vite: command not found` | Build rodou na raiz do repo | rootDirectory não está configurado |
| `NOT_FOUND` em todas as rotas | `server.js` não foi incluído no build | `.vercelignore` está removendo `backend/` |
| `useEffect is not defined` | Import faltando no React | Adicionar hook ao import |
| CORS blocked | Headers faltando no Express | Verificar `setCorsHeaders()` no server.js |

---

## 📁 Arquivos que NÃO devem ser alterados sem cuidado

| Arquivo | Por quê |
|---|---|
| `.vercelignore` | Afeta AMBOS os projetos. Nunca listar `backend/` ou `frontend/` |
| `backend/vercel.json` | Formato simples obrigatório (só `src` + `dest`, sem `headers`) |
| `backend/server.js` (CORS) | As 3 camadas de CORS (options, middleware, error handler) não podem ser removidas |
| `frontend/vercel.json` | Configuração do Vite SPA com rewrites |

---

## 📖 Referências

- [INCIDENTES.md](INCIDENTES.md) — Histórico completo de incidentes e lições aprendidas
- [ARQUITETURA.md](ARQUITETURA.md) — Documentação da arquitetura do sistema
- [backend/CORS_SETUP.md](backend/CORS_SETUP.md) — Como o CORS funciona neste projeto
