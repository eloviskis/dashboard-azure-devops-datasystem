# Configuração CORS — Backend (Vercel Serverless)

> **NUNCA altere a ordem dos middlewares CORS no `server.js`.  
> Eles DEVEM ser os primeiros middlewares registrados no Express.**

---

## Problema resolvido

O frontend (`https://devops-datasystem.vercel.app`) faz fetch para o backend
(`https://backend-hazel-three-14.vercel.app`). Como são domínios diferentes
o browser envia um **preflight OPTIONS** antes de cada request.  
Se o backend não responder ao OPTIONS com os headers CORS corretos,
o browser **bloqueia tudo** — inclusive login, items, users, etc.

---

## Arquitetura da solução (3 camadas de proteção)

### 1. `vercel.json` — Roteamento simples

```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes":  [{ "src": "/(.*)", "dest": "server.js" }]
}
```

- **NÃO** colocar `headers` nas rotas do `vercel.json` — isso já causou 404 no passado.
- Toda a lógica de CORS fica no Express.

### 2. `server.js` — Middleware CORS (primeiros middlewares do Express)

```javascript
// ✅ CORRETO — setCorsHeaders antes de TUDO
app.options('*', (req, res) => { setCorsHeaders(req, res); res.status(204).end(); });
app.use((req, res, next)    => { setCorsHeaders(req, res); next(); });
app.use(express.json());
// ... demais rotas
```

- `app.options('*')` captura TODO preflight e retorna 204 **antes** de qualquer outra rota.
- `app.use(setCorsHeaders)` adiciona os headers em TODA resposta (GET, POST, etc.).
- O pacote `cors` do npm **não é mais usado** como middleware (fica importado mas sem efeito).

### 3. Error handler global (último middleware)

```javascript
app.use((err, req, res, _next) => {
  setCorsHeaders(req, res);  // ← CORS mesmo em erros 500
  res.status(500).json({ error: 'Internal Server Error' });
});
```

- Definido **APÓS todas as rotas** (requisito do Express para error handlers).
- Garante que mesmo um crash interno retorna headers CORS.

---

## Origens permitidas

Definidas na constante `ALLOWED_ORIGINS` no topo do `server.js`:

| Origem | Uso |
|---|---|
| `https://devops-datasystem.vercel.app` | Frontend produção |
| `https://dashboard-azure-devops-datasystem.vercel.app` | Frontend alias antigo |
| `*.vercel.app` (wildcard) | Preview deploys do Vercel |
| `http://localhost:5173` | Dev frontend (Vite) |
| `http://localhost:3000` | Dev alternativo |
| `http(s)://31.97.64.250` | VPS direta |

Para adicionar uma nova origem: edite o array `ALLOWED_ORIGINS` em `server.js`.

---

## Regras para nunca mais quebrar

1. **NUNCA use `process.exit()`** no código que roda antes dos middlewares CORS.  
   Se a env var estiver faltando, logue um warning — não mate o processo.

2. **NUNCA adicione `headers` nas rotas do `vercel.json`** — isso entra em conflito
   com `dest` e pode causar 404.

3. **Middlewares CORS são SEMPRE os primeiros** — antes de `express.json()`,
   antes de auth, antes de qualquer coisa.

4. **Teste após qualquer deploy** com:
   ```powershell
   Invoke-WebRequest "https://backend-hazel-three-14.vercel.app/api/auth/login" `
     -Method OPTIONS -UseBasicParsing `
     -Headers @{
       Origin="https://devops-datasystem.vercel.app"
       "Access-Control-Request-Method"="POST"
       "Access-Control-Request-Headers"="content-type"
     }
   # Deve retornar Status 204 com Access-Control-Allow-Origin
   ```

5. **Deploy do backend** sempre via:
   ```powershell
   cd backend
   vercel --prod --yes
   ```

---

## Histórico de problemas

| Data | Problema | Causa | Fix |
|---|---|---|---|
| 2026-02-23 | CORS block em todas as rotas | `vercel.json` com `headers`+`dest` causava 404 | Simplificar `vercel.json`, mover CORS pro Express |
| 2026-02-23 | `process.exit(1)` matava o cold start | JWT_SECRET faltando → crash → sem CORS | Trocar `process.exit` por warning |
