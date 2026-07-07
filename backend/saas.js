/**
 * saas.js — Módulo SaaS: tenants, planos, trial, Mercado Pago, super-admin
 * Montado em server.js via: const saas = require('./saas'); app.use('/api', saas.router);
 */
const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');

const router = express.Router();

// ─── Configuração ─────────────────────────────────────────────────────────────
const JWT_SECRET     = process.env.JWT_SECRET;
const MASTER_KEY     = process.env.MASTER_KEY || 'change-me-superadmin';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const ENC_KEY_HEX    = process.env.ENCRYPTION_KEY;
const ENCRYPTION_KEY = ENC_KEY_HEX
  ? Buffer.from(ENC_KEY_HEX, 'hex')
  : crypto.randomBytes(32);   // fallback (não persiste entre restarts — defina no .env!)

let pool = null;
let sql  = null;

/** Injeta pool/sql do server.js */
function init(poolInstance, sqlInstance) {
  pool = poolInstance;
  sql  = sqlInstance;
}

// ─── AES-256-CBC: criptografia do Azure PAT ───────────────────────────────────
function encryptPAT(text) {
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted    += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPAT(enc) {
  try {
    const [ivHex, encrypted] = enc.split(':');
    const iv       = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let dec = decipher.update(encrypted, 'hex', 'utf8');
    dec    += decipher.final('utf8');
    return dec;
  } catch {
    return enc; // fallback: retorna como está (backward compat)
  }
}

// ─── Criação das tabelas SaaS ─────────────────────────────────────────────────
async function initSaasTables() {
  if (!sql) return;
  try {
    // Planos disponíveis
    await sql`
      CREATE TABLE IF NOT EXISTS saas_plans (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        price_brl     NUMERIC(10,2) DEFAULT 299.00,
        max_users     INT DEFAULT 10,
        trial_days    INT DEFAULT 30,
        features      JSONB DEFAULT '[]',
        active        BOOLEAN DEFAULT TRUE,
        mp_plan_id    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Tenants (clientes da plataforma)
    await sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id                   SERIAL PRIMARY KEY,
        slug                 TEXT UNIQUE NOT NULL,
        company_name         TEXT NOT NULL,
        owner_email          TEXT UNIQUE NOT NULL,
        owner_name           TEXT,
        phone                TEXT,
        azure_org            TEXT,
        azure_project        TEXT,
        azure_pat_enc        TEXT,
        plan_id              INT REFERENCES saas_plans(id),
        trial_starts_at      TIMESTAMPTZ DEFAULT NOW(),
        trial_ends_at        TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
        subscription_status  TEXT NOT NULL DEFAULT 'trial',
        mp_subscription_id   TEXT,
        mp_payer_email       TEXT,
        notes                TEXT,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Eventos de pagamento (histórico de webhooks MP)
    await sql`
      CREATE TABLE IF NOT EXISTS mp_payment_events (
        id            SERIAL PRIMARY KEY,
        tenant_id     INT REFERENCES tenants(id),
        mp_payment_id TEXT,
        event_type    TEXT,
        amount        NUMERIC(10,2),
        payload       JSONB,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Plano padrão
    const plans = await sql`SELECT id FROM saas_plans WHERE name = 'Starter'`;
    if (plans.length === 0) {
      await sql`
        INSERT INTO saas_plans (name, price_brl, max_users, trial_days, features)
        VALUES ('Starter', 299.00, 10, 30, '["all_dashboards","qa_tracker","devtracker","ceremonies"]')
      `;
    }

    // Tenant padrão (id=1) para instâncias existentes
    const defaultTenant = await sql`SELECT id FROM tenants WHERE slug = 'default'`;
    if (defaultTenant.length === 0) {
      await sql`
        INSERT INTO tenants (slug, company_name, owner_email, owner_name, subscription_status, trial_ends_at)
        VALUES ('default', 'Default', 'admin@datasystem.com', 'Admin', 'manual', '2099-12-31')
      `;
    }

    // Adiciona tenant_id às tabelas principais (migration segura)
    const tables = [
      'work_items', 'pull_requests', 'users', 'app_settings',
      'team_member_avatars', 'sync_log', 'qa_test_records',
      'devtracker_developers', 'devtracker_projects', 'devtracker_allocations',
      'ceremony_config', 'ceremony_records'
    ];
    for (const t of tables) {
      try {
        await pool.query(
          `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS tenant_id INT NOT NULL DEFAULT 1 REFERENCES tenants(id)`
        );
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_${t}_tenant ON ${t}(tenant_id)`
        );
      } catch { /* já existe */ }
    }

    // Garante unicidade: username único POR TENANT
    try {
      await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key`;
      await sql`ALTER TABLE users ADD CONSTRAINT users_username_tenant_unique UNIQUE (username, tenant_id)`;
    } catch { /* já existe */ }

    console.log('✅ SaaS tables ready');
  } catch (err) {
    console.error('❌ SaaS init error:', err.message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getTenantBySlug(slug) {
  if (!sql) return null;
  const rows = await sql`SELECT * FROM tenants WHERE slug = ${slug || 'default'} LIMIT 1`;
  return rows[0] || null;
}

async function getTenantById(id) {
  if (!sql) return null;
  const rows = await sql`SELECT * FROM tenants WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

function isTenantActive(tenant) {
  if (!tenant) return false;
  if (['active', 'manual'].includes(tenant.subscription_status)) return true;
  if (tenant.subscription_status === 'trial') {
    return new Date(tenant.trial_ends_at) > new Date();
  }
  return false;
}

// ─── Middleware: verifica token JWT (versão SaaS com tenant_id) ───────────────
function authenticateTokenSaaS(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
    req.user      = user;
    req.tenant_id = user.tenant_id || 1;
    next();
  });
}

// ─── Middleware: verifica se assinatura está ativa ────────────────────────────
async function checkSubscription(req, res, next) {
  // Superadmin passa sempre
  if (req.user?.role === 'superadmin') return next();
  const tenant = await getTenantById(req.tenant_id);
  if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
  if (isTenantActive(tenant)) return next();

  const daysLeft = Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / 86400000);
  return res.status(402).json({
    error: 'subscription_expired',
    message: `Trial expirado há ${Math.abs(daysLeft)} dias. Assine para continuar.`,
    tenant_slug: tenant.slug,
    payment_url: `/pay?tenant=${tenant.slug}`
  });
}

// ─── Middleware: apenas superadmin ───────────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

// ─── PUBLIC: Teste de conexão Azure (antes do signup) ────────────────────────
router.post('/public/test-azure', async (req, res) => {
  const { org, project, pat } = req.body;
  if (!org || !project || !pat) return res.status(400).json({ error: 'org, project e pat são obrigatórios' });
  try {
    const url   = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems?$top=1&api-version=7.0`;
    const cred  = Buffer.from(`:${pat}`).toString('base64');
    const resp  = await axios.get(url, { headers: { Authorization: `Basic ${cred}` }, timeout: 10000 });
    res.json({ ok: true, count: resp.data.count });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.response?.data?.message || err.message });
  }
});

// ─── PUBLIC: Cadastro de novo tenant (wizard) ─────────────────────────────────
router.post('/public/signup', async (req, res) => {
  const { company_name, owner_name, owner_email, password, phone, azure_org, azure_project, azure_pat } = req.body;
  if (!company_name || !owner_email || !password) {
    return res.status(400).json({ error: 'company_name, owner_email e password são obrigatórios' });
  }
  if (!sql) return res.status(503).json({ error: 'Banco não disponível' });

  try {
    // Verifica se email já existe
    const existing = await sql`SELECT id FROM tenants WHERE owner_email = ${owner_email}`;
    if (existing.length > 0) return res.status(409).json({ error: 'E-mail já cadastrado' });

    // Gera slug único a partir do company_name
    let slug = company_name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 40);
    // Verifica unicidade do slug
    let slugCandidate = slug;
    let counter = 1;
    while (true) {
      const exists = await sql`SELECT id FROM tenants WHERE slug = ${slugCandidate}`;
      if (exists.length === 0) break;
      slugCandidate = `${slug}-${counter++}`;
    }

    // Busca plano padrão
    const plans = await sql`SELECT id, trial_days FROM saas_plans WHERE active = TRUE ORDER BY id LIMIT 1`;
    const plan  = plans[0];
    const trialDays = plan?.trial_days || 30;
    const trialEnds = new Date(Date.now() + trialDays * 86400000);

    // Criptografa PAT
    const patEnc = azure_pat ? encryptPAT(azure_pat) : null;

    // Cria tenant
    const tenantRows = await sql`
      INSERT INTO tenants (slug, company_name, owner_email, owner_name, phone, azure_org, azure_project, azure_pat_enc, plan_id, trial_ends_at, subscription_status)
      VALUES (${slugCandidate}, ${company_name}, ${owner_email}, ${owner_name || ''}, ${phone || ''}, ${azure_org || ''}, ${azure_project || ''}, ${patEnc}, ${plan?.id || null}, ${trialEnds.toISOString()}, 'trial')
      RETURNING id, slug
    `;
    const tenant = tenantRows[0];

    // Cria usuário admin do tenant
    const hashedPw = bcrypt.hashSync(password, 10);
    const username = owner_email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'admin';
    await sql`
      INSERT INTO users (username, email, password, role, tenant_id)
      VALUES (${username}, ${owner_email}, ${hashedPw}, 'admin', ${tenant.id})
      ON CONFLICT (username, tenant_id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password
    `;

    // Gera token JWT para login imediato
    const token = jwt.sign(
      { id: tenantRows[0].id, username, email: owner_email, role: 'admin', tenant_id: tenant.id, tenant_slug: tenant.slug },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      tenant_slug: tenant.slug,
      trial_ends_at: trialEnds.toISOString(),
      trial_days: trialDays,
      message: `Trial de ${trialDays} dias iniciado! Bom uso.`
    });
  } catch (err) {
    console.error('❌ Signup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUBLIC: Informações do tenant pelo slug (para tela de login) ─────────────
router.get('/public/tenant/:slug', async (req, res) => {
  const tenant = await getTenantBySlug(req.params.slug);
  if (!tenant) return res.status(404).json({ error: 'Empresa não encontrada' });
  const daysLeft = Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / 86400000));
  res.json({
    company_name: tenant.company_name,
    subscription_status: tenant.subscription_status,
    trial_days_left: tenant.subscription_status === 'trial' ? daysLeft : null,
    is_active: isTenantActive(tenant)
  });
});

// ─── AUTH: Login multi-tenant ────────────────────────────────────────────────
router.post('/auth/login/saas', async (req, res) => {
  const { username, password, tenant_slug } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username e password obrigatórios' });
  if (!sql) return res.status(503).json({ error: 'Banco não disponível' });

  const tenant = await getTenantBySlug(tenant_slug || 'default');
  if (!tenant) return res.status(404).json({ error: 'Empresa não encontrada' });

  const users = await sql`
    SELECT * FROM users WHERE (username = ${username} OR email = ${username}) AND tenant_id = ${tenant.id}
  `;
  if (users.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

  const user = users[0];
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  // Verifica assinatura (avisa mas não bloqueia no login)
  const active = isTenantActive(tenant);
  const daysLeft = Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / 86400000);

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role, tenant_id: tenant.id, tenant_slug: tenant.slug },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
    tenant: { id: tenant.id, slug: tenant.slug, company_name: tenant.company_name },
    subscription: {
      status: tenant.subscription_status,
      is_active: active,
      trial_days_left: tenant.subscription_status === 'trial' ? daysLeft : null
    }
  });
});

