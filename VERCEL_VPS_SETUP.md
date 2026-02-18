# Configuração VPS PostgreSQL para Vercel

## ⚠️ Problema Identificado

O backend está no **Vercel (serverless)** mas o banco de dados PostgreSQL está na **VPS (31.97.64.250:5433)**.

Ambientes serverless como Vercel têm características especiais:
- ❌ Não mantêm conexões persistentes
- ❌ Criam novas instâncias a cada requisição
- ❌ Têm IPs dinâmicos
- ❌ Timeouts agressivos (10-30 segundos)

## ✅ Soluções Implementadas

### 1. Otimização do Pool de Conexões (Concluído)
```javascript
// Configurações serverless-friendly
max: 2,                        // Pool pequeno para serverless
min: 0,                        // Sem conexões mínimas
idleTimeoutMillis: 10000,     // Fecha conexões idle rapidamente
connectionTimeoutMillis: 5000, // Timeout rápido de conexão
allowExitOnIdle: true          // Permite pool fechar quando idle
```

### 2. Configurações Necessárias na VPS

#### A. Verificar Firewall
```bash
# Permitir conexões na porta 5433 de qualquer IP (Vercel tem IPs dinâmicos)
sudo ufw allow 5433/tcp
sudo ufw status
```

#### B. Configurar PostgreSQL para Conexões Externas

**Editar `postgresql.conf`:**
```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```

Procure e altere:
```ini
listen_addresses = '*'
max_connections = 100
```

**Editar `pg_hba.conf`:**
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

Adicione no final:
```ini
# Permitir conexões do Vercel (IPs dinâmicos)
host    devops_dashboard    devops_dash    0.0.0.0/0    md5
```

**Reiniciar PostgreSQL:**
```bash
sudo systemctl restart postgresql
```

#### C. Verificar Limites de Conexão
```sql
-- Conectar ao PostgreSQL e verificar
SELECT setting FROM pg_settings WHERE name = 'max_connections';
SHOW max_connections;

-- Ver conexões ativas
SELECT count(*) FROM pg_stat_activity;
```

### 3. Alternativas Recomendadas

#### Opção A: PgBouncer (Connection Pooler) ⭐ RECOMENDADO
Instalar PgBouncer na VPS para gerenciar conexões:

```bash
# Instalar
sudo apt-get install pgbouncer

# Configurar /etc/pgbouncer/pgbouncer.ini
[databases]
devops_dashboard = host=localhost port=5432 dbname=devops_dashboard

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
```

**Alterar DATABASE_URL no Vercel:**
```
postgresql://devops_dash:senha@31.97.64.250:6432/devops_dashboard
```

#### Opção B: Migrar para Neon PostgreSQL ⭐ MELHOR
Neon é PostgreSQL serverless, perfeito para Vercel:

1. Criar conta: https://neon.tech
2. Criar database
3. Copiar connection string
4. Atualizar DATABASE_URL no Vercel
5. Migrar dados:
```bash
pg_dump postgresql://devops_dash:senha@31.97.64.250:5433/devops_dashboard | \
psql postgresql://user:pass@neon.tech/dbname
```

#### Opção C: Supabase PostgreSQL
Alternativa ao Neon com features adicionais:
- https://supabase.com
- Oferece PostgreSQL + API REST automática

## 🔍 Diagnóstico de Problemas

### Testar Conexão do Vercel
Criar endpoint de teste em `server.js`:

```javascript
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await sql`SELECT NOW() as time, version() as version`;
    res.json({ 
      success: true, 
      time: result[0].time,
      version: result[0].version
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code
    });
  }
});
```

Testar:
```bash
curl https://backend-hazel-three-14.vercel.app/api/test-db
```

### Verificar Logs do Vercel
```bash
vercel logs backend-hazel-three-14.vercel.app
```

### Erros Comuns

**1. "Connection timeout"**
- VPS firewall bloqueando
- PostgreSQL não escutando em 0.0.0.0
- Rede da VPS com problemas

**2. "Too many connections"**
- Pool size muito alto no código
- max_connections do PostgreSQL baixo
- Precisa de PgBouncer

**3. "SSL required"**
- Adicionar `?sslmode=require` na DATABASE_URL

**4. "Authentication failed"**
- Senha incorreta na DATABASE_URL
- pg_hba.conf não configurado corretamente

## 📊 Monitoramento

### Verificar Conexões Ativas
```sql
SELECT 
    datname,
    count(*) as connections,
    max(state) as state
FROM pg_stat_activity
WHERE datname = 'devops_dashboard'
GROUP BY datname;
```

### Ver Origem das Conexões
```sql
SELECT 
    client_addr,
    count(*) as connections
FROM pg_stat_activity
WHERE datname = 'devops_dashboard'
GROUP BY client_addr;
```

## ✅ Checklist

- [ ] Firewall VPS permite porta 5433
- [ ] PostgreSQL escuta em todas as interfaces (`listen_addresses = '*'`)
- [ ] pg_hba.conf permite conexões externas
- [ ] DATABASE_URL está correta no Vercel
- [ ] Backend deployado com otimizações
- [ ] Endpoint /api/test-db responde corretamente
- [ ] Dashboard carrega dados

## 🎯 Próximos Passos

1. **Imediato:** Verificar configurações VPS acima
2. **Curto prazo:** Implementar PgBouncer
3. **Longo prazo:** Migrar para Neon ou Supabase

---

**Status Atual:**
- ✅ Backend otimizado para serverless
- ⏳ Aguardando configuração VPS
- ⏳ Teste de conectividade Vercel → VPS
