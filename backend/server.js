// backend/server.js - PostgreSQL version for VPS
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const schedule = require('node-schedule');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const ical = require('node-ical');
require('dotenv').config();

// Módulo SaaS (tenants, planos, pagamento, super-admin)
const saas = require('./saas');

// Extração de campos de work items (testável isoladamente, ver test_field_mapping.js)
const { extractTeam, extractWorkItemFields, extractAvatarCandidates } = require('./fieldExtraction');

// Database driver: PostgreSQL (pg) with connection pooling
const { Pool } = require('pg');

// JWT Secret (warn but don't crash — CORS must always work)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('⚠️ WARNING: JWT_SECRET not set. Auth endpoints will fail, but CORS/health will still work.');
}

const app = express();

// ═══════════════════════════════════════════════════════════════════════════════
// CORS — MUST be the very first middleware. Handles preflight (OPTIONS) and
// sets headers on EVERY response so the browser never blocks requests.
// This runs before any other middleware, route handler, or error.
// ═══════════════════════════════════════════════════════════════════════════════
// Origens base (localhost para dev)
const ALLOWED_ORIGINS_BASE = [
  'http://localhost:5173',
  'http://localhost:3000',
];
// Origens extras via variável de ambiente (vírgula separada)
// Ex: ALLOWED_ORIGIN=https://meucliente.com,http://200.10.20.30
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [...ALLOWED_ORIGINS_BASE, ...EXTRA_ORIGINS];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Preflight: return 204 immediately — never let it reach other middleware
app.options('*', (req, res) => {
  setCorsHeaders(req, res);
  res.status(204).end();
});

// All other requests: set CORS headers before anything else
app.use((req, res, next) => {
  setCorsHeaders(req, res);
  next();
});

app.use(express.json());

// PostgreSQL setup for VPS database
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
}

let pool = null;
let sql = null;

if (DATABASE_URL) {
  const isLocalDb = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
    max: isLocalDb ? 25 : 3,
    min: isLocalDb ? 2 : 0,
    idleTimeoutMillis: isLocalDb ? 30000 : 10000,
    connectionTimeoutMillis: isLocalDb ? 30000 : 8000,
    allowExitOnIdle: !isLocalDb,
  });

  // Tagged template literal function for SQL queries
  // Usage: await sql`SELECT * FROM users WHERE id = ${id}`
  sql = async (strings, ...values) => {
    const text = strings.reduce((prev, curr, i) => {
      return i === 0 ? curr : prev + '$' + i + curr;
    });
    const result = await pool.query(text, values);
    return result.rows;
  };

  console.log('✅ Database connection pool configured (serverless-optimized)');
  // Injeta pool/sql no módulo SaaS
  saas.init(pool, sql);
} else {
  console.log('⚠️ No DATABASE_URL — database features disabled');
}

// Helper functions for PostgreSQL queries
const dbAllAsync = async (query, params = []) => {
  try {
    if (!sql) throw new Error('Database not configured');
    const result = await sql(query, params);
    return result;
  } catch (err) {
    console.error('❌ Error in dbAllAsync:', err.message);
    throw err;
  }
};

const dbRunAsync = async (query, params = []) => {
  try {
    if (!sql) throw new Error('Database not configured');
    const result = await sql(query, params);
    return { changes: result.length || 0 };
  } catch (err) {
    console.error('❌ Error in dbRunAsync:', err.message);
    throw err;
  }
};

const dbGetAsync = async (query, params = []) => {
  try {
    if (!sql) throw new Error('Database not configured');
    const result = await sql(query, params);
    return result[0] || null;
  } catch (err) {
    console.error('❌ Error in dbGetAsync:', err.message);
    throw err;
  }
};

// Calculate difference in days
function calculateDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function calculateCycleTime(firstActivationDate, closedDate) {
  return calculateDaysBetween(firstActivationDate, closedDate);
}

function calculateLeadTime(createdDate, closedDate) {
  return calculateDaysBetween(createdDate, closedDate);
}

function calculateAge(createdDate) {
  if (!createdDate) return 0;
  const created = new Date(createdDate);
  const now = new Date();
  return Math.round((now - created) / (1000 * 60 * 60 * 24));
}

// Initialize database - creates tables if they don't exist (SAFE for production)
const initDatabase = async () => {
  if (!sql) {
    console.log('⚠️ Database not connected - skipping initialization');
    return;
  }

  try {
    // Create work_items if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS work_items (
        id SERIAL PRIMARY KEY,
        work_item_id INTEGER UNIQUE,
        title TEXT,
        state TEXT,
        type TEXT,
        assigned_to TEXT,
        team TEXT,
        area_path TEXT,
        iteration_path TEXT,
        created_date TEXT,
        changed_date TEXT,
        closed_date TEXT,
        first_activation_date TEXT,
        story_points REAL,
        tags TEXT,
        code_review_level1 TEXT,
        code_review_level2 TEXT,
        code_review_level1_raw TEXT,
        code_review_level2_raw TEXT,
        tipo_cliente TEXT,
        url TEXT,
        synced_at TEXT,
        priority TEXT,
        custom_type TEXT,
        root_cause_status TEXT,
        squad TEXT,
        area TEXT,
        reincidencia TEXT,
        performance_days TEXT,
        qa TEXT,
        complexity TEXT,
        causa_raiz TEXT,
        root_cause_legacy TEXT,
        created_by TEXT,
        po TEXT,
        ready_date TEXT,
        done_date TEXT,
        root_cause_task TEXT,
        root_cause_team TEXT,
        root_cause_version TEXT,
        dev TEXT,
        platform TEXT,
        application TEXT,
        branch_base TEXT,
        delivered_version TEXT,
        base_version TEXT,
        identificacao TEXT,
        falha_do_processo TEXT
      )
    `;
    console.log('✅ work_items table ready');

    // Garante que colunas adicionadas após criação da tabela existam (idempotente)
    const columnsToEnsure = [
      'ready_date TEXT', 'done_date TEXT',
      'root_cause_task TEXT', 'root_cause_team TEXT', 'root_cause_version TEXT',
      'dev TEXT', 'platform TEXT', 'application TEXT', 'branch_base TEXT',
      'delivered_version TEXT', 'base_version TEXT',
      'identificacao TEXT', 'falha_do_processo TEXT',
      'first_activation_date TEXT',
      'original_estimate REAL', 'remaining_work REAL', 'completed_work REAL',
      'parent_id INTEGER',
      'categoria TEXT',
      'bloqueio BOOLEAN DEFAULT FALSE'
    ];
    for (const colDef of columnsToEnsure) {
      const [colName] = colDef.split(' ');
      try {
        await pool.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS ${colDef}`);
      } catch (e) {
        // coluna já existe ou db não suporta IF NOT EXISTS — ignora
      }
    }
    console.log('✅ Colunas extras verificadas/adicionadas');

    // Create pull_requests if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS pull_requests (
        id SERIAL PRIMARY KEY,
        pull_request_id INTEGER UNIQUE,
        title TEXT,
        description TEXT,
        status TEXT,
        created_by TEXT,
        created_date TEXT,
        closed_date TEXT,
        source_ref_name TEXT,
        target_ref_name TEXT,
        repository_id TEXT,
        repository_name TEXT,
        labels TEXT,
        reviewers TEXT,
        votes TEXT,
        has_valida_cr_label BOOLEAN,
        url TEXT,
        synced_at TEXT
      )
    `;
    console.log('✅ pull_requests table ready');

    // Create commits if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS commits (
        id SERIAL PRIMARY KEY,
        commit_id TEXT UNIQUE,
        author TEXT,
        author_email TEXT,
        committer TEXT,
        committer_email TEXT,
        commit_date TEXT,
        message TEXT,
        repository_id TEXT,
        repository_name TEXT,
        pull_request_id INTEGER,
        synced_at TEXT
      )
    `;
    console.log('✅ commits table ready');

    // Create sync_log if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS sync_log (
        id SERIAL PRIMARY KEY,
        sync_time TEXT,
        items_count INTEGER,
        pull_requests_count INTEGER,
        commits_count INTEGER,
        status TEXT,
        error_message TEXT
      )
    `;
    console.log('✅ sync_log table ready');

    // Create users table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        tab_permissions TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    // Adiciona coluna tab_permissions se não existir (migração para bancos existentes)
    try {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tab_permissions TEXT DEFAULT NULL`;
    } catch (e) { /* coluna já existe */ }
    console.log('✅ users table ready');

    // Tabela de configurações globais (chave-valor)
    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ app_settings table ready');

    // Tabela para armazenar avatars dos membros (extraídos do Azure DevOps)
    await sql`
      CREATE TABLE IF NOT EXISTS team_member_avatars (
        name TEXT PRIMARY KEY,
        image_url TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ team_member_avatars table ready');

    // DevTracker: desenvolvedores do time
    await sql`
      CREATE TABLE IF NOT EXISTS devtracker_developers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'Dev Pleno',
        email TEXT,
        category TEXT NOT NULL,
        client TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ devtracker_developers table ready');

    // DevTracker: projetos/demandas
    await sql`
      CREATE TABLE IF NOT EXISTS devtracker_projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        client TEXT,
        priority TEXT DEFAULT 'Média',
        status TEXT DEFAULT 'Em andamento',
        start_date DATE,
        deadline DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ devtracker_projects table ready');

    // DevTracker: alocações dev <-> projeto
    await sql`
      CREATE TABLE IF NOT EXISTS devtracker_allocations (
        id SERIAL PRIMARY KEY,
        developer_id INTEGER REFERENCES devtracker_developers(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES devtracker_projects(id) ON DELETE CASCADE,
        allocated_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(developer_id, project_id)
      )
    `;
    console.log('✅ devtracker_allocations table ready');

    // DevTracker: tags customizadas para devs e features
    await sql`
      CREATE TABLE IF NOT EXISTS devtracker_tags (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (entity_type, entity_id, tag)
      )
    `;
    console.log('✅ devtracker_tags table ready');

    // Ritos & Cerimônias: configuração de ritos por time
    await sql`
      CREATE TABLE IF NOT EXISTS ceremony_config (
        id SERIAL PRIMARY KEY,
        team TEXT NOT NULL,
        ritual_type TEXT NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'weekly',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(team, ritual_type)
      )
    `;
    console.log('✅ ceremony_config table ready');

    // Ritos & Cerimônias: ocorrências registradas
    await sql`
      CREATE TABLE IF NOT EXISTS ceremony_records (
        id SERIAL PRIMARY KEY,
        team TEXT NOT NULL,
        ritual_type TEXT NOT NULL,
        scheduled_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        notes TEXT,
        imported_from TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ ceremony_records table ready');

    // Seed cerimônias padrão por time (roda somente se ceremony_config estiver vazio)
    const cfgCount = await sql`SELECT COUNT(*) AS cnt FROM ceremony_config`;
    if (parseInt(cfgCount[0].cnt) === 0) {
      const teams = await sql`SELECT DISTINCT team FROM work_items WHERE team IS NOT NULL AND team <> '' ORDER BY team`;
      const defaults = [
        { ritual_type: 'Daily', frequency: 'daily' },
        { ritual_type: 'Refinamento', frequency: 'weekly' },
        { ritual_type: 'Review', frequency: 'weekly' },
        { ritual_type: 'Retrospectiva', frequency: 'biweekly' },
      ];
      for (const t of teams) {
        const rituals = [...defaults];
        if (t.team === 'Franquia') rituals.push({ ritual_type: 'Planning', frequency: 'biweekly' });
        for (const r of rituals) {
          await sql`
            INSERT INTO ceremony_config (team, ritual_type, frequency, active)
            VALUES (${t.team}, ${r.ritual_type}, ${r.frequency}, true)
            ON CONFLICT (team, ritual_type) DO NOTHING
          `;
        }
      }
      console.log(`✅ Seeded default ceremonies for ${teams.length} teams`);
    }

    // Criar usuário admin padrão se não existir
    const adminExists = await sql`SELECT id FROM users WHERE username = 'admin'`;
    if (adminExists.length === 0) {
      const defaultPw = process.env.ADMIN_DEFAULT_PASSWORD || 'Pwk8q12v@';
      const hashedPassword = bcrypt.hashSync(defaultPw, 10);
      await sql`INSERT INTO users (username, email, password, role) VALUES ('admin', 'admin@datasystem.com', ${hashedPassword}, 'admin')`;
      console.log('✅ Default admin user created');
    }

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
  }
};

// Initialize database on startup
initDatabase().then(() => {
  // Inicializa tabelas SaaS (tenants, planos, mp_events) e migra tenant_id
  // pool/sql já injetados no bloco acima via saas.init(pool, sqlFn)
  return saas.initSaasTables();
});

// Monta rotas SaaS em /api
app.use('/api', saas.router);

// ─── Carrega mapeamentos de campos customizados do banco (por tenant) ─────────
const _fieldMappingsCache = new Map(); // tenantId -> { value, cachedAt }

