// backend/server.js - PostgreSQL version for VPS
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const schedule = require('node-schedule');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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
const ALLOWED_ORIGINS = [
  'https://dsmetrics.online',
  'http://dsmetrics.online',
  'https://www.dsmetrics.online',
  'http://www.dsmetrics.online',
  'https://dashboard-azure-devops-datasystem.vercel.app',
  'https://dashboard-azure-devops-datasystem-git-main-eloviskis.vercel.app',
  'https://devops-datasystem.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://187.77.55.172',
  'https://187.77.55.172'
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))) {
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

// Extract team from Area Path
function extractTeam(areaPath) {
  if (!areaPath) return 'Sem Time';
  const parts = areaPath.split('\\');
  return parts.length > 1 ? parts[parts.length - 1] : areaPath;
}

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
      'categoria TEXT'
    ];
    for (const colDef of columnsToEnsure) {
      const [colName] = colDef.split(' ');
      try {
        await sql.unsafe(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS ${colDef}`);
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
initDatabase();

// Azure DevOps configuration - remove newlines from env vars (Vercel issue)
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

// Sync Data function
async function syncData() {
  if (!isConfigured()) {
    console.log('⚠️ Azure DevOps not configured - skipping sync');
    return { status: 'skipped', message: 'Not configured' };
  }
  if (!sql) {
    console.log('⚠️ Database not configured - skipping sync');
    return { status: 'skipped', message: 'Database not configured' };
  }

  const startTime = new Date();
  console.log(`🔄 Starting sync at ${startTime.toISOString()}`);

  try {
    const baseUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}`;
    
    // Fetch Work Items usando WIQL
    const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=7.0`;
    const wiqlQuery = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${AZURE_CONFIG.project}' AND [System.ChangedDate] >= @Today - 180 ORDER BY [System.ChangedDate] DESC`
    };

    const wiqlResponse = await axios.post(wiqlUrl, wiqlQuery, { headers: getAuthHeader() });
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
        
        const detailsResponse = await axios.get(detailsUrl, { headers: getAuthHeader() });
        allWorkItems = allWorkItems.concat(detailsResponse.data.value || []);
      }

      // Salvar no banco
      // Coletar avatars dos membros durante a sync
      const memberAvatars = new Map();
      for (const item of allWorkItems) {
        const fields = item.fields || {};
        // Extrair avatar do AssignedTo
        const assignedToObj = fields['System.AssignedTo'];
        if (assignedToObj?.displayName && assignedToObj?.imageUrl) {
          memberAvatars.set(assignedToObj.displayName, assignedToObj.imageUrl);
        }
        // Extrair avatar do CreatedBy
        const createdByObj = fields['System.CreatedBy'];
        if (createdByObj?.displayName && createdByObj?.imageUrl) {
          memberAvatars.set(createdByObj.displayName, createdByObj.imageUrl);
        }
        // Extrair avatar do PO e QA
        const poObj = fields['Custom.PO'] || fields['Custom.ProductOwner'];
        if (poObj?.displayName && poObj?.imageUrl) {
          memberAvatars.set(poObj.displayName, poObj.imageUrl);
        }
        const qaObj = fields['Custom.QA'];
        if (qaObj?.displayName && qaObj?.imageUrl) {
          memberAvatars.set(qaObj.displayName, qaObj.imageUrl);
        }
      }

      // Salvar avatars no banco
      for (const [name, imageUrl] of memberAvatars) {
        try {
          await sql`
            INSERT INTO team_member_avatars (name, image_url, updated_at)
            VALUES (${name}, ${imageUrl}, CURRENT_TIMESTAMP)
            ON CONFLICT (name) DO UPDATE SET
              image_url = EXCLUDED.image_url,
              updated_at = CURRENT_TIMESTAMP
          `;
        } catch (e) { /* ignore individual errors */ }
      }
      console.log(`   Saved ${memberAvatars.size} member avatars`);

      for (const item of allWorkItems) {
        const fields = item.fields || {};
        const workItemId = item.id;
        const title = fields['System.Title'] || '';
        const state = fields['System.State'] || '';
        const type = fields['System.WorkItemType'] || '';
        const assignedTo = fields['System.AssignedTo']?.displayName || '';
        const areaPath = fields['System.AreaPath'] || '';
        const team = extractTeam(areaPath);
        const iterationPath = fields['System.IterationPath'] || '';
        const createdDate = fields['System.CreatedDate'] || '';
        const changedDate = fields['System.ChangedDate'] || '';
        const closedDate = fields['Microsoft.VSTS.Common.ClosedDate'] || '';
        const storyPoints = fields['Microsoft.VSTS.Scheduling.StoryPoints'] || null;
        const tags = fields['System.Tags'] || '';
        const tipoCliente = fields['Custom.Tipocliente'] || fields['Custom.TipoCliente'] || fields['Custom.tipocliente'] || '';
        const priority = fields['Microsoft.VSTS.Common.Priority']?.toString() || '';
        const url = item._links?.html?.href || '';
        const activatedDate = fields['Microsoft.VSTS.Common.ActivatedDate'] || '';

        // Campos customizados adicionais
        // Nível 1 e Nível 2 - campos identity com GUID no Azure DevOps
        const nivel1Field = fields['Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028'];
        const nivel2Field = fields['Custom.60cee051-7e66-4753-99d6-4bc8717fae0e'];
        const codeReviewLevel1 = nivel1Field?.displayName || (typeof nivel1Field === 'string' ? nivel1Field : '') || '';
        const codeReviewLevel2 = nivel2Field?.displayName || (typeof nivel2Field === 'string' ? nivel2Field : '') || '';
        const customType = fields['Custom.Type'] || fields['Custom.CustomType'] || '';
        const rootCauseStatus = fields['Custom.RootCauseStatus'] || fields['Custom.StatusCausaRaiz'] || '';
        const squad = fields['Custom.Squad'] || '';
        const area = fields['Custom.Area'] || '';
        const complexity = fields['Custom.Complexity'] || fields['Custom.Complexidade'] || '';
        const reincidencia = fields['Custom.REINCIDENCIA'] || fields['Custom.Reincidencia'] || fields['Custom.Reincidência'] || '';
        const performanceDays = fields['Custom.PerformanceDays'] || fields['Custom.DiasPerformance'] || '';
        const qaField = fields['Custom.QA'];
        const qa = qaField?.displayName || (typeof qaField === 'string' ? qaField : '') || '';
        const causaRaiz = fields['Custom.Raizdoproblema'] || '';
        const rootCauseLegacy = fields['Microsoft.VSTS.CMMI.RootCause'] || '';
        const createdBy = fields['System.CreatedBy']?.displayName || '';
        const poField = fields['Custom.PO'] || fields['Custom.ProductOwner'];
        const po = poField?.displayName || (typeof poField === 'string' ? poField : '') || '';
        const readyDate = fields['Custom.DOR'] || '';
        const doneDate = fields['Custom.DOD'] || '';
        // Novos campos de Root Cause
        const rootCauseTask = fields['Custom.Rootcausetask'] || '';
        const rootCauseTeam = fields['Custom.rootcauseteam'] || '';
        const rootCauseVersion = fields['Custom.rootcauseversion'] || '';
        const devField = fields['Custom.DEV'];
        const dev = devField?.displayName || (typeof devField === 'string' ? devField : '') || '';
        const platform = fields['Custom.Platform'] || '';
        const application = fields['Custom.Aplication'] || fields['Custom.Application'] || '';
        const branchBase = fields['Custom.BranchBase'] || '';
        const deliveredVersion = fields['Custom.DeliveredVersion'] || '';
        const baseVersion = fields['Custom.BaseVersion'] || '';
        // Campos de Identificação e Falha do Processo
        const identificacao = fields['Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5'] || '';
        const falhaDoProcesso = fields['Custom.Falhadoprocesso'] || '';
        const impedimento = fields['Custom.Impedimento'] === true;
        const categoria = fields['Custom.Category'] || fields['Custom.Categoria'] || null;

        await sql`
          INSERT INTO work_items (work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
            created_date, changed_date, closed_date, story_points, tags, tipo_cliente, priority, url, first_activation_date,
            code_review_level1, code_review_level2, custom_type, root_cause_status, squad, area, complexity,
            reincidencia, performance_days, qa, causa_raiz, root_cause_legacy, created_by, po, ready_date, done_date,
            root_cause_task, root_cause_team, root_cause_version, dev, platform, application, branch_base, delivered_version, base_version,
            identificacao, falha_do_processo, impedimento, categoria, synced_at)
          VALUES (${workItemId}, ${title}, ${state}, ${type}, ${assignedTo}, ${team}, ${areaPath}, ${iterationPath},
            ${createdDate}, ${changedDate}, ${closedDate}, ${storyPoints}, ${tags}, ${tipoCliente}, ${priority}, ${url}, ${activatedDate || null},
            ${codeReviewLevel1}, ${codeReviewLevel2}, ${customType}, ${rootCauseStatus}, ${squad}, ${area}, ${complexity},
            ${reincidencia}, ${performanceDays}, ${qa}, ${causaRaiz}, ${rootCauseLegacy}, ${createdBy}, ${po}, ${readyDate}, ${doneDate},
            ${rootCauseTask}, ${rootCauseTeam}, ${rootCauseVersion}, ${dev}, ${platform}, ${application}, ${branchBase}, ${deliveredVersion}, ${baseVersion},
            ${identificacao}, ${falhaDoProcesso}, ${impedimento}, ${categoria}, ${new Date().toISOString()})
          ON CONFLICT (work_item_id) DO UPDATE SET
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
            categoria = EXCLUDED.categoria,
            synced_at = EXCLUDED.synced_at
        `;
      }

      console.log(`   ✅ Saved ${allWorkItems.length} work items to database`);
    }

    // Log sync
    await sql`
      INSERT INTO sync_log (sync_time, items_count, status)
      VALUES (${new Date().toISOString()}, ${workItemIds.length}, 'success')
    `;

    const endTime = new Date();
    console.log(`✅ Sync completed in ${(endTime - startTime) / 1000}s`);

    return { status: 'success', itemsCount: workItemIds.length };
  } catch (error) {
    console.error('❌ Sync error:', error.message);
    
    if (sql) {
      await sql`
        INSERT INTO sync_log (sync_time, items_count, status, error_message)
        VALUES (${new Date().toISOString()}, 0, 'error', ${error.message})
      `;
    }
    
    return { status: 'error', message: error.message };
  }
}