// ─── MERCADO PAGO: Criar/obter assinatura ─────────────────────────────────────
router.post('/billing/subscribe', authenticateTokenSaaS, async (req, res) => {
  if (!MP_ACCESS_TOKEN) return res.status(503).json({ error: 'Pagamento não configurado' });
  const tenant = await getTenantById(req.tenant_id);
  if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });

  const plan = tenant.plan_id ? (await sql`SELECT * FROM saas_plans WHERE id = ${tenant.plan_id}`)[0] : null;
  if (!plan?.mp_plan_id) return res.status(503).json({ error: 'Plano sem integração MP configurada. Contate o suporte.' });

  try {
    const backUrl = `${process.env.APP_URL || 'https://dsmetrics.online'}/subscription/callback`;
    const response = await axios.post('https://api.mercadopago.com/preapproval', {
      preapproval_plan_id: plan.mp_plan_id,
      reason: `${plan.name} — ${tenant.company_name}`,
      external_reference: `tenant_${tenant.id}`,
      payer_email: req.body.payer_email || tenant.owner_email,
      back_url: backUrl,
      status: 'pending'
    }, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }
    });

    res.json({ init_point: response.data.init_point, subscription_id: response.data.id });
  } catch (err) {
    console.error('❌ MP subscribe error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Erro ao criar assinatura', detail: err.response?.data?.message });
  }
});

