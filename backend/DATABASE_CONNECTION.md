# Padrão de Conexão com Banco de Dados

**IMPORTANTE**: Este projeto usa PostgreSQL na VPS (31.97.64.250:5433).

## ✅ PADRÃO CORRETO

Sempre use `DATABASE_URL` do arquivo `.env`:

```javascript
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function minhaFuncao() {
  try {
    const result = await pool.query('SELECT * FROM work_items LIMIT 10');
    console.log(result.rows);
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await pool.end();
  }
}

minhaFuncao();
```

## ❌ NÃO USAR

**NUNCA** use variáveis separadas como:
```javascript
// ❌ ERRADO - NÃO FAZER
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false }
});
```

## 📝 Template de Script

Use este template ao criar novos scripts:

```javascript
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function executar() {
  try {
    console.log('🔍 Consultando banco...\n');
    
    // Sua query aqui
    const result = await pool.query(`
      SELECT COUNT(*) as total FROM work_items
    `);
    
    console.log('Resultado:', result.rows[0]);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

executar();
```

## 🔧 Scripts de Utilidade Disponíveis

### Verificar Campos Custom
```bash
node verify_all_fields.js
```
Verifica se todos os campos Custom do código existem no Azure DevOps.

### Testar Conexão
```bash
node test_connection.js
```
Testa a conexão com o banco PostgreSQL na VPS.

### Estatísticas DOR/DOD
```bash
node check_dor_dod.js
```
Mostra estatísticas de Definition of Ready e Definition of Done.

## 🚀 Sincronização

### Local (Desenvolvimento)
```bash
node sync-standalone.js --once
```

### Produção (Vercel)
A sincronização roda automaticamente a cada 15 minutos via cron job configurado no Vercel.

## 📍 Infraestrutura

- **Banco**: PostgreSQL 16.11 na VPS (31.97.64.250:5433)
- **Backend**: Vercel Serverless (https://backend-hazel-three-14.vercel.app)
- **Frontend**: Vercel Static (https://devops-datasystem.vercel.app)
- **Repositório**: https://github.com/eloviskis/dashboard-azure-devops-datasystem