async function loadFieldMappings(tenantId = 1) {
  // Cache por 5 minutos para nao bater no banco a cada item
  const cached = _fieldMappingsCache.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < 300000) {
    return cached.value;
  }
  try {
    if (!sql) return {};
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'field_mappings' AND tenant_id = ${tenantId}`;
    if (rows[0]?.value) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      _fieldMappingsCache.set(tenantId, { value: parsed, cachedAt: Date.now() });
      return parsed;
    }
  } catch {}
  return {};
}

// Limpa cache quando campo e salvo
function invalidateFieldMappingsCache(tenantId = 1) { _fieldMappingsCache.delete(tenantId); }

// Azure DevOps configuration
const AZURE_CONFIG = {
  organization: (process.env.AZURE_ORG || 'your-organization').replace(/[\r\n]/g, '').trim(),
  project: (process.env.AZURE_PROJECT || 'your-project').replace(/[\r\n]/g, '').trim(),
  pat: (process.env.AZURE_PAT || 'your-token').replace(/[\r\n]/g, '').trim()
};

const isConfigured = () => {
  return AZURE_CONFIG.organization !== 'your-organization' && 
         AZURE_CONFIG.project !== 'your-project' && 
         AZURE_CONFIG.pat !== 'your-token' &&
         AZURE_CONFIG.pat !== '';
};

console.log('\n📋 Azure DevOps Configuration:');
console.log('   Organization:', AZURE_CONFIG.organization);
console.log('   Project:', AZURE_CONFIG.project);
console.log('   PAT:', AZURE_CONFIG.pat ? '✅ Configured' : '❌ Missing');
console.log('   Status:', isConfigured() ? '✅ Ready' : '⚠️ Not configured\n');

const getAuthHeader = () => {
  const credentials = Buffer.from(`:${AZURE_CONFIG.pat}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
};

// ─── Config Azure DevOps por tenant ────────────────────────────────────────────
// Tenant 1 ("default") usa AZURE_CONFIG (env vars) se ainda nao tiver config
// propria salva em tenants.azure_org/azure_project/azure_pat_enc. Demais tenants
// so funcionam se tiverem configurado o proprio Azure DevOps (via signup ou
// PUT /api/admin/azure-settings).
async function getAzureConfigForTenant(tenantId) {
  const tenant = await saas.getTenantById(tenantId);
  if (tenant?.azure_org && tenant?.azure_project && tenant?.azure_pat_enc) {
    return {
      organization: tenant.azure_org,
      project: tenant.azure_project,
      pat: saas.decryptPAT(tenant.azure_pat_enc),
    };
  }
  if (tenantId === 1 && isConfigured()) return AZURE_CONFIG;
  return null;
}

function isAzureConfigValid(cfg) {
  return !!(cfg && cfg.organization && cfg.project && cfg.pat);
}

function getAzureAuthHeaderFor(pat) {
  const credentials = Buffer.from(`:${pat}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
}

// Sync Data function — sincroniza os work items de UM tenant especifico
async function syncData(tenantId = 1) {
  const cfg = await getAzureConfigForTenant(tenantId);
  if (!isAzureConfigValid(cfg)) {
    console.log(`⚠️ Tenant ${tenantId}: Azure DevOps not configured - skipping sync`);
    return { status: 'skipped', message: 'Not configured' };
  }
  if (!sql) {
    console.log('⚠️ Database not configured - skipping sync');
    return { status: 'skipped', message: 'Database not configured' };
  }

  const startTime = new Date();
  console.log(`🔄 [tenant ${tenantId}] Starting sync at ${startTime.toISOString()}`);

  try {
    const baseUrl = `https://dev.azure.com/${cfg.organization}/${cfg.project}`;
    const authHeader = getAzureAuthHeaderFor(cfg.pat);

    // Fetch Work Items usando WIQL
    const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=7.0`;
    const wiqlQuery = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${cfg.project}' AND [System.ChangedDate] >= @Today - 180 ORDER BY [System.ChangedDate] DESC`
    };

    const wiqlResponse = await axios.post(wiqlUrl, wiqlQuery, { headers: authHeader });
    const workItemIds = wiqlResponse.data.workItems?.map(wi => wi.id) || [];

    console.log(`   Found ${workItemIds.length} work items`);

    if (workItemIds.length > 0) {
      // Buscar em batches de 200
      const batchSize = 200;
      let allWorkItems = [];

      for (let i = 0; i < workItemIds.length; i += batchSize) {
        const batch = workItemIds.slice(i, i + batchSize);
        const idsParam = batch.join(',');
        const detailsUrl = `${baseUrl}/_apis/wit/workitems?ids=${idsParam}&$expand=all&api-version=7.0`;

        const detailsResponse = await axios.get(detailsUrl, { headers: authHeader });
        allWorkItems = allWorkItems.concat(detailsResponse.data.value || []);
      }

      // Salvar no banco
      // Carrega mapeamentos de campos customizados (configurados pelo admin) uma vez para todo o sync
      const fm = await loadFieldMappings(tenantId);

      // Coletar avatars dos membros durante a sync
      const memberAvatars = new Map();
      for (const item of allWorkItems) {
        const fields = item.fields || {};
        for (const { displayName, imageUrl } of extractAvatarCandidates(fields, fm)) {
          memberAvatars.set(displayName, imageUrl);
        }
      }

      // Salvar avatars no banco
      for (const [name, imageUrl] of memberAvatars) {
        try {
          await sql`
            INSERT INTO team_member_avatars (name, image_url, updated_at, tenant_id)
            VALUES (${name}, ${imageUrl}, CURRENT_TIMESTAMP, ${tenantId})
            ON CONFLICT (name, tenant_id) DO UPDATE SET
              image_url = EXCLUDED.image_url,
              updated_at = CURRENT_TIMESTAMP
          `;
        } catch (e) { /* ignore individual errors */ }
      }
      console.log(`   Saved ${memberAvatars.size} member avatars`);

      for (const item of allWorkItems) {
        const fields = item.fields || {};
        const workItemId = item.id;
        const url = item._links?.html?.href || '';

        const {
          title, state, type, assignedTo, areaPath, team, iterationPath, createdDate, changedDate, closedDate,
          tags, priority, activatedDate, storyPoints, tipoCliente,
          codeReviewLevel1, codeReviewLevel2, customType, rootCauseStatus, squad, area, complexity,
          reincidencia, performanceDays, qa, causaRaiz, rootCauseLegacy, createdBy, po, readyDate, doneDate,
          rootCauseTask, rootCauseTeam, rootCauseVersion, dev, platform, application, branchBase,
          deliveredVersion, baseVersion, identificacao, falhaDoProcesso, impedimento, bloqueio, categoria,
        } = extractWorkItemFields(fields, fm);

        await sql`
          INSERT INTO work_items (work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
            created_date, changed_date, closed_date, story_points, tags, tipo_cliente, priority, url, first_activation_date,
            code_review_level1, code_review_level2, custom_type, root_cause_status, squad, area, complexity,
            reincidencia, performance_days, qa, causa_raiz, root_cause_legacy, created_by, po, ready_date, done_date,
            root_cause_task, root_cause_team, root_cause_version, dev, platform, application, branch_base, delivered_version, base_version,
            identificacao, falha_do_processo, impedimento, bloqueio, categoria, synced_at, tenant_id)
          VALUES (${workItemId}, ${title}, ${state}, ${type}, ${assignedTo}, ${team}, ${areaPath}, ${iterationPath},
            ${createdDate}, ${changedDate}, ${closedDate}, ${storyPoints}, ${tags}, ${tipoCliente}, ${priority}, ${url}, ${activatedDate || null},
            ${codeReviewLevel1}, ${codeReviewLevel2}, ${customType}, ${rootCauseStatus}, ${squad}, ${area}, ${complexity},
            ${reincidencia}, ${performanceDays}, ${qa}, ${causaRaiz}, ${rootCauseLegacy}, ${createdBy}, ${po}, ${readyDate}, ${doneDate},
            ${rootCauseTask}, ${rootCauseTeam}, ${rootCauseVersion}, ${dev}, ${platform}, ${application}, ${branchBase}, ${deliveredVersion}, ${baseVersion},
            ${identificacao}, ${falhaDoProcesso}, ${impedimento}, ${bloqueio}, ${categoria}, ${new Date().toISOString()}, ${tenantId})
          ON CONFLICT (work_item_id, tenant_id) DO UPDATE SET
            title = EXCLUDED.title, state = EXCLUDED.state, type = EXCLUDED.type, assigned_to = EXCLUDED.assigned_to,
            team = EXCLUDED.team, area_path = EXCLUDED.area_path, iteration_path = EXCLUDED.iteration_path,
            created_date = EXCLUDED.created_date, changed_date = EXCLUDED.changed_date, closed_date = EXCLUDED.closed_date,
            story_points = EXCLUDED.story_points, tags = EXCLUDED.tags, tipo_cliente = EXCLUDED.tipo_cliente,
            priority = EXCLUDED.priority, url = EXCLUDED.url,
            first_activation_date = COALESCE(EXCLUDED.first_activation_date, work_items.first_activation_date),
            code_review_level1 = EXCLUDED.code_review_level1,
            code_review_level2 = EXCLUDED.code_review_level2,
            custom_type = EXCLUDED.custom_type,
            root_cause_status = EXCLUDED.root_cause_status,
            squad = EXCLUDED.squad,
            area = EXCLUDED.area,
            complexity = EXCLUDED.complexity,
            reincidencia = EXCLUDED.reincidencia,
            performance_days = EXCLUDED.performance_days,
            qa = EXCLUDED.qa,
            causa_raiz = EXCLUDED.causa_raiz,
            root_cause_legacy = EXCLUDED.root_cause_legacy,
            created_by = EXCLUDED.created_by,
            po = EXCLUDED.po,
            ready_date = EXCLUDED.ready_date,
            done_date = EXCLUDED.done_date,
            root_cause_task = EXCLUDED.root_cause_task,
            root_cause_team = EXCLUDED.root_cause_team,
            root_cause_version = EXCLUDED.root_cause_version,
            dev = EXCLUDED.dev,
            platform = EXCLUDED.platform,
            application = EXCLUDED.application,
            branch_base = EXCLUDED.branch_base,
            delivered_version = EXCLUDED.delivered_version,
            base_version = EXCLUDED.base_version,
            identificacao = EXCLUDED.identificacao,
            falha_do_processo = EXCLUDED.falha_do_processo,
            impedimento = EXCLUDED.impedimento,
            bloqueio    = EXCLUDED.bloqueio,
            categoria = EXCLUDED.categoria,
            synced_at = EXCLUDED.synced_at
        `;
      }

      console.log(`   ✅ Saved ${allWorkItems.length} work items to database`);
    }

    // Log sync
    await sql`
      INSERT INTO sync_log (sync_time, items_count, status, tenant_id)
      VALUES (${new Date().toISOString()}, ${workItemIds.length}, 'success', ${tenantId})
    `;

    const endTime = new Date();
    console.log(`✅ [tenant ${tenantId}] Sync completed in ${(endTime - startTime) / 1000}s`);

    return { status: 'success', itemsCount: workItemIds.length };
  } catch (error) {
    console.error(`❌ [tenant ${tenantId}] Sync error:`, error.message);

    if (sql) {
      await sql`
        INSERT INTO sync_log (sync_time, items_count, status, error_message, tenant_id)
        VALUES (${new Date().toISOString()}, 0, 'error', ${error.message}, ${tenantId})
      `;
    }

    return { status: 'error', message: error.message };
  }
}

// ===========================================
// PULL REQUESTS SYNC
// ===========================================