// ─── MERCADO PAGO: Webhook ────────────────────────────────────────────────────
router.post('/webhooks/mercadopago', express.raw({ type: '*/*' }), async (req, res) => {
  res.sendStatus(200); // responde imediatamente (requerido pelo MP)
  if (!sql) return;

  try {
    const body = req.body ? JSON.parse(req.body.toString()) : {};
    const { type, data, action } = body;
    console.log(`🔔 MP Webhook: type=${type} action=${action} id=${data?.id}`);

    if (type === 'subscription_preapproval' && data?.id) {
      const subResp = await axios.get(`https://api.mercadopago.com/preapproval/${data.id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
      });
      const sub = subResp.data;
      const extRef = sub.external_reference || '';
      const tenantId = parseInt(extRef.replace('tenant_', '')) || null;
      if (!tenantId) return;

      const statusMap = { authorized: 'active', pending: 'trial', cancelled: 'cancelled', paused: 'expired' };
      const newStatus = statusMap[sub.status] || 'expired';

      await sql`UPDATE tenants SET subscription_status = ${newStatus}, mp_subscription_id = ${sub.id}, updated_at = NOW() WHERE id = ${tenantId}`;
      await sql`INSERT INTO mp_payment_events (tenant_id, mp_payment_id, event_type, payload) VALUES (${tenantId}, ${sub.id}, ${sub.status}, ${JSON.stringify(sub)})`;
      console.log(`✅ Tenant ${tenantId} status → ${newStatus}`);
    }

    if (type === 'payment' && data?.id) {
      const payResp = await axios.get(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
      });
      const pay = payResp.data;
      const tenantId = parseInt((pay.external_reference || '').replace('tenant_', '')) || null;
      if (tenantId && pay.status === 'approved') {
        await sql`UPDATE tenants SET subscription_status = 'active', updated_at = NOW() WHERE id = ${tenantId}`;
        await sql`INSERT INTO mp_payment_events (tenant_id, mp_payment_id, event_type, amount, payload) VALUES (${tenantId}, ${pay.id?.toString()}, 'approved', ${pay.transaction_amount}, ${JSON.stringify(pay)})`;
      }
    }
  } catch (err) {
    console.error('❌ MP Webhook error:', err.message);
  }
});

// ─── SUPERADMIN: Login ────────────────────────────────────────────────────────
router.post('/superadmin/login', (req, res) => {
  const { master_key } = req.body;
  if (!master_key || master_key !== MASTER_KEY) {
    return res.status(401).json({ error: 'Chave inválida' });
  }
  const token = jwt.sign({ role: 'superadmin', username: 'superadmin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ─── SUPERADMIN: Middleware ───────────────────────────────────────────────────
function superAdminAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user?.role !== 'superadmin') return res.status(403).json({ error: 'Acesso negado' });
    req.user = user;
    next();
  });
}

// ─── SUPERADMIN: Dashboard ────────────────────────────────────────────────────
router.get('/superadmin/tenants', superAdminAuth, async (req, res) => {
  const tenants = await sql`
    SELECT t.*, p.name AS plan_name, p.price_brl,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
      (SELECT MAX(sync_time) FROM sync_log sl WHERE sl.tenant_id = t.id) AS last_sync
    FROM tenants t
    LEFT JOIN saas_plans p ON p.id = t.plan_id
    ORDER BY t.created_at DESC
  `;
  const stats = {
    total: tenants.length,
    trial: tenants.filter(t => t.subscription_status === 'trial').length,
    active: tenants.filter(t => t.subscription_status === 'active').length,
    expired: tenants.filter(t => t.subscription_status === 'expired').length,
    manual: tenants.filter(t => t.subscription_status === 'manual').length,
    mrr: tenants.filter(t => t.subscription_status === 'active').reduce((s, t) => s + parseFloat(t.price_brl || 0), 0)
  };
  res.json({ tenants, stats });
});

router.get('/superadmin/tenant/:id', superAdminAuth, async (req, res) => {
  const tenant = await sql`
    SELECT t.*, p.name AS plan_name FROM tenants t
    LEFT JOIN saas_plans p ON p.id = t.plan_id WHERE t.id = ${req.params.id}
  `;
  const payments = await sql`SELECT * FROM mp_payment_events WHERE tenant_id = ${req.params.id} ORDER BY created_at DESC LIMIT 20`;
  const users    = await sql`SELECT id, username, email, role, created_at FROM users WHERE tenant_id = ${req.params.id}`;
  res.json({ tenant: tenant[0], payments, users });
});

// Atualiza status do tenant manualmente
router.patch('/superadmin/tenant/:id', superAdminAuth, async (req, res) => {
  const { subscription_status, trial_ends_at, notes } = req.body;
  const fields = {};
  if (subscription_status) fields.subscription_status = subscription_status;
  if (trial_ends_at)        fields.trial_ends_at = trial_ends_at;
  if (notes !== undefined)  fields.notes = notes;
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nenhum campo enviado' });

  await pool.query(
    `UPDATE tenants SET ${Object.keys(fields).map((k,i) => `${k}=$${i+1}`).join(',')}, updated_at=NOW() WHERE id=$${Object.keys(fields).length+1}`,
    [...Object.values(fields), req.params.id]
  );
  res.json({ success: true });
});

// Planos
router.get('/superadmin/plans', superAdminAuth, async (req, res) => {
  const plans = await sql`SELECT * FROM saas_plans ORDER BY id`;
  res.json(plans);
});

router.post('/superadmin/plans', superAdminAuth, async (req, res) => {
  const { name, price_brl, max_users, trial_days, mp_plan_id } = req.body;
  const row = await sql`
    INSERT INTO saas_plans (name, price_brl, max_users, trial_days, mp_plan_id)
    VALUES (${name}, ${price_brl}, ${max_users || 10}, ${trial_days || 30}, ${mp_plan_id || null})
    RETURNING *
  `;
  res.status(201).json(row[0]);
});

router.patch('/superadmin/plans/:id', superAdminAuth, async (req, res) => {
  const { name, price_brl, max_users, trial_days, mp_plan_id, active } = req.body;
  await pool.query(
    `UPDATE saas_plans SET name=COALESCE($1,name), price_brl=COALESCE($2,price_brl), max_users=COALESCE($3,max_users),
     trial_days=COALESCE($4,trial_days), mp_plan_id=COALESCE($5,mp_plan_id), active=COALESCE($6,active) WHERE id=$7`,
    [name, price_brl, max_users, trial_days, mp_plan_id, active, req.params.id]
  );
  res.json({ success: true });
});

// Criar plano no Mercado Pago
router.post('/superadmin/mp-create-plan', superAdminAuth, async (req, res) => {
  if (!MP_ACCESS_TOKEN) return res.status(503).json({ error: 'MP_ACCESS_TOKEN não configurado' });
  const { plan_id } = req.body;
  const plans = await sql`SELECT * FROM saas_plans WHERE id = ${plan_id}`;
  const plan = plans[0];
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

  try {
    const resp = await axios.post('https://api.mercadopago.com/preapproval_plan', {
      reason: plan.name,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: plan.price_brl, currency_id: 'BRL' },
      back_url: process.env.APP_URL || 'https://dsmetrics.online',
      status: 'active'
    }, { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });

    await sql`UPDATE saas_plans SET mp_plan_id = ${resp.data.id} WHERE id = ${plan_id}`;
    res.json({ mp_plan_id: resp.data.id, plan_name: plan.name });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// Receita mensal
router.get('/superadmin/revenue', superAdminAuth, async (req, res) => {
  const events = await sql`
    SELECT DATE_TRUNC('month', created_at) AS month, SUM(amount) AS total, COUNT(*) AS count
    FROM mp_payment_events WHERE event_type = 'approved'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  `;
  res.json(events);
});

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = { router, init, initSaasTables, authenticateTokenSaaS, checkSubscription, getTenantById, getTenantBySlug, isTenantActive, encryptPAT, decryptPAT };