// ===========================================
// PULL REQUESTS SYNC
// ===========================================

async function syncPullRequests() {
  if (!isConfigured()) {
    console.log('⚠️ Azure DevOps not configured - skipping PR sync');
    return { status: 'skipped', message: 'Not configured' };
  }
  if (!sql) {
    console.log('⚠️ Database not configured - skipping PR sync');
    return { status: 'skipped', message: 'Database not configured' };
  }

  const startTime = new Date();
  console.log(`🔄 Starting Pull Requests sync at ${startTime.toISOString()}`);

  try {
    const baseUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}`;
    
    // First get all repositories in the project
    const reposUrl = `${baseUrl}/_apis/git/repositories?api-version=7.0`;
    const reposResponse = await axios.get(reposUrl, { headers: getAuthHeader() });
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
            prResponse = await axios.get(prUrl, { headers: getAuthHeader() });
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
                has_valida_cr_label, url, synced_at)
              VALUES (${pr.pullRequestId}, ${pr.title || ''}, ${(pr.description || '').substring(0, 500)}, ${status},
                ${createdBy}, ${createdDate}, ${closedDate}, ${sourceRef}, ${targetRef},
                ${repo.id}, ${repo.name}, ${labels}, ${reviewers}, ${votes},
                ${hasValidaCR}, ${url}, ${new Date().toISOString()})
              ON CONFLICT (pull_request_id) DO UPDATE SET
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
    console.log(`✅ PR sync completed in ${(endTime - startTime) / 1000}s`);

    return { status: 'success', pullRequestsCount: totalPRs };
  } catch (error) {
    console.error('❌ PR Sync error:', error.message);
    return { status: 'error', message: error.message };
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
    const users = await sql`SELECT id, username, email, role, password IS NOT NULL as has_password FROM users`;
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
app.get('/api/debug/azure-config', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    organization: AZURE_CONFIG.organization,
    project: AZURE_CONFIG.project,
    patConfigured: !!AZURE_CONFIG.pat && AZURE_CONFIG.pat.length > 10,
    patLength: AZURE_CONFIG.pat?.length || 0,
    isConfigured: isConfigured()
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('📝 Login attempt for:', username);

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    const users = await sql`SELECT * FROM users WHERE username = ${username}`;
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
      { id: user.id, username: user.username, email: user.email, role: user.role },
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

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
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
    const users = await sql`SELECT id, username, email, role, tab_permissions, created_at, updated_at FROM users ORDER BY created_at DESC`;
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

    const existing = await sql`SELECT id FROM users WHERE username = ${username} OR email = ${email}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username ou email já existe' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const tabPermsJson = tab_permissions ? JSON.stringify(tab_permissions) : null;
    const result = await sql`
      INSERT INTO users (username, email, password, role, tab_permissions) 
      VALUES (${username}, ${email}, ${hashedPassword}, ${role}, ${tabPermsJson})
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

    const existingUsers = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const existingUser = existingUsers[0];

    if (username || email) {
      const conflict = await sql`
        SELECT id FROM users 
        WHERE (username = ${username || existingUser.username} OR email = ${email || existingUser.email}) 
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
      WHERE id = ${id}
    `;

    const updated = await sql`SELECT id, username, email, role, tab_permissions, created_at, updated_at FROM users WHERE id = ${id}`;
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

    const users = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await sql`DELETE FROM users WHERE id = ${id}`;
    res.json({ message: 'Usuário deletado com sucesso' });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
});

// ===========================================
// APP SETTINGS ENDPOINTS
// ===========================================

// Leitura de configuração global (qualquer usuário autenticado)
app.get('/api/settings/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const rows = await sql`SELECT value, updated_by, updated_at FROM app_settings WHERE key = ${key}`;
    if (rows.length === 0) {
      return res.json({ value: null });
    }
    res.json({ value: JSON.parse(rows[0].value), updated_by: rows[0].updated_by, updated_at: rows[0].updated_at });
  } catch (error) {
    console.error('❌ Error reading setting:', error);
    res.status(500).json({ error: 'Erro ao ler configuração' });
  }
});

// Escrita de configuração global (somente admin)
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
      INSERT INTO app_settings (key, value, updated_by, updated_at)
      VALUES (${key}, ${jsonValue}, ${updatedBy}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `;
    res.json({ success: true, key, updated_by: updatedBy });
  } catch (error) {
    console.error('❌ Error saving setting:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// ===========================================
// TEAM MEMBER AVATARS ENDPOINT
// ===========================================

// Buscar todos os avatars dos membros (extraídos do Azure DevOps)
app.get('/api/team-avatars', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT name, image_url, updated_at FROM team_member_avatars ORDER BY name`;
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
      environment: process.env.VERCEL ? 'Vercel Serverless' : 'Local/VPS'
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
    
    const rows = await sql`SELECT * FROM work_items ORDER BY changed_date DESC`;
    
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
        impedimento: row.impedimento || false
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
      WHERE changed_date >= ${cutoffDateStr} 
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
      impedimento: row.impedimento || false
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
    let syncLogRows = await sql`SELECT * FROM sync_log WHERE status = 'success' ORDER BY sync_time DESC LIMIT 1`;
    
    // 2. Verifica última atualização real dos work_items (sincronização externa)
    const dataCheckRows = await sql`
      SELECT 
        MAX(changed_date) as last_update,
        COUNT(*) as total_items
      FROM work_items
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
    const rows = await sql`SELECT * FROM sync_log ORDER BY sync_time DESC LIMIT 50`;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

app.post('/api/sync', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Manual sync triggered');
    const [wiResult, prResult] = await Promise.all([syncData(), syncPullRequests()]);
    res.json({ workItems: wiResult, pullRequests: prResult });
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
      sql`SELECT COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr}`,
      sql`SELECT state, COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} GROUP BY state`,
      sql`SELECT type, COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} GROUP BY type`,
      sql`SELECT team, COUNT(*) as count FROM work_items WHERE changed_date >= ${cutoffDateStr} GROUP BY team`
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
    const rows = await sql`SELECT * FROM pull_requests ORDER BY created_date DESC`;
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
    console.log('🔄 Manual PR sync triggered');
    const result = await syncPullRequests();
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
            AND w2.categoria IS NOT NULL AND w2.categoria != ''
          GROUP BY w2.categoria ORDER BY COUNT(*) DESC LIMIT 1
        ) AS categoria
      FROM work_items w
      LEFT JOIN team_member_avatars a ON LOWER(a.name) = LOWER(w.assigned_to)
      WHERE w.assigned_to IS NOT NULL AND w.assigned_to != ''
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
      const existing = await sql`SELECT id FROM devtracker_developers WHERE LOWER(name) = LOWER(${name})`;
      if (existing.length > 0) { skipped++; continue; }
      await sql`
        INSERT INTO devtracker_developers (name, role, category, active)
        VALUES (${name}, ${role}, ${category}, true)
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
      INSERT INTO devtracker_developers (name, role, email, category, client)
      VALUES (${name}, ${role}, ${email || null}, ${category}, ${client || null})
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
      WHERE id = ${id}
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
    await sql`UPDATE devtracker_developers SET active = false WHERE id = ${id}`;
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
      INSERT INTO devtracker_projects (name, client, priority, status, start_date, deadline)
      VALUES (${name}, ${client || null}, ${priority}, ${status}, ${start_date || null}, ${deadline || null})
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
      WHERE id = ${id}
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
    await sql`DELETE FROM devtracker_projects WHERE id = ${id}`;
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
      WHERE id = ${id} RETURNING *
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
    const result = await sql`
      INSERT INTO devtracker_allocations (developer_id, project_id)
      VALUES (${developer_id}, ${project_id})
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
    await sql`DELETE FROM devtracker_allocations WHERE developer_id = ${developerId} AND project_id = ${projectId}`;
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
        w.impedimento, w.categoria, w.area_path,
        f.title        AS feature_title,
        f.work_item_id AS feature_id,
        av.image_url   AS avatar_url,
        po_av.image_url AS po_avatar_url,
        qa_av.image_url AS qa_avatar_url
      FROM work_items w
      LEFT JOIN work_items f
        ON f.work_item_id = w.parent_id AND f.type = 'Feature'
      LEFT JOIN team_member_avatars av
        ON LOWER(av.name) = LOWER(w.assigned_to)
      LEFT JOIN team_member_avatars po_av
        ON LOWER(po_av.name) = LOWER(w.po)
      LEFT JOIN team_member_avatars qa_av
        ON LOWER(qa_av.name) = LOWER(w.qa)
      WHERE w.state NOT IN (
          'Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed'
        )
        AND w.assigned_to IS NOT NULL
        AND w.type NOT IN ('Feature', 'Epic')
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
           WHERE t.entity_type = 'feature' AND t.entity_id = w.work_item_id::text),
          '[]'::json
        ) AS custom_tags
      FROM work_items w
      WHERE w.type = 'Feature'
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
      INSERT INTO devtracker_tags (entity_type, entity_id, tag)
      VALUES (${entity_type}, ${String(entity_id)}, ${tag.trim()})
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
      WHERE entity_type = ${entity_type} AND entity_id = ${String(entity_id)} AND tag = ${tag}
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /api/devtracker/tags:', err.message);
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

// Schedule sync every 30 minutes
if (isConfigured()) {
  schedule.scheduleJob('*/30 * * * *', () => {
    console.log('🔄 Running scheduled sync...');
    syncData().catch(e => console.error('❌ Scheduled sync error (non-fatal):', e.message));
    syncPullRequests().catch(e => console.error('❌ Scheduled PR sync error (non-fatal):', e.message));
  });
  console.log('⏰ Scheduled sync every 30 minutes');
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
  
  if (isConfigured() && DATABASE_URL) {
    console.log('🔄 Starting initial sync...');
    syncData();
    syncPullRequests();
  }
});

// Export for Vercel serverless
module.exports = app;