async function syncPullRequests(tenantId = 1) {
  const cfg = await getAzureConfigForTenant(tenantId);
  if (!isAzureConfigValid(cfg)) {
    console.log(`⚠️ Tenant ${tenantId}: Azure DevOps not configured - skipping PR sync`);
    return { status: 'skipped', message: 'Not configured' };
  }
  if (!sql) {
    console.log('⚠️ Database not configured - skipping PR sync');
    return { status: 'skipped', message: 'Database not configured' };
  }

  const startTime = new Date();
  console.log(`🔄 [tenant ${tenantId}] Starting Pull Requests sync at ${startTime.toISOString()}`);

  try {
    const baseUrl = `https://dev.azure.com/${cfg.organization}/${cfg.project}`;
    const authHeader = getAzureAuthHeaderFor(cfg.pat);

    // First get all repositories in the project
    const reposUrl = `${baseUrl}/_apis/git/repositories?api-version=7.0`;
    const reposResponse = await axios.get(reposUrl, { headers: authHeader });
    const repositories = reposResponse.data.value || [];

    console.log(`   Found ${repositories.length} repositories`);

    let totalPRs = 0;

    for (const repo of repositories) {
      // Fetch PRs for each repo (all statuses: active, completed, abandoned)
      for (const status of ['active', 'completed', 'abandoned']) {
        let skip = 0;
        const top = 100;
        let hasMore = true;

        while (hasMore) {
          const prUrl = `${baseUrl}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=${status}&$top=${top}&$skip=${skip}&api-version=7.0`;

          let prResponse;
          try {
            prResponse = await axios.get(prUrl, { headers: authHeader });
          } catch (err) {
            console.log(`   ⚠️ Error fetching ${status} PRs for repo ${repo.name}: ${err.message}`);
            break;
          }

          const pullRequests = prResponse.data.value || [];

          if (pullRequests.length === 0) {
            hasMore = false;
            break;
          }

          // Only get PRs from last 180 days for completed/abandoned
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - 180);

          for (const pr of pullRequests) {
            const createdDate = pr.creationDate || '';

            // Skip old completed/abandoned PRs
            if (status !== 'active' && createdDate && new Date(createdDate) < cutoffDate) {
              hasMore = false;
              break;
            }

            const closedDate = pr.closedDate || '';
            const createdBy = pr.createdBy?.displayName || '';
            const sourceRef = pr.sourceRefName || '';
            const targetRef = pr.targetRefName || '';
            const labels = (pr.labels || []).map(l => l.name).join(',');
            const reviewers = JSON.stringify((pr.reviewers || []).map(r => ({
              name: r.displayName,
              vote: r.vote,
              isRequired: r.isRequired || false
            })));
            const votes = JSON.stringify((pr.reviewers || []).map(r => ({
              name: r.displayName,
              vote: r.vote
            })));
            const hasValidaCR = (pr.labels || []).some(l => l.name?.toLowerCase().includes('valida') && l.name?.toLowerCase().includes('cr'));
            const url = pr._links?.web?.href || `${baseUrl}/_git/${repo.name}/pullrequest/${pr.pullRequestId}`;

            await sql`
              INSERT INTO pull_requests (pull_request_id, title, description, status, created_by, created_date, closed_date,
                source_ref_name, target_ref_name, repository_id, repository_name, labels, reviewers, votes,
                has_valida_cr_label, url, synced_at, tenant_id)
              VALUES (${pr.pullRequestId}, ${pr.title || ''}, ${(pr.description || '').substring(0, 500)}, ${status},
                ${createdBy}, ${createdDate}, ${closedDate}, ${sourceRef}, ${targetRef},
                ${repo.id}, ${repo.name}, ${labels}, ${reviewers}, ${votes},
                ${hasValidaCR}, ${url}, ${new Date().toISOString()}, ${tenantId})
              ON CONFLICT (pull_request_id, tenant_id) DO UPDATE SET
                title = EXCLUDED.title, description = EXCLUDED.description, status = EXCLUDED.status,
                created_by = EXCLUDED.created_by, closed_date = EXCLUDED.closed_date,
                labels = EXCLUDED.labels, reviewers = EXCLUDED.reviewers, votes = EXCLUDED.votes,
                has_valida_cr_label = EXCLUDED.has_valida_cr_label, synced_at = EXCLUDED.synced_at
            `;
            totalPRs++;
          }

          skip += top;
          if (pullRequests.length < top) hasMore = false;
        }
      }
    }

    console.log(`   ✅ Synced ${totalPRs} pull requests`);

    const endTime = new Date();
    console.log(`✅ [tenant ${tenantId}] PR sync completed in ${(endTime - startTime) / 1000}s`);

    return { status: 'success', pullRequestsCount: totalPRs };
  } catch (error) {
    console.error(`❌ [tenant ${tenantId}] PR Sync error:`, error.message);
    return { status: 'error', message: error.message };
  }
}

// Roda work items + PRs para UM tenant (usado no gatilho manual "Sincronizar" do admin)
async function syncDataForTenant(tenantId) {
  const [wiResult, prResult] = await Promise.all([syncData(tenantId), syncPullRequests(tenantId)]);
  return { workItems: wiResult, pullRequests: prResult };
}

// Roda a sincronização de TODOS os tenants com Azure DevOps configurado, um de cada
// vez (evita sobrecarregar a VPS/API do Azure com chamadas em paralelo). Usado pelo
// job agendado a cada 30 min.
async function syncAllTenants() {
  if (!sql) return;
  try {
    const tenants = await sql`SELECT id FROM tenants ORDER BY id`;
    for (const t of tenants) {
      const cfg = await getAzureConfigForTenant(t.id);
      if (!isAzureConfigValid(cfg)) continue; // tenant sem Azure DevOps configurado ainda
      await syncData(t.id).catch(e => console.error(`❌ [tenant ${t.id}] Scheduled sync error (non-fatal):`, e.message));
      await syncPullRequests(t.id).catch(e => console.error(`❌ [tenant ${t.id}] Scheduled PR sync error (non-fatal):`, e.message));
    }
  } catch (e) {
    console.error('❌ syncAllTenants error:', e.message);
  }
}

// ===========================================
// AUTHENTICATION ENDPOINTS
// ===========================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    req.user = user;
    // tenantId usado por toda query de dados de negocio para isolar clientes
    req.tenantId = user.tenant_id || 1;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Requer permissão de administrador.' });
  }
  next();
};

// Debug endpoint para verificar tabela users (requer admin)
app.get('/api/debug/users-schema', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `;
    const users = await sql`SELECT id, username, email, role, password IS NOT NULL as has_password FROM users WHERE tenant_id = ${req.tenantId}`;
    res.json({ columns, users });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Endpoint para forçar inicialização do banco (requer admin)
app.post('/api/init-db', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Forcing database initialization...');
    await initDatabase();
    res.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint para verificar configuração do Azure (requer admin)
app.get('/api/debug/azure-config', authenticateToken, requireAdmin, async (req, res) => {
  const cfg = await getAzureConfigForTenant(req.tenantId);
  res.json({
    organization: cfg?.organization || '',
    project: cfg?.project || '',
    patConfigured: !!cfg?.pat && cfg.pat.length > 10,
    patLength: cfg?.pat?.length || 0,
    isConfigured: isAzureConfigValid(cfg)
  });
});

// ─── Catálogo de campos do Azure DevOps (metadados do processo, por tenant) ───
const _azureFieldsCache = new Map(); // tenantId -> { fields, cachedAt }
const AZURE_FIELDS_TTL = 30 * 60 * 1000; // 30 min — catálogo muda raramente

app.get('/api/admin/azure-fields', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const cfg = await getAzureConfigForTenant(req.tenantId);
    if (!isAzureConfigValid(cfg)) {
      return res.status(400).json({ error: 'Azure DevOps não configurado' });
    }
    const forceRefresh = req.query.refresh === '1';
    const cached = _azureFieldsCache.get(req.tenantId);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < AZURE_FIELDS_TTL) {
      return res.json({ fields: cached.fields, cachedAt: cached.cachedAt, fromCache: true });
    }

    const url = `https://dev.azure.com/${cfg.organization}/${cfg.project}/_apis/wit/fields?api-version=7.1`;
    const response = await axios.get(url, { headers: getAzureAuthHeaderFor(cfg.pat), timeout: 15000 });
    const fields = (response.data.value || []).map(f => ({
      name: f.name,
      referenceName: f.referenceName,
      type: f.type,
      isIdentity: !!f.isIdentity,
      isPicklist: !!f.isPicklist,
    })).sort((a, b) => a.referenceName.localeCompare(b.referenceName));

    const cachedAt = Date.now();
    _azureFieldsCache.set(req.tenantId, { fields, cachedAt });
    res.json({ fields, cachedAt, fromCache: false });
  } catch (error) {
    console.error('❌ Error fetching Azure DevOps fields catalog:', error.response?.data || error.message);
    res.status(502).json({ error: 'Erro ao buscar catálogo de campos do Azure DevOps', detail: error.message });
  }
});

// ─── Preview ao vivo de um campo específico (testa antes de salvar mapeamento) ─
app.get('/api/admin/field-preview', authenticateToken, requireAdmin, async (req, res) => {
  const { field } = req.query;
  if (!field) return res.status(400).json({ error: 'Parâmetro "field" é obrigatório' });
  const cfg = await getAzureConfigForTenant(req.tenantId);
  if (!isAzureConfigValid(cfg)) return res.status(400).json({ error: 'Azure DevOps não configurado' });
  try {
    const baseUrl = `https://dev.azure.com/${cfg.organization}/${cfg.project}`;
    const wiqlQuery = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${cfg.project}' AND [${field}] <> '' ORDER BY [System.ChangedDate] DESC`
    };
    const wiqlResponse = await axios.post(`${baseUrl}/_apis/wit/wiql?api-version=7.0`, wiqlQuery, { headers: getAzureAuthHeaderFor(cfg.pat), timeout: 15000 });
    const ids = (wiqlResponse.data.workItems || []).slice(0, 3).map(w => w.id);
    if (ids.length === 0) return res.json({ field, samples: [], hasData: false });

    const detailsUrl = `${baseUrl}/_apis/wit/workitems?ids=${ids.join(',')}&fields=${encodeURIComponent(field)}&api-version=7.0`;
    const detailsResponse = await axios.get(detailsUrl, { headers: getAzureAuthHeaderFor(cfg.pat), timeout: 15000 });
    const samples = (detailsResponse.data.value || []).map(item => {
      const raw = item.fields?.[field];
      const display = raw?.displayName || (typeof raw === 'object' ? JSON.stringify(raw) : raw);
      return { workItemId: item.id, value: display ?? null };
    });
    res.json({ field, samples, hasData: samples.some(s => s.value != null) });
  } catch (error) {
    // WIQL com "<> ''" pode falhar dependendo do tipo do campo (numerico, data, picklist) —
    // tratamos como "sem dado encontrado", nao como erro de rede, pra nao travar a UI.
    res.json({ field, samples: [], hasData: false, error: 'Campo não encontrado ou tipo incompatível com a busca' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    // Login por e-mail (unico em todo o banco) — username sozinho nao identifica
    // o tenant certo quando ha mais de um cliente na mesma instancia.
    const identifier = (email || username || '').trim();
    console.log('📝 Login attempt for:', identifier);

    if (!identifier || !password) {
      return res.status(400).json({ error: 'E-mail e password são obrigatórios' });
    }

    const users = await sql`SELECT * FROM users WHERE email = ${identifier}`;
    console.log('📝 Users found:', users.length);
    const user = users[0];

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    console.log('📝 User found, has password:', !!user.password, 'password type:', typeof user.password);
    
    if (!user.password) {
      console.log('❌ User has no password stored');
      return res.status(401).json({ error: 'Credenciais inválidas - senha não configurada' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      console.log('❌ Invalid password');
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role, tenant_id: user.tenant_id || 1, tenant_slug: 'default' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tab_permissions: user.tab_permissions ? JSON.parse(user.tab_permissions) : null
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT id, username, email, role, tab_permissions FROM users WHERE id = ${req.user.id}`;
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });
    res.json({
      valid: true,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        tab_permissions: u.tab_permissions ? JSON.parse(u.tab_permissions) : null,
      }
    });
  } catch {
    res.json({ valid: true, user: req.user });
  }
});

app.get('/api/auth/validate', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' });
    }

    const users = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = users[0];
    const validCurrent = bcrypt.compareSync(currentPassword, user.password);
    if (!validCurrent) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hashedNew = bcrypt.hashSync(newPassword, 10);
    await sql`UPDATE users SET password = ${hashedNew}, updated_at = CURRENT_TIMESTAMP WHERE id = ${req.user.id}`;

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('❌ Error changing password:', error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// ===========================================
// USER MANAGEMENT ENDPOINTS
// ===========================================

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await sql`SELECT id, username, email, role, tab_permissions, created_at, updated_at FROM users WHERE tenant_id = ${req.tenantId} ORDER BY created_at DESC`;
    res.json(users.map(u => ({ ...u, tab_permissions: u.tab_permissions ? JSON.parse(u.tab_permissions) : null })));
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role = 'user', tab_permissions = null } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email e password são obrigatórios' });
    }

    // username so precisa ser unico DENTRO do tenant; email e unico em todo o banco (usado no login)
    const existing = await sql`SELECT id FROM users WHERE (username = ${username} AND tenant_id = ${req.tenantId}) OR email = ${email}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username ou email já existe' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const tabPermsJson = tab_permissions ? JSON.stringify(tab_permissions) : null;
    const result = await sql`
      INSERT INTO users (username, email, password, role, tab_permissions, tenant_id)
      VALUES (${username}, ${email}, ${hashedPassword}, ${role}, ${tabPermsJson}, ${req.tenantId})
      RETURNING id
    `;

    res.status(201).json({
      id: result[0].id,
      username,
      email,
      role,
      tab_permissions
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, role } = req.body;

    const existingUsers = await sql`SELECT * FROM users WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const existingUser = existingUsers[0];

    if (username || email) {
      const conflict = await sql`
        SELECT id FROM users
        WHERE ((username = ${username || existingUser.username} AND tenant_id = ${req.tenantId}) OR email = ${email || existingUser.email})
        AND id != ${id}
      `;
      if (conflict.length > 0) {
        return res.status(400).json({ error: 'Username ou email já existe' });
      }
    }

    const newUsername = username || existingUser.username;
    const newEmail = email || existingUser.email;
    const newPassword = password ? bcrypt.hashSync(password, 10) : existingUser.password;
    const newRole = role || existingUser.role;
    // tab_permissions: undefined = não alterar; null = remover restrição; array = definir permissões
    const hasTabPerms = req.body.hasOwnProperty('tab_permissions');
    const newTabPermsJson = hasTabPerms
      ? (req.body.tab_permissions ? JSON.stringify(req.body.tab_permissions) : null)
      : existingUser.tab_permissions;

    await sql`
      UPDATE users SET 
        username = ${newUsername}, 
        email = ${newEmail}, 
        password = ${newPassword}, 
        role = ${newRole},
        tab_permissions = ${newTabPermsJson},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id} AND tenant_id = ${req.tenantId}
    `;

    const updated = await sql`SELECT id, username, email, role, tab_permissions, created_at, updated_at FROM users WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    const u = updated[0];
    res.json({ ...u, tab_permissions: u.tab_permissions ? JSON.parse(u.tab_permissions) : null });
  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Não é possível deletar seu próprio usuário' });
    }

    const users = await sql`SELECT * FROM users WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await sql`DELETE FROM users WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    res.json({ message: 'Usuário deletado com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
});

// ===========================================
// APP SETTINGS ENDPOINTS
// ===========================================

// Leitura de configuração do tenant (qualquer usuário autenticado do tenant)
app.get('/api/settings/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const rows = await sql`SELECT value, updated_by, updated_at FROM app_settings WHERE key = ${key} AND tenant_id = ${req.tenantId}`;
    if (rows.length === 0) {
      return res.json({ value: null });
    }
    res.json({ value: JSON.parse(rows[0].value), updated_by: rows[0].updated_by, updated_at: rows[0].updated_at });
  } catch (error) {
    console.error('❌ Error reading setting:', error);
    res.status(500).json({ error: 'Erro ao ler configuração' });
  }
});

// Escrita de configuração do tenant (somente admin do tenant)
app.put('/api/settings/:key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'Campo "value" é obrigatório' });
    }
    const jsonValue = JSON.stringify(value);
    const updatedBy = req.user.username;
    await sql`
      INSERT INTO app_settings (key, value, updated_by, updated_at, tenant_id)
      VALUES (${key}, ${jsonValue}, ${updatedBy}, CURRENT_TIMESTAMP, ${req.tenantId})
      ON CONFLICT (key, tenant_id) DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `;
    res.json({ success: true, key, updated_by: updatedBy });
    // Invalida cache de field_mappings se foi esse o campo salvo
    if (key === 'field_mappings') invalidateFieldMappingsCache(req.tenantId);
  } catch (error) {
    console.error('❌ Error saving setting:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// Branding público (sem auth) — usado na tela de login antes de autenticar
app.get('/api/public/branding', async (req, res) => {
  try {
    const rows = await sql`SELECT key, value FROM app_settings WHERE key IN ('branding')`;
    const setting = rows[0];
    const defaults = { company_name: 'Fluxometria', logo_url: '', footer_text: '', cover_url: '' };
    const branding = setting ? { ...defaults, ...JSON.parse(setting.value) } : defaults;
    res.json(branding);
  } catch {
    res.json({ company_name: 'Fluxometria', logo_url: '', footer_text: '', cover_url: '' });
  }
});

// Formulário de contato público
app.post('/api/public/contact', async (req, res) => {
  const { name, email, company, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Nome, e-mail e mensagem são obrigatórios' });
  }
  try {
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${'contact_' + Date.now()}, ${JSON.stringify({ name, email, company, message, date: new Date().toISOString() })}, NOW())
    `;
  } catch { /* ignora se falhar ao salvar */ }
  res.json({ ok: true });
});

// Configurações Azure DevOps (admin) — atualiza em memória + app_settings
app.put('/api/admin/azure-settings', authenticateToken, async (req, res) => {
  if (!req.user?.isAdmin && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const { organization, project, pat } = req.body;
  if (!organization || !project || !pat) {
    return res.status(400).json({ error: 'organization, project e pat são obrigatórios' });
  }
  const org = organization.trim(), proj = project.trim(), patTrim = pat.trim();
  const encPat = saas.encryptPAT(patTrim);
  // Salva a config do Azure DevOps no proprio tenant (nao mais numa chave global)
  await sql`
    UPDATE tenants SET azure_org = ${org}, azure_project = ${proj}, azure_pat_enc = ${encPat}, updated_at = NOW()
    WHERE id = ${req.tenantId}
  `;
  // Tenant "default" tambem atualiza o singleton em memoria (compat com codigo legado)
  if (req.tenantId === 1) {
    AZURE_CONFIG.organization = org;
    AZURE_CONFIG.project = proj;
    AZURE_CONFIG.pat = patTrim;
  }
  // Dispara sincronização imediata só deste tenant
  syncDataForTenant(req.tenantId).catch(console.error);
  res.json({ ok: true, organization: org, project: proj });
});

// Lê configuração Azure atual do tenant (admin)
app.get('/api/admin/azure-settings', authenticateToken, async (req, res) => {
  if (!req.user?.isAdmin && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  const cfg = await getAzureConfigForTenant(req.tenantId);
  res.json({
    organization: cfg?.organization || '',
    project: cfg?.project || '',
    configured: isAzureConfigValid(cfg),
  });
});

// ===========================================
// TEAM MEMBER AVATARS ENDPOINT
// ===========================================

// Buscar todos os avatars dos membros (extraídos do Azure DevOps)
app.get('/api/team-avatars', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT name, image_url, updated_at FROM team_member_avatars WHERE tenant_id = ${req.tenantId} ORDER BY name`;
    const avatars = {};
    for (const row of rows) {
      avatars[row.name] = row.image_url;
    }
    res.json({ success: true, avatars, count: rows.length });
  } catch (error) {
    console.error('❌ Error fetching team avatars:', error);
    res.status(500).json({ error: 'Erro ao buscar avatars' });
  }
});

// ===========================================
// API ENDPOINTS
// ===========================================

app.get('/health', async (req, res) => {
  let dbStatus = 'Not configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      dbStatus = 'PostgreSQL (Connected)';
    } catch (e) {
      dbStatus = `PostgreSQL (Error: ${e.message})`;
    }
  }
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: dbStatus,
    azureConfigured: isConfigured()
  });
});

// Public database connection test endpoint (no auth required)
app.get('/api/test-db', async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      success: false,
      error: 'Database not configured',
      message: 'DATABASE_URL environment variable is not set'
    });
  }

  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW() as time, version() as version, current_database() as database');
    const duration = Date.now() - start;
    
    res.json({ 
      success: true,
      connection: 'OK',
      duration: `${duration}ms`,
      server_time: result.rows[0].time,
      database: result.rows[0].database,
      version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
      environment: 'VPS'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message,
      code: error.code,
      detail: error.detail || 'Connection failed',
      hint: 'Check VPS firewall, PostgreSQL configuration (listen_addresses, pg_hba.conf), and DATABASE_URL'
    });
  }
});

app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    console.log('📊 GET /api/items - Fetching work items...');
    
    const rows = await sql`SELECT * FROM work_items WHERE tenant_id = ${req.tenantId} ORDER BY changed_date DESC`;
    
    console.log(`   Found ${rows.length} items in database`);

    const items = rows.map(row => {
      // Fallback: se first_activation_date não existe, usa created_date para cycleTime
      const cycleTime = calculateCycleTime(row.first_activation_date, row.closed_date)
                        ?? calculateCycleTime(row.created_date, row.closed_date);
      const leadTime = calculateLeadTime(row.created_date, row.closed_date);
      const age = calculateAge(row.created_date);

      return {
        workItemId: row.work_item_id,
        title: row.title,
        state: row.state,
        type: row.type,
        assignedTo: row.assigned_to,
        team: row.team,
        areaPath: row.area_path,
        iterationPath: row.iteration_path,
        createdDate: row.created_date,
        changedDate: row.changed_date,
        closedDate: row.closed_date,
        storyPoints: row.story_points,
        tags: row.tags,
        cycleTime,
        leadTime,
        age,
        url: row.url,
        tipoCliente: row.tipo_cliente,
        priority: row.priority,
        codeReviewLevel1: row.code_review_level1,
        codeReviewLevel2: row.code_review_level2,
        customType: row.custom_type,
        rootCauseStatus: row.root_cause_status,
        squad: row.squad,
        area: row.area,
        reincidencia: row.reincidencia,
        performanceDays: row.performance_days,
        qa: row.qa,
        complexity: row.complexity,
        causaRaiz: row.causa_raiz,
        rootCauseLegacy: row.root_cause_legacy,
        createdBy: row.created_by,
        po: row.po,
        readyDate: row.ready_date,
        doneDate: row.done_date,
        // Novos campos Root Cause
        rootCauseTask: row.root_cause_task,
        rootCauseTeam: row.root_cause_team,
        rootCauseVersion: row.root_cause_version,
        dev: row.dev,
        platform: row.platform,
        application: row.application,
        branchBase: row.branch_base,
        deliveredVersion: row.delivered_version,
        baseVersion: row.base_version,
        // Campos de estimativa de tempo (Tasks)
        originalEstimate: row.original_estimate,
        remainingWork: row.remaining_work,
        completedWork: row.completed_work,
        parentId: row.parent_id,
        // Campos de Identificação e Falha do Processo
        identificacao: row.identificacao,
        falhaDoProcesso: row.falha_do_processo,
        impedimento: row.impedimento || false,
        bloqueio: row.bloqueio || false
      };
    });

    res.json(items);
  } catch (err) {
    console.error('❌ Error in /api/items:', err.message);
    res.status(500).json({ error: 'Failed to fetch work items' });
  }
});

app.get('/api/items/period/:days', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.params.days, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    const rows = await sql`
      SELECT * FROM work_items
      WHERE changed_date >= ${cutoffDateStr} AND tenant_id = ${req.tenantId}
      ORDER BY changed_date DESC
    `;

    const items = rows.map(row => ({
      workItemId: row.work_item_id,
      title: row.title,
      state: row.state,
      type: row.type,
      assignedTo: row.assigned_to,
      team: row.team,
      areaPath: row.area_path,
      iterationPath: row.iteration_path,
      createdDate: row.created_date,
      changedDate: row.changed_date,
      closedDate: row.closed_date,
      storyPoints: row.story_points,
      tags: row.tags,
      cycleTime: calculateCycleTime(row.first_activation_date, row.closed_date),
      leadTime: calculateLeadTime(row.created_date, row.closed_date),
      age: calculateAge(row.created_date),
      url: row.url,
      tipoCliente: row.tipo_cliente,
      priority: row.priority,
      codeReviewLevel1: row.code_review_level1,
      codeReviewLevel2: row.code_review_level2,
      customType: row.custom_type,
      rootCauseStatus: row.root_cause_status,
      squad: row.squad,
      area: row.area,
      reincidencia: row.reincidencia,
      performanceDays: row.performance_days,
      qa: row.qa,
      complexity: row.complexity,
      causaRaiz: row.causa_raiz,
      createdBy: row.created_by,
      po: row.po,
      readyDate: row.ready_date,
      doneDate: row.done_date,
      // Novos campos Root Cause
      rootCauseTask: row.root_cause_task,
      rootCauseTeam: row.root_cause_team,
      rootCauseVersion: row.root_cause_version,
      dev: row.dev,
      platform: row.platform,
      application: row.application,
      branchBase: row.branch_base,
      deliveredVersion: row.delivered_version,
      baseVersion: row.base_version,
      // Campos de Identificação e Falha do Processo
      identificacao: row.identificacao,
      falhaDoProcesso: row.falha_do_processo,
      impedimento: row.impedimento || false,
      bloqueio: row.bloqueio || false
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items by period' });
  }
});

app.get('/api/sync/status', authenticateToken, async (req, res) => {
  try {
    // Estratégia híbrida: verifica sync_log E última atualização dos dados reais
    
    // 1. Tenta buscar do sync_log (sincronização via API)
    let syncLogRows = await sql`SELECT * FROM sync_log WHERE status = 'success' AND tenant_id = ${req.tenantId} ORDER BY sync_time DESC LIMIT 1`;

    // 2. Verifica última atualização real dos work_items (sincronização externa)
    const dataCheckRows = await sql`
      SELECT
        MAX(changed_date) as last_update,
        COUNT(*) as total_items
      FROM work_items
      WHERE tenant_id = ${req.tenantId}
    `;
    
    const lastDataUpdate = dataCheckRows && dataCheckRows.length > 0 ? dataCheckRows[0] : null;
    
    // Se temos dados no banco
    if (lastDataUpdate && lastDataUpdate.total_items > 0) {
      const lastUpdateDate = new Date(lastDataUpdate.last_update);
      const hoursAgo = (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60);
      
      // Se os dados foram atualizados recentemente (< 2 horas), consideramos sincronizado
      if (hoursAgo <= 2) {
        return res.json({
          status: 'success',
          sync_time: lastDataUpdate.last_update,
          work_items: lastDataUpdate.total_items,
          message: 'Dados sincronizados externamente',
          source: 'external_sync'
        });
      }
      
      // Se tem dados mas já estão antigos (> 2 horas mas < 24 horas)
      if (hoursAgo <= 24) {
        return res.json({
          status: 'warning',
          sync_time: lastDataUpdate.last_update,
          work_items: lastDataUpdate.total_items,
          message: `Dados com ${Math.round(hoursAgo)}h de atraso`,
          source: 'external_sync_old'
        });
      }
    }
    
    // 3. Fallback para sync_log se houver
    if (syncLogRows && syncLogRows.length > 0) {
      const syncDate = new Date(syncLogRows[0].sync_time);
      const hoursAgo = (Date.now() - syncDate.getTime()) / (1000 * 60 * 60);
      if (hoursAgo <= 24) {
        return res.json(syncLogRows[0]);
      }
    }
    
    // 4. Sem dados recentes
    res.json({ 
      status: 'error', 
      sync_time: new Date().toISOString(),
      message: 'Nenhuma sincronização recente encontrada'
    });
  } catch (err) {
    console.error('Error in /api/sync/status:', err);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

app.get('/api/sync/log', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM sync_log WHERE tenant_id = ${req.tenantId} ORDER BY sync_time DESC LIMIT 50`;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

app.post('/api/sync', authenticateToken, async (req, res) => {
  try {
    console.log(`🔄 Manual sync triggered (tenant ${req.tenantId})`);
    const result = await syncDataForTenant(req.tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    const [total, byState, byType, byTeam] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} AND tenant_id = ${req.tenantId}`,
      sql`SELECT state, COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} AND tenant_id = ${req.tenantId} GROUP BY state`,
      sql`SELECT type, COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} AND tenant_id = ${req.tenantId} GROUP BY type`,
      sql`SELECT team, COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} AND tenant_id = ${req.tenantId} GROUP BY team`
    ]);

    res.json({
      total: parseInt(total[0]?.count || 0),
      byState,
      byType,
      byTeam
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ===========================================
// PULL REQUEST ENDPOINTS
// ===========================================

app.get('/api/pull-requests', authenticateToken, async (req, res) => {
  try {
    console.log('📊 GET /api/pull-requests - Fetching pull requests...');
    const rows = await sql`SELECT * FROM pull_requests WHERE tenant_id = ${req.tenantId} ORDER BY created_date DESC`;
    console.log(`   Found ${rows.length} pull requests`);

    const items = rows.map(row => {
      let reviewers = [];
      let votes = [];
      try { reviewers = JSON.parse(row.reviewers || '[]'); } catch(e) {}
      try { votes = JSON.parse(row.votes || '[]'); } catch(e) {}

      const lifetimeDays = row.closed_date && row.created_date
        ? Math.round((new Date(row.closed_date) - new Date(row.created_date)) / (1000 * 60 * 60 * 24))
        : null;

      return {
        pullRequestId: row.pull_request_id,
        title: row.title,
        description: row.description,
        status: row.status,
        createdBy: row.created_by,
        createdDate: row.created_date,
        closedDate: row.closed_date,
        sourceRefName: row.source_ref_name,
        targetRefName: row.target_ref_name,
        repositoryId: row.repository_id,
        repositoryName: row.repository_name,
        labels: row.labels ? row.labels.split(',').filter(Boolean) : [],
        reviewers,
        votes,
        hasValidaCRLabel: row.has_valida_cr_label,
        lifetimeDays,
        url: row.url
      };
    });

    res.json(items);
  } catch (err) {
    console.error('❌ Error in /api/pull-requests:', err.message);
    res.status(500).json({ error: 'Failed to fetch pull requests' });
  }
});

app.post('/api/sync/pull-requests', authenticateToken, async (req, res) => {
  try {
    console.log(`🔄 Manual PR sync triggered (tenant ${req.tenantId})`);
    const result = await syncPullRequests(req.tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DevTracker API — Gestão de desenvolvedores e projetos do time
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/devtracker/developers — lista devs com projetos alocados e tags customizadas
app.get('/api/devtracker/developers', authenticateToken, async (req, res) => {
  try {
    const devs = await sql`
      SELECT d.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', p.id,
              'name', p.name,
              'client', p.client,
              'priority', p.priority,
              'status', p.status,
              'start_date', p.start_date,
              'deadline', p.deadline,
              'allocated_date', a.allocated_date
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS projects,
        COALESCE(
          (SELECT json_agg(t.tag) FROM devtracker_tags t
           WHERE t.entity_type = 'developer' AND t.entity_id = d.id::text),
          '[]'::json
        ) AS custom_tags
      FROM devtracker_developers d
      LEFT JOIN devtracker_allocations a ON a.developer_id = d.id
      LEFT JOIN devtracker_projects p ON p.id = a.project_id
      WHERE d.tenant_id = ${req.tenantId}
      GROUP BY d.id
      ORDER BY d.name
    `;
    res.json(devs);
  } catch (err) {
    console.error('❌ GET /api/devtracker/developers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devtracker/ado-members — todas as pessoas únicas do Azure DevOps com avatar e categoria mais frequente
app.get('/api/devtracker/ado-members', authenticateToken, async (req, res) => {
  try {
    const members = await sql`
      SELECT DISTINCT ON (LOWER(w.assigned_to))
        w.assigned_to AS name,
        a.image_url   AS avatar_url,
        COUNT(w.work_item_id) OVER (PARTITION BY LOWER(w.assigned_to)) AS task_count,
        (
          SELECT w2.categoria FROM work_items w2
          WHERE LOWER(w2.assigned_to) = LOWER(w.assigned_to)
            AND w2.categoria IS NOT NULL AND w2.categoria != '' AND w2.tenant_id = ${req.tenantId}
          GROUP BY w2.categoria ORDER BY COUNT(*) DESC LIMIT 1
        ) AS categoria
      FROM work_items w
      LEFT JOIN team_member_avatars a ON LOWER(a.name) = LOWER(w.assigned_to) AND a.tenant_id = ${req.tenantId}
      WHERE w.assigned_to IS NOT NULL AND w.assigned_to != '' AND w.tenant_id = ${req.tenantId}
      ORDER BY LOWER(w.assigned_to)
    `;
    res.json(members);
  } catch (err) {
    console.error('❌ GET /api/devtracker/ado-members:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Mapeia categoria ADO → categoria devtracker
function mapAdoCategoria(adoCategoria) {
  if (!adoCategoria) return 'paydev';
  const v = adoCategoria.toLowerCase().trim();
  if (v.includes('paydev') || v.includes('pay dev')) return 'paydev';
  if (v.includes('não aderência') || v.includes('nao aderencia') || v === '2-não aderência' || v.includes('ader')) return 'nao-aderencia';
  return 'demandas-internas';
}

// POST /api/devtracker/import-from-ado — importa pessoas do Azure DevOps como developers (ignora duplicatas)
app.post('/api/devtracker/import-from-ado', authenticateToken, async (req, res) => {
  try {
    const { members, role = 'Dev Pleno' } = req.body;
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: 'members array obrigatório' });
    }
    let imported = 0;
    let skipped = 0;
    for (const member of members) {
      const name = typeof member === 'string' ? member : member.name;
      const adoCategoria = typeof member === 'object' ? member.categoria : null;
      const category = mapAdoCategoria(adoCategoria);
      const existing = await sql`SELECT id FROM devtracker_developers WHERE LOWER(name) = LOWER(${name}) AND tenant_id = ${req.tenantId}`;
      if (existing.length > 0) { skipped++; continue; }
      await sql`
        INSERT INTO devtracker_developers (name, role, category, active, tenant_id)
        VALUES (${name}, ${role}, ${category}, true, ${req.tenantId})
      `;
      imported++;
    }
    res.json({ imported, skipped });
  } catch (err) {
    console.error('❌ POST /api/devtracker/import-from-ado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devtracker/developers — cria novo dev
app.post('/api/devtracker/developers', authenticateToken, async (req, res) => {
  try {
    const { name, role = 'Dev Pleno', email, category, client } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'name e category são obrigatórios' });
    const result = await sql`
      INSERT INTO devtracker_developers (name, role, email, category, client, tenant_id)
      VALUES (${name}, ${role}, ${email || null}, ${category}, ${client || null}, ${req.tenantId})
      RETURNING *
    `;
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('❌ POST /api/devtracker/developers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/devtracker/developers/:id — edita dev
app.put('/api/devtracker/developers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, email, category, client, active } = req.body;
    const result = await sql`
      UPDATE devtracker_developers
      SET name = ${name},
          role = ${role},
          email = ${email || null},
          category = ${category},
          client = ${client || null},
          active = ${active !== undefined ? active : true}
      WHERE id = ${id} AND tenant_id = ${req.tenantId}
      RETURNING *
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Developer not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('❌ PUT /api/devtracker/developers/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devtracker/developers/:id — inativa dev (soft delete)
app.delete('/api/devtracker/developers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await sql`UPDATE devtracker_developers SET active = false WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/devtracker/developers/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devtracker/projects — lista projetos com devs alocados
app.get('/api/devtracker/projects', authenticateToken, async (req, res) => {
  try {
    const projects = await sql`
      SELECT p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', d.id,
              'name', d.name,
              'role', d.role,
              'allocated_date', a.allocated_date
            )
          ) FILTER (WHERE d.id IS NOT NULL),
          '[]'
        ) AS developers
      FROM devtracker_projects p
      LEFT JOIN devtracker_allocations a ON a.project_id = p.id
      LEFT JOIN devtracker_developers d ON d.id = a.developer_id
      WHERE p.tenant_id = ${req.tenantId}
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    res.json(projects);
  } catch (err) {
    console.error('❌ GET /api/devtracker/projects:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devtracker/projects — cria projeto
app.post('/api/devtracker/projects', authenticateToken, async (req, res) => {
  try {
    const { name, client, priority = 'Média', status = 'Em andamento', start_date, deadline } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const result = await sql`
      INSERT INTO devtracker_projects (name, client, priority, status, start_date, deadline, tenant_id)
      VALUES (${name}, ${client || null}, ${priority}, ${status}, ${start_date || null}, ${deadline || null}, ${req.tenantId})
      RETURNING *
    `;
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('❌ POST /api/devtracker/projects:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/devtracker/projects/:id — edita projeto
app.put('/api/devtracker/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, client, priority, status, start_date, deadline } = req.body;
    const result = await sql`
      UPDATE devtracker_projects
      SET name = ${name},
          client = ${client || null},
          priority = ${priority},
          status = ${status},
          start_date = ${start_date || null},
          deadline = ${deadline || null},
          updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${req.tenantId}
      RETURNING *
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('❌ PUT /api/devtracker/projects/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devtracker/projects/:id — exclui projeto
app.delete('/api/devtracker/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM devtracker_projects WHERE id = ${id} AND tenant_id = ${req.tenantId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/devtracker/projects/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devtracker/projects/:id/complete — conclui projeto
app.post('/api/devtracker/projects/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await sql`
      UPDATE devtracker_projects SET status = 'Concluído', updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${req.tenantId} RETURNING *
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('❌ POST /api/devtracker/projects/:id/complete:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devtracker/allocations — aloca dev em projeto
app.post('/api/devtracker/allocations', authenticateToken, async (req, res) => {
  try {
    const { developer_id, project_id } = req.body;
    if (!developer_id || !project_id) return res.status(400).json({ error: 'developer_id e project_id são obrigatórios' });
    // Garante que dev e projeto pertencem ao mesmo tenant do usuário autenticado
    const devOk = await sql`SELECT id FROM devtracker_developers WHERE id = ${developer_id} AND tenant_id = ${req.tenantId}`;
    const projOk = await sql`SELECT id FROM devtracker_projects WHERE id = ${project_id} AND tenant_id = ${req.tenantId}`;
    if (devOk.length === 0 || projOk.length === 0) return res.status(404).json({ error: 'Developer ou Project não encontrado' });
    const result = await sql`
      INSERT INTO devtracker_allocations (developer_id, project_id, tenant_id)
      VALUES (${developer_id}, ${project_id}, ${req.tenantId})
      ON CONFLICT (developer_id, project_id) DO NOTHING
      RETURNING *
    `;
    res.status(201).json(result[0] || { developer_id, project_id });
  } catch (err) {
    console.error('❌ POST /api/devtracker/allocations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devtracker/allocations/:developerId/:projectId — remove alocação
app.delete('/api/devtracker/allocations/:developerId/:projectId', authenticateToken, async (req, res) => {
  try {
    const { developerId, projectId } = req.params;
    await sql`DELETE FROM devtracker_allocations WHERE developer_id = ${developerId} AND project_id = ${projectId} AND tenant_id = ${req.tenantId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/devtracker/allocations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devtracker/active-tasks — tarefas ativas por dev (com feature pai, po, qa e avatares)
app.get('/api/devtracker/active-tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await sql`
      SELECT
        w.work_item_id, w.title, w.state, w.type,
        w.assigned_to, w.po, w.qa,
        w.first_activation_date, w.created_date,
        w.changed_date, w.priority, w.story_points, w.url,
        w.impedimento, w.bloqueio, w.categoria, w.area_path,
        f.title        AS feature_title,
        f.work_item_id AS feature_id,
        av.image_url   AS avatar_url,
        po_av.image_url AS po_avatar_url,
        qa_av.image_url AS qa_avatar_url
      FROM work_items w
      LEFT JOIN work_items f
        ON f.work_item_id = w.parent_id AND f.type = 'Feature' AND f.tenant_id = ${req.tenantId}
      LEFT JOIN team_member_avatars av
        ON LOWER(av.name) = LOWER(w.assigned_to) AND av.tenant_id = ${req.tenantId}
      LEFT JOIN team_member_avatars po_av
        ON LOWER(po_av.name) = LOWER(w.po) AND po_av.tenant_id = ${req.tenantId}
      LEFT JOIN team_member_avatars qa_av
        ON LOWER(qa_av.name) = LOWER(w.qa) AND qa_av.tenant_id = ${req.tenantId}
      WHERE w.state NOT IN (
          'Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed'
        )
        AND w.assigned_to IS NOT NULL
        AND w.type NOT IN ('Feature', 'Epic')
        AND w.tenant_id = ${req.tenantId}
      ORDER BY w.first_activation_date DESC NULLS LAST
    `;
    res.json(tasks);
  } catch (err) {
    console.error('❌ GET /api/devtracker/active-tasks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devtracker/features — Features do Azure DevOps com tags customizadas
app.get('/api/devtracker/features', authenticateToken, async (req, res) => {
  try {
    const features = await sql`
      SELECT
        w.work_item_id, w.title, w.state, w.type,
        w.assigned_to, w.team, w.area_path,
        w.created_date, w.changed_date, w.closed_date, w.first_activation_date,
        w.story_points, w.tags, w.priority, w.url,
        COALESCE(
          (SELECT json_agg(t.tag) FROM devtracker_tags t
           WHERE t.entity_type = 'feature' AND t.entity_id = w.work_item_id::text AND t.tenant_id = ${req.tenantId}),
          '[]'::json
        ) AS custom_tags
      FROM work_items w
      WHERE w.type = 'Feature' AND w.tenant_id = ${req.tenantId}
      ORDER BY
        CASE WHEN w.state IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto')
          THEN 1 ELSE 0 END,
        w.first_activation_date DESC NULLS LAST,
        w.created_date DESC
    `;
    res.json(features);
  } catch (err) {
    console.error('❌ GET /api/devtracker/features:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devtracker/tags — adiciona tag
app.post('/api/devtracker/tags', authenticateToken, async (req, res) => {
  try {
    const { entity_type, entity_id, tag } = req.body;
    if (!entity_type || !entity_id || !tag) return res.status(400).json({ error: 'entity_type, entity_id e tag são obrigatórios' });
    await sql`
      INSERT INTO devtracker_tags (entity_type, entity_id, tag, tenant_id)
      VALUES (${entity_type}, ${String(entity_id)}, ${tag.trim()}, ${req.tenantId})
      ON CONFLICT DO NOTHING
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ POST /api/devtracker/tags:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devtracker/tags — remove tag (body: entity_type, entity_id, tag)
app.delete('/api/devtracker/tags', authenticateToken, async (req, res) => {
  try {
    const { entity_type, entity_id, tag } = req.body;
    if (!entity_type || !entity_id || !tag) return res.status(400).json({ error: 'entity_type, entity_id e tag são obrigatórios' });
    await sql`
      DELETE FROM devtracker_tags
      WHERE entity_type = ${entity_type} AND entity_id = ${String(entity_id)} AND tag = ${tag} AND tenant_id = ${req.tenantId}
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/devtracker/tags:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Ritos & Cerimônias API
// ═══════════════════════════════════════════════════════════════════════════════

// Configuração de upload (memória temporária)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// OAuth state storage (em produção, usar Redis ou DB)
const oauthStates = new Map();

// POST /api/ceremonies/calendar-import/ics — upload de arquivo .ics
app.post('/api/ceremonies/calendar-import/ics', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    const icsContent = req.file.buffer.toString('utf-8');
    const events = ical.sync.parseICS(icsContent);
    
    const keywords = ['refinamento', 'review', 'sprint review', 'retrospectiva', 'retro', 'apresentação', 'apresentacao', 'result', 'resultado', 'planning', 'planing', 'daily', 'sprint'];
    const startDate = new Date('2025-06-01');
    const endDate = new Date();
    const imported = [];
    
    for (const k in events) {
      const ev = events[k];
      if (ev.type !== 'VEVENT') continue;
      
      // node-ical pode retornar summary como string ou objeto {val: "..."}
      const summaryValue = typeof ev.summary === 'string' ? ev.summary : (ev.summary?.val || '');
      const summary = summaryValue.toLowerCase();
      if (!keywords.some(kw => summary.includes(kw))) continue;
      
      // Verificar se tem data de início
      if (!ev.start) continue;
      
      // Filtrar por data: entre 01/06/2025 e hoje
      const eventDate = new Date(ev.start);
      if (eventDate < startDate || eventDate > endDate) continue;
      
      const date = eventDate.toISOString().slice(0, 10);
      const descriptionValue = typeof ev.description === 'string' ? ev.description : (ev.description?.val || null);
      
      // Por agora, importa todos com status 'done' — no frontend o usuário escolhe o time/ritual_type
      imported.push({
        title: summaryValue,
        date,
        time: ev.start ? new Date(ev.start).toISOString().slice(11, 16) : null,
        description: descriptionValue,
      });
    }
    
    res.json({ events: imported });
  } catch (err) {
    console.error('❌ POST /api/ceremonies/calendar-import/ics:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ceremonies/calendar-import/url — baixar .ics de URL compartilhada
app.post('/api/ceremonies/calendar-import/url', authenticateToken, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL não fornecida' });
    }
    
    // Baixar o .ics da URL
    const axios = require('axios');
    const response = await axios.get(url, { timeout: 10000 });
    const icsContent = response.data;
    
    const events = ical.sync.parseICS(icsContent);
    
    const keywords = ['refinamento', 'review', 'sprint review', 'retrospectiva', 'retro', 'apresentação', 'apresentacao', 'result', 'resultado', 'planning', 'planing', 'daily', 'sprint'];
    const startDate = new Date('2025-06-01');
    const endDate = new Date();
    const imported = [];
    
    for (const k in events) {
      const ev = events[k];
      if (ev.type !== 'VEVENT') continue;
      
      const summaryValue = typeof ev.summary === 'string' ? ev.summary : (ev.summary?.val || '');
      const summary = summaryValue.toLowerCase();
      if (!keywords.some(kw => summary.includes(kw))) continue;
      
      // Verificar se tem data de início
      if (!ev.start) continue;
      
      // Filtrar por data: entre 01/06/2025 e hoje
      const eventDate = new Date(ev.start);
      if (eventDate < startDate || eventDate > endDate) continue;
      
      const date = eventDate.toISOString().slice(0, 10);
      const descriptionValue = typeof ev.description === 'string' ? ev.description : (ev.description?.val || null);
      
      imported.push({
        title: summaryValue,
        date,
        time: ev.start ? new Date(ev.start).toISOString().slice(11, 16) : null,
        description: descriptionValue,
      });
    }
    
    res.json({ events: imported });
  } catch (err) {
    console.error('❌ POST /api/ceremonies/calendar-import/url:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ceremonies/auth/microsoft — iniciar OAuth flow delegado
app.get('/api/ceremonies/auth/microsoft', authenticateToken, (req, res) => {
  const clientId = process.env.GRAPH_CLIENT_ID;
  const redirectUri = process.env.GRAPH_REDIRECT_URI || 'https://dsmetrics.online/api/ceremonies/auth/callback';
  const tenantId = process.env.GRAPH_TENANT_ID;
  
  if (!clientId || !tenantId) {
    return res.status(503).json({ error: 'GRAPH_CLIENT_ID e GRAPH_TENANT_ID não configurados' });
  }
  
  const state = Math.random().toString(36).substring(7);
  oauthStates.set(state, { username: req.user.username, timestamp: Date.now() });
  
  // Limpar states antigos (> 10 min)
  for (const [k, v] of oauthStates.entries()) {
    if (Date.now() - v.timestamp > 600000) oauthStates.delete(k);
  }
  
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_mode=query&scope=${encodeURIComponent('Calendars.Read offline_access')}&state=${state}`;
  
  res.json({ authUrl });
});

// GET /api/ceremonies/auth/callback — callback OAuth
app.get('/api/ceremonies/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`/?oauth_error=${encodeURIComponent(error)}`);
  }
  
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }
  
  const stateData = oauthStates.get(state);
  if (!stateData) {
    return res.status(400).send('Invalid or expired state');
  }
  oauthStates.delete(state);
  
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const tenantId = process.env.GRAPH_TENANT_ID;
  const redirectUri = process.env.GRAPH_REDIRECT_URI || 'https://dsmetrics.online/api/ceremonies/auth/callback';
  
  try {
    // Trocar code por access_token
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const accessToken = tokenRes.data.access_token;
    // Armazenar token (em produção, usar DB criptografado ou Redis)
    // Por enquanto, redirecionar de volta com token em query (não ideal, mas funcional para demo)
    res.redirect(`/?oauth_success=true&graph_token=${accessToken}`);
  } catch (err) {
    console.error('❌ OAuth callback error:', err.response?.data || err.message);
    res.redirect(`/?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/ceremonies/calendar-preview-oauth — busca eventos com token delegado
app.get('/api/ceremonies/calendar-preview-oauth', authenticateToken, async (req, res) => {
  const { month, token } = req.query;
  
  if (!token) {
    return res.status(400).json({ error: 'Token delegado não fornecido' });
  }
  
  try {
    const target = month || new Date().toISOString().slice(0, 7);
    const [yr, mo] = target.split('-').map(Number);
    const startDt = new Date(yr, mo - 1, 1).toISOString();
    const endDt = new Date(yr, mo, 0, 23, 59, 59).toISOString();
    
    const eventsRes = await axios.get(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$select=subject,start,end,isOnlineMeeting,onlineMeetingProvider,organizer&$top=100&$orderby=start/dateTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const keywords = ['refinamento', 'review', 'sprint review', 'retrospectiva', 'retro', 'apresentação', 'result', 'planning', 'planing', 'daily'];
    const events = (eventsRes.data.value || []).filter(ev =>
      keywords.some(kw => ev.subject?.toLowerCase().includes(kw))
    ).map(ev => ({
      id: ev.id,
      title: ev.subject,
      date: ev.start?.dateTime?.slice(0, 10),
      time: ev.start?.dateTime?.slice(11, 16),
      isTeams: ev.isOnlineMeeting && ev.onlineMeetingProvider === 'teamsForBusiness',
      organizer: ev.organizer?.emailAddress?.name,
    }));
    
    res.json(events);
  } catch (err) {
    console.error('❌ GET /api/ceremonies/calendar-preview-oauth:', err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// GET /api/ceremonies/config — lista configuração de ritos (opcional: ?team=)
app.get('/api/ceremonies/config', authenticateToken, async (req, res) => {
  try {
    const { team } = req.query;
    const rows = team
      ? await sql`SELECT * FROM ceremony_config WHERE team = ${team} AND active = true AND tenant_id = ${req.tenantId} ORDER BY team, ritual_type`
      : await sql`SELECT * FROM ceremony_config WHERE active = true AND tenant_id = ${req.tenantId} ORDER BY team, ritual_type`;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/ceremonies/config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ceremonies/teams — times cadastrados na config
app.get('/api/ceremonies/teams', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT DISTINCT team FROM ceremony_config WHERE active = true AND tenant_id = ${req.tenantId} ORDER BY team`;
    res.json(rows.map(r => r.team));
  } catch (err) {
    console.error('❌ GET /api/ceremonies/teams:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ceremonies/config — criar ou atualizar rito de um time (upsert)
app.post('/api/ceremonies/config', authenticateToken, async (req, res) => {
  try {
    const { team, ritual_type, frequency } = req.body;
    if (!team || !ritual_type || !frequency) {
      return res.status(400).json({ error: 'team, ritual_type e frequency são obrigatórios' });
    }
    const validFreqs = ['daily', 'weekly', 'biweekly', 'monthly'];
    if (!validFreqs.includes(frequency)) {
      return res.status(400).json({ error: 'frequency deve ser weekly, biweekly ou monthly' });
    }
    const rows = await sql`
      INSERT INTO ceremony_config (team, ritual_type, frequency, active, tenant_id)
      VALUES (${team}, ${ritual_type}, ${frequency}, true, ${req.tenantId})
      ON CONFLICT (team, ritual_type, tenant_id) DO UPDATE SET frequency = ${frequency}, active = true
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('❌ POST /api/ceremonies/config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ceremonies/config/:id — desativa rito de um time
app.delete('/api/ceremonies/config/:id', authenticateToken, async (req, res) => {
  try {
    await sql`UPDATE ceremony_config SET active = false WHERE id = ${req.params.id} AND tenant_id = ${req.tenantId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/ceremonies/config/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// QA TRACKER — endpoints
// ══════════════════════════════════════════════════════════════════════

// GET /api/qa-tracker/qa-persons — nomes únicos de QA (Custom.QA.displayName)
app.get('/api/qa-tracker/qa-persons', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`
      SELECT DISTINCT qa FROM work_items
      WHERE qa IS NOT NULL AND qa != '' AND tenant_id = ${req.tenantId}
      ORDER BY qa ASC
    `;
    res.json(rows.map(r => r.qa));
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/qa-persons:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa-tracker/items-by-qa?qa=name — todos os itens de um QA em todas as versões
app.get('/api/qa-tracker/items-by-qa', authenticateToken, async (req, res) => {
  try {
    const { qa } = req.query;
    if (!qa) return res.status(400).json({ error: 'qa obrigatório' });
    const rows = await sql`
      SELECT
        wi.work_item_id, wi.title, wi.type, wi.area_path, wi.assigned_to, wi.qa,
        wi.state, wi.priority, wi.tags, wi.delivered_version, wi.tipo_cliente,
        wi.story_points, wi.url,
        qtr.id          AS rec_id,
        qtr.version     AS qtr_version,
        qtr.qa_person, qtr.status, qtr.obs, qtr.cts, qtr.attachments,
        qtr.override_desc, qtr.override_client, qtr.override_tipo, qtr.override_area
      FROM work_items wi
      LEFT JOIN LATERAL (
        SELECT * FROM qa_test_records r
        WHERE r.work_item_id = wi.work_item_id AND r.qa_person = ${qa} AND r.tenant_id = ${req.tenantId}
        ORDER BY r.version DESC
        LIMIT 1
      ) qtr ON true
      WHERE (wi.qa = ${qa} OR qtr.id IS NOT NULL) AND wi.tenant_id = ${req.tenantId}
      ORDER BY wi.priority ASC NULLS LAST, wi.work_item_id ASC
    `;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/items-by-qa:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa-tracker/versions — versões únicas disponíveis no DevOps (com pelo menos 1 item)
app.get('/api/qa-tracker/versions', authenticateToken, async (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

    // 2 queries em paralelo em vez de N+1 — extrai versões direto do banco
    const [tagRows, dvRows] = await Promise.all([
      sql`
        SELECT DISTINCT matches[1] AS version
        FROM work_items, regexp_matches(tags, '\\[(\\d+\\.\\d+\\.\\d+\\.\\d+)\\]', 'g') AS matches
        WHERE tags LIKE '%[%' AND tenant_id = ${req.tenantId}
      `,
      sql`
        SELECT DISTINCT delivered_version AS version
        FROM work_items
        WHERE delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
          AND delivered_version IS NOT NULL AND delivered_version != '' AND tenant_id = ${req.tenantId}
      `,
    ]);

    const versionSet = new Set([
      ...tagRows.map(r => r.version),
      ...dvRows.map(r => r.version),
    ]);
    const sorted = [...versionSet].sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 4; i++) { if (pa[i] !== pb[i]) return pb[i] - pa[i]; }
      return 0;
    });

    res.json({
      versions: sorted.slice(offset, offset + limit),
      total: sorted.length,
      hasMore: offset + limit < sorted.length,
    });
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/versions:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa-tracker/items?version=3.66.0.0 — work items da versão
app.get('/api/qa-tracker/items', authenticateToken, async (req, res) => {
  try {
    const { version } = req.query;
    if (!version) return res.status(400).json({ error: 'version obrigatório' });
    const tagPattern = `%[${version}]%`;
    const rows = await sql`
      SELECT
        work_item_id, title, type, area_path, assigned_to, qa,
        state, priority, tags, delivered_version, tipo_cliente,
        story_points, complexity, squad, dev, po, url
      FROM work_items
      WHERE (tags ILIKE ${tagPattern} OR delivered_version = ${version}) AND tenant_id = ${req.tenantId}
      ORDER BY priority ASC NULLS LAST, work_item_id ASC
    `;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/items:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Ensure qa_test_records table exists (called on init)
async function ensureQATrackerTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS qa_test_records (
      id SERIAL PRIMARY KEY,
      work_item_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      qa_person TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      obs TEXT,
      cts JSONB DEFAULT '[]',
      attachments JSONB DEFAULT '[]',
      override_desc TEXT,
      override_client TEXT,
      override_tipo TEXT,
      override_area TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      tenant_id INT NOT NULL DEFAULT 1,
      UNIQUE(work_item_id, version, tenant_id)
    )
  `;
  // Migração segura para instâncias que já tinham a tabela sem tenant_id
  try { await sql`ALTER TABLE qa_test_records ADD COLUMN IF NOT EXISTS tenant_id INT NOT NULL DEFAULT 1`; } catch {}
  try {
    await sql`ALTER TABLE qa_test_records DROP CONSTRAINT IF EXISTS qa_test_records_work_item_id_version_key`;
    await sql`ALTER TABLE qa_test_records ADD CONSTRAINT qa_test_records_tenant_unique UNIQUE (work_item_id, version, tenant_id)`;
  } catch {}
}

// GET /api/qa-tracker/records?version=3.66.0.0
app.get('/api/qa-tracker/records', authenticateToken, async (req, res) => {
  try {
    await ensureQATrackerTable();
    const { version } = req.query;
    if (!version) return res.status(400).json({ error: 'version obrigatório' });
    const rows = await sql`SELECT * FROM qa_test_records WHERE version = ${version} AND tenant_id = ${req.tenantId} ORDER BY work_item_id ASC`;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/records:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qa-tracker/records — upsert
app.post('/api/qa-tracker/records', authenticateToken, async (req, res) => {
  try {
    await ensureQATrackerTable();
    const { work_item_id, version, qa_person, status, obs, cts, attachments,
            override_desc, override_client, override_tipo, override_area } = req.body;
    if (!work_item_id || !version) return res.status(400).json({ error: 'work_item_id e version obrigatórios' });
    const ctsJson = JSON.stringify(cts || []);
    const attachJson = JSON.stringify(attachments || []);
    const rows = await sql`
      INSERT INTO qa_test_records
        (work_item_id, version, qa_person, status, obs, cts, attachments,
         override_desc, override_client, override_tipo, override_area, updated_at, tenant_id)
      VALUES
        (${work_item_id}, ${version}, ${qa_person || null}, ${status || 'pending'},
         ${obs || null}, ${ctsJson}::jsonb, ${attachJson}::jsonb,
         ${override_desc || null}, ${override_client || null}, ${override_tipo || null}, ${override_area || null}, NOW(), ${req.tenantId})
      ON CONFLICT (work_item_id, version, tenant_id) DO UPDATE SET
        qa_person     = EXCLUDED.qa_person,
        status        = EXCLUDED.status,
        obs           = EXCLUDED.obs,
        cts           = EXCLUDED.cts,
        attachments   = EXCLUDED.attachments,
        override_desc   = EXCLUDED.override_desc,
        override_client = EXCLUDED.override_client,
        override_tipo   = EXCLUDED.override_tipo,
        override_area   = EXCLUDED.override_area,
        updated_at    = NOW()
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ POST /api/qa-tracker/records:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/qa-tracker/records/:id
app.put('/api/qa-tracker/records/:id', authenticateToken, async (req, res) => {
  try {
    const { qa_person, status, obs, cts, attachments,
            override_desc, override_client, override_tipo, override_area } = req.body;
    const ctsJson = JSON.stringify(cts || []);
    const attachJson = JSON.stringify(attachments || []);
    const rows = await sql`
      UPDATE qa_test_records SET
        qa_person     = ${qa_person || null},
        status        = ${status || 'pending'},
        obs           = ${obs || null},
        cts           = ${ctsJson}::jsonb,
        attachments   = ${attachJson}::jsonb,
        override_desc   = ${override_desc || null},
        override_client = ${override_client || null},
        override_tipo   = ${override_tipo || null},
        override_area   = ${override_area || null},
        updated_at    = NOW()
      WHERE id = ${req.params.id} AND tenant_id = ${req.tenantId}
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Registro não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ PUT /api/qa-tracker/records/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/qa-tracker/records/:id
app.delete('/api/qa-tracker/records/:id', authenticateToken, async (req, res) => {
  try {
    await sql`DELETE FROM qa_test_records WHERE id = ${req.params.id} AND tenant_id = ${req.tenantId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/qa-tracker/records/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa-tracker/version-items?version=X — itens com registros QA para drill-down do histórico
app.get('/api/qa-tracker/version-items', authenticateToken, async (req, res) => {
  try {
    const { version } = req.query;
    if (!version) return res.status(400).json({ error: 'version obrigatório' });
    const tagPattern = `%[${version}]%`;
    const rows = await sql`
      SELECT
        wi.work_item_id, wi.title, wi.type, wi.area_path, wi.assigned_to, wi.qa,
        wi.state, wi.priority, wi.tags, wi.delivered_version, wi.tipo_cliente,
        wi.story_points, wi.url,
        qtr.id          AS rec_id,
        qtr.version     AS qtr_version,
        qtr.qa_person, qtr.status, qtr.obs, qtr.cts, qtr.attachments,
        qtr.override_desc, qtr.override_client, qtr.override_tipo, qtr.override_area
      FROM work_items wi
      LEFT JOIN qa_test_records qtr
        ON qtr.work_item_id = wi.work_item_id AND qtr.version = ${version} AND qtr.tenant_id = ${req.tenantId}
      WHERE (wi.tags ILIKE ${tagPattern} OR wi.delivered_version = ${version}) AND wi.tenant_id = ${req.tenantId}
      ORDER BY wi.priority ASC NULLS LAST, wi.work_item_id ASC
    `;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/version-items:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qa-tracker/auto-populate — cria e atualiza registros QA com base no estado DevOps
app.post('/api/qa-tracker/auto-populate', authenticateToken, async (req, res) => {
  try {
    const DONE_STATES = ['Closed', 'Finished', 'Resolved', 'Completed', 'Pronto', 'Done'];

    // 1. Busca todos os pares (versão, item) com o status QA atual em uma única query
    const allPairs = await sql`
      SELECT
        v.version,
        wi.work_item_id,
        wi.type,
        wi.state,
        wi.bloqueio,
        wi.impedimento,
        wi.delivered_version,
        wi.tags,
        qtr.status AS current_status
      FROM (
        SELECT DISTINCT matches[1] AS version, work_item_id
        FROM work_items, regexp_matches(tags, '\\[(\\d+\\.\\d+\\.\\d+\\.\\d+)\\]', 'g') AS matches
        WHERE tags LIKE '%[%' AND tenant_id = ${req.tenantId}
        UNION
        SELECT DISTINCT delivered_version AS version, work_item_id
        FROM work_items
        WHERE delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
          AND delivered_version IS NOT NULL AND delivered_version != '' AND tenant_id = ${req.tenantId}
      ) v
      JOIN work_items wi ON wi.work_item_id = v.work_item_id AND wi.tenant_id = ${req.tenantId}
      LEFT JOIN qa_test_records qtr
        ON qtr.work_item_id = v.work_item_id AND qtr.version = v.version AND qtr.tenant_id = ${req.tenantId}
    `;

    const VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;
    const TAG_PATTERN = /\d+\.\d+\.\d+\.\d+/;

    const toInsert = [];
    const toUpdate = [];

    for (const pair of allPairs) {
      // Nunca sobrescreve registros já definidos manualmente como done/blocked
      if (pair.current_status === 'done' || pair.current_status === 'blocked') continue;

      // Eventuality não tem delivered_version — só exige tag com versão
      // Para os demais tipos exige os DOIS campos: delivered_version E tag com versão
      const hasDeliveredVersion = pair.delivered_version && VERSION_PATTERN.test(pair.delivered_version);
      const hasTagVersion = !!(pair.tags && TAG_PATTERN.test(pair.tags));
      const isEventuality = pair.type === 'Eventuality';
      const hasBothVersionFields = isEventuality ? hasTagVersion : (hasDeliveredVersion && hasTagVersion);

      let newStatus;
      if (pair.bloqueio === true && pair.impedimento === true) {
        newStatus = 'blocked';
      } else if (DONE_STATES.includes(pair.state) && hasBothVersionFields) {
        newStatus = 'done';
      } else {
        newStatus = 'pending';
      }

      if (pair.current_status === null) {
        // Sem registro — criar
        toInsert.push({ work_item_id: pair.work_item_id, version: pair.version, status: newStatus });
      } else if (pair.current_status === 'pending' && newStatus !== 'pending') {
        // Registro pendente que mudou de estado no DevOps — atualizar
        toUpdate.push({ work_item_id: pair.work_item_id, version: pair.version, status: newStatus });
      }
    }

    let inserted = 0, updated = 0;

    // 2. Bulk insert dos registros novos — pg parameterizado, lotes de 500
    if (toInsert.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const placeholders = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`).join(',');
        const flatValues = chunk.flatMap(r => [r.work_item_id, r.version, r.status, req.tenantId]);
        await pool.query(
          `INSERT INTO qa_test_records (work_item_id, version, status, tenant_id) VALUES ${placeholders}
           ON CONFLICT (work_item_id, version, tenant_id) DO NOTHING`,
          flatValues
        );
      }
      inserted = toInsert.length;
    }

    // 3. Batch update dos registros pendentes — pg unnest parameterizado
    if (toUpdate.length > 0) {
      const ids      = toUpdate.map(r => r.work_item_id);
      const versions = toUpdate.map(r => r.version);
      const statuses = toUpdate.map(r => r.status);
      await pool.query(
        `UPDATE qa_test_records q
         SET status = upd.status, updated_at = NOW()
         FROM unnest($1::int[], $2::text[], $3::text[]) AS upd(work_item_id, version, status)
         WHERE q.work_item_id = upd.work_item_id
           AND q.version = upd.version
           AND q.status = 'pending'
           AND q.tenant_id = $4`,
        [ids, versions, statuses, req.tenantId]
      );
      updated = toUpdate.length;
    }

    // 4. Correção retroativa: downgrade done→pending para itens que não têm os DOIS campos de versão
    // (protege apenas registros futuramente editados manualmente: se qa_person estiver preenchido, preserva)
    const retrofix = await pool.query(`
      UPDATE qa_test_records q
      SET status = 'pending', updated_at = NOW()
      FROM work_items wi
      WHERE q.work_item_id = wi.work_item_id
        AND q.tenant_id = wi.tenant_id
        AND q.tenant_id = $1
        AND q.status = 'done'
        AND (q.qa_person IS NULL OR q.qa_person = '')
        AND NOT (
          -- Eventuality: só precisa de tag com versão
          (wi.type = 'Eventuality' AND wi.tags ~ '\\d+\\.\\d+\\.\\d+\\.\\d+')
          -- Demais tipos: precisa de delivered_version E tag com versão
          OR (wi.type != 'Eventuality' AND wi.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$' AND wi.tags ~ '\\d+\\.\\d+\\.\\d+\\.\\d+')
        )
    `, [req.tenantId]);
    const corrected = retrofix.rowCount ?? 0;

    const versionsProcessed = new Set(allPairs.map(p => p.version)).size;
    res.json({ versionsProcessed, inserted, updated, corrected, total: inserted + updated + corrected });
  } catch (err) {
    console.error('❌ POST /api/qa-tracker/auto-populate:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa-tracker/version-summary — resumo (done/pending/blocked) por versão
app.get('/api/qa-tracker/version-summary', authenticateToken, async (req, res) => {
  try {
    // Reutiliza a mesma lógica de /versions para obter a lista ordenada
    const tagRows = await sql`SELECT tags FROM work_items WHERE tags IS NOT NULL AND tags LIKE '%[%' AND tenant_id = ${req.tenantId}`;
    const versionSet = new Set();
    const versionPattern = /\[(\d+\.\d+\.\d+\.\d+)\]/g;
    for (const row of tagRows) {
      let m;
      while ((m = versionPattern.exec(row.tags || '')) !== null) versionSet.add(m[1]);
      versionPattern.lastIndex = 0;
    }
    const dvRows = await sql`SELECT DISTINCT delivered_version FROM work_items WHERE delivered_version IS NOT NULL AND delivered_version != '' AND tenant_id = ${req.tenantId}`;
    dvRows.forEach(r => { if (/^\d+\.\d+\.\d+\.\d+$/.test(r.delivered_version)) versionSet.add(r.delivered_version); });

    const candidates = [...versionSet].sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 4; i++) { if (pa[i] !== pb[i]) return pb[i] - pa[i]; }
      return 0;
    }).slice(0, 12); // últimas 12 versões

    const summary = [];
    for (const v of candidates) {
      const tagPattern = `%[${v}]%`;
      const itemRows = await sql`
        SELECT work_item_id FROM work_items
        WHERE (tags ILIKE ${tagPattern} OR delivered_version = ${v}) AND tenant_id = ${req.tenantId}
      `;
      const total = itemRows.length;
      if (total === 0) continue;
      const ids = itemRows.map(r => r.work_item_id);
      const recRows = await sql`
        SELECT status FROM qa_test_records
        WHERE version = ${v} AND work_item_id = ANY(${ids}) AND tenant_id = ${req.tenantId}
      `;
      const done    = recRows.filter(r => r.status === 'done').length;
      const blocked = recRows.filter(r => r.status === 'blocked').length;
      const pending = total - done - blocked;
      summary.push({ version: v, total, done, pending, blocked });
    }
    res.json(summary.reverse()); // ordem cronológica
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/version-summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ceremonies/records/overview — visão geral com métricas e filtros
app.get('/api/ceremonies/records/overview', authenticateToken, async (req, res) => {
  try {
    const { from, to, team, ritual_type, status } = req.query;
    const startDate = from || '2025-06-01';
    const endDate   = to   || new Date().toISOString().slice(0, 10);

    let rows;
    if (team && ritual_type && status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND ritual_type = ${ritual_type} AND status = ${status} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, team, ritual_type`;
    } else if (team && ritual_type) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND ritual_type = ${ritual_type} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, team, ritual_type`;
    } else if (team && status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND status = ${status} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, ritual_type`;
    } else if (ritual_type && status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND ritual_type = ${ritual_type} AND status = ${status} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, team`;
    } else if (team) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, ritual_type`;
    } else if (ritual_type) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND ritual_type = ${ritual_type} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, team`;
    } else if (status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND status = ${status} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, team, ritual_type`;
    } else {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, team, ritual_type`;
    }

    const total       = rows.length;
    const done        = rows.filter(r => r.status === 'done').length;
    const rescheduled = rows.filter(r => r.status === 'rescheduled').length;
    const cancelled   = rows.filter(r => r.status === 'cancelled').length;
    const pending     = rows.filter(r => r.status === 'pending').length;

    const byTeamMap = {};
    rows.forEach(r => {
      if (!byTeamMap[r.team]) byTeamMap[r.team] = { team: r.team, done: 0, rescheduled: 0, cancelled: 0, pending: 0, total: 0 };
      byTeamMap[r.team][r.status] = (byTeamMap[r.team][r.status] || 0) + 1;
      byTeamMap[r.team].total++;
    });

    const byRitualMap = {};
    rows.forEach(r => {
      if (!byRitualMap[r.ritual_type]) byRitualMap[r.ritual_type] = { ritual_type: r.ritual_type, done: 0, rescheduled: 0, cancelled: 0, pending: 0, total: 0 };
      byRitualMap[r.ritual_type][r.status] = (byRitualMap[r.ritual_type][r.status] || 0) + 1;
      byRitualMap[r.ritual_type].total++;
    });

    res.json({
      summary: { total, done, rescheduled, cancelled, pending },
      byTeam:   Object.values(byTeamMap).sort((a, b) => b.total - a.total),
      byRitual: Object.values(byRitualMap).sort((a, b) => b.total - a.total),
      records:  rows,
    });
  } catch (err) {
    console.error('❌ GET /api/ceremonies/records/overview:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ceremonies/records — ocorrências (params: ?team=, ?month=YYYY-MM)
app.get('/api/ceremonies/records', authenticateToken, async (req, res) => {
  try {
    const { team, month } = req.query;
    let rows;
    if (team && month) {
      const [yr, mo] = month.split('-').map(Number);
      const start = `${month}-01`;
      const lastDay = new Date(yr, mo, 0).getDate(); // dia correto do último dia
      const end = `${month}-${String(lastDay).padStart(2, '0')}`;
      rows = await sql`
        SELECT * FROM ceremony_records
        WHERE team = ${team} AND scheduled_date BETWEEN ${start}::date AND ${end}::date AND tenant_id = ${req.tenantId}
        ORDER BY scheduled_date, ritual_type
      `;
    } else if (team) {
      rows = await sql`SELECT * FROM ceremony_records WHERE team = ${team} AND tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC, ritual_type`;
    } else if (month) {
      const [yr, mo] = month.split('-').map(Number);
      const start = `${month}-01`;
      const lastDay = new Date(yr, mo, 0).getDate();
      const end = `${month}-${String(lastDay).padStart(2, '0')}`;
      rows = await sql`
        SELECT * FROM ceremony_records
        WHERE scheduled_date BETWEEN ${start}::date AND ${end}::date AND tenant_id = ${req.tenantId}
        ORDER BY team, scheduled_date, ritual_type
      `;
    } else {
      rows = await sql`SELECT * FROM ceremony_records WHERE tenant_id = ${req.tenantId} ORDER BY scheduled_date DESC LIMIT 200`;
    }
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/ceremonies/records:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ceremonies/records — registrar ocorrência
app.post('/api/ceremonies/records', authenticateToken, async (req, res) => {
  try {
    const { team, ritual_type, scheduled_date, status, reason, notes, imported_from } = req.body;
    if (!team || !ritual_type || !scheduled_date || !status) {
      return res.status(400).json({ error: 'team, ritual_type, scheduled_date e status são obrigatórios' });
    }
    const validStatuses = ['done', 'rescheduled', 'cancelled', 'pending'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    const rows = await sql`
      INSERT INTO ceremony_records (team, ritual_type, scheduled_date, status, reason, notes, imported_from, created_by, tenant_id)
      VALUES (${team}, ${ritual_type}, ${scheduled_date}::date, ${status}, ${reason || null}, ${notes || null}, ${imported_from || null}, ${req.user.username}, ${req.tenantId})
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('❌ POST /api/ceremonies/records:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ceremonies/records/:id — atualizar ocorrência
app.put('/api/ceremonies/records/:id', authenticateToken, async (req, res) => {
  try {
    const { status, reason, notes, scheduled_date } = req.body;
    const validStatuses = ['done', 'rescheduled', 'cancelled', 'pending'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    const rows = await sql`
      UPDATE ceremony_records SET
        status = COALESCE(${status || null}, status),
        reason = COALESCE(${reason !== undefined ? reason : null}, reason),
        notes  = COALESCE(${notes  !== undefined ? notes  : null}, notes),
        scheduled_date = COALESCE(${scheduled_date ? scheduled_date + '::date' : null}::date, scheduled_date),
        updated_at = NOW()
      WHERE id = ${req.params.id} AND tenant_id = ${req.tenantId}
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Registro não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ PUT /api/ceremonies/records/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ceremonies/records/:id — remover ocorrência
app.delete('/api/ceremonies/records/:id', authenticateToken, async (req, res) => {
  try {
    await sql`DELETE FROM ceremony_records WHERE id = ${req.params.id} AND tenant_id = ${req.tenantId}`;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/ceremonies/records/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ceremonies/calendar-preview — busca eventos do MS Graph (requer GRAPH_* vars)
app.get('/api/ceremonies/calendar-preview', authenticateToken, async (req, res) => {
  const { month } = req.query; // YYYY-MM
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const tenantId = process.env.GRAPH_TENANT_ID;
  const userEmail = process.env.GRAPH_USER_EMAIL;

  if (!clientId || !clientSecret || !tenantId || !userEmail) {
    return res.status(503).json({ error: 'Integração com Microsoft Graph não configurada. Defina GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID e GRAPH_USER_EMAIL no .env do backend.' });
  }

  try {
    // Client credentials flow (app-only) — requer permissão Calendars.Read do tipo Application
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenRes.data.access_token;

    const target = month || new Date().toISOString().slice(0, 7);
    const [yr, mo] = target.split('-').map(Number);
    const startDt = new Date(yr, mo - 1, 1).toISOString();
    const endDt   = new Date(yr, mo, 0, 23, 59, 59).toISOString();

    const eventsRes = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$select=subject,start,end,isOnlineMeeting,onlineMeetingProvider,organizer&$top=100&$orderby=start/dateTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const keywords = ['refinamento', 'review', 'sprint review', 'retrospectiva', 'retro', 'apresentação', 'result', 'planning', 'planing'];
    const events = (eventsRes.data.value || []).filter(ev =>
      keywords.some(kw => ev.subject?.toLowerCase().includes(kw))
    ).map(ev => ({
      id: ev.id,
      title: ev.subject,
      date: ev.start?.dateTime?.slice(0, 10),
      time: ev.start?.dateTime?.slice(11, 16),
      isTeams: ev.isOnlineMeeting && ev.onlineMeetingProvider === 'teamsForBusiness',
      organizer: ev.organizer?.emailAddress?.name,
    }));

    res.json(events);
  } catch (err) {
    console.error('❌ GET /api/ceremonies/calendar-preview:', err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// POST /api/ceremonies/calendar-import/confirm — importa eventos selecionados como records
app.post('/api/ceremonies/calendar-import/confirm', authenticateToken, async (req, res) => {
  try {
    const { events } = req.body; // [{ team, ritual_type, date, title }]
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events é obrigatório' });
    }
    const inserted = [];
    for (const ev of events) {
      if (!ev.team || !ev.ritual_type || !ev.date) continue;
      const rows = await sql`
        INSERT INTO ceremony_records (team, ritual_type, scheduled_date, status, notes, imported_from, created_by, tenant_id)
        VALUES (${ev.team}, ${ev.ritual_type}, ${ev.date}::date, 'done', ${ev.title || null}, 'calendar', ${req.user.username}, ${req.tenantId})
        ON CONFLICT DO NOTHING
        RETURNING *
      `;
      if (rows[0]) inserted.push(rows[0]);
    }
    res.status(201).json({ imported: inserted.length, records: inserted });
  } catch (err) {
    console.error('❌ POST /api/ceremonies/calendar-import/confirm:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Schedule sync every 30 minutes — roda para todos os tenants com Azure DevOps configurado
if (DATABASE_URL) {
  schedule.scheduleJob('*/30 * * * *', () => {
    console.log('🔄 Running scheduled sync (all tenants)...');
    syncAllTenants().catch(e => console.error('❌ Scheduled sync error (non-fatal):', e.message));
  });
  console.log('⏰ Scheduled sync every 30 minutes (all tenants)');
}

// Previne crash do processo por erros não capturados (ex: timeout VPS)
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection (non-fatal):', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught exception (non-fatal):', err.message);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Global error handler — always include CORS headers even on 500 errors
// Must be AFTER all route definitions for Express to use it as error middleware
// ═══════════════════════════════════════════════════════════════════════════════
app.use((err, req, res, _next) => {
  setCorsHeaders(req, res);
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  
  if (DATABASE_URL) {
    console.log('🔄 Starting initial sync (all tenants)...');
    syncAllTenants();
  }
});

// Export for Node.js
module.exports = app;
