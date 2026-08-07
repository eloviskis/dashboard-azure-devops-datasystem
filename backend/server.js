// backend/server.js - PostgreSQL version for VPS
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const schedule = require('node-schedule');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const ical = require('node-ical');
const crypto = require('crypto');
require('dotenv').config();

const emailService = require('./services/email');
const { findUserByName, getAdminEmails, isNotifiable, getReportRecipients } = require('./services/userMatch');
const { generateWeeklyInsight, generateTeamNarrative, shortenTitles } = require('./services/ai');
const { sendTeamsMessage } = require('./services/teams');

// Database driver: PostgreSQL (pg) with connection pooling
const { Pool, types } = require('pg');
// pg retorna NUMERIC/DECIMAL como string por padrão (evita perda de precisão em valores arbitrários),
// mas aqui são só horas/estimativas — sem isso, campos como original_estimate viravam string e
// quebravam contas no frontend (concatenação em vez de soma, gerando NaN em vez de número).
types.setTypeParser(1700, val => (val === null ? null : parseFloat(val)));

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
        falha_do_processo TEXT,
        linked_pr_ids TEXT,
        linked_pr_votes TEXT
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
      'bloqueio BOOLEAN DEFAULT FALSE',
      'impedimento BOOLEAN DEFAULT FALSE',
      'root_cause_legacy TEXT',
      'linked_pr_ids TEXT',
      'linked_pr_votes TEXT',
      'start_date TEXT',
      'target_date TEXT',
      'last_alerted_state TEXT'
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
        notifications_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    // Adiciona coluna tab_permissions se não existir (migração para bancos existentes)
    try {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tab_permissions TEXT DEFAULT NULL`;
    } catch (e) { /* coluna já existe */ }
    // Adiciona coluna notifications_enabled se não existir (migração para bancos existentes)
    try {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE`;
    } catch (e) { /* coluna já existe */ }
    console.log('✅ users table ready');

    // Tokens de redefinição de senha ("esqueci minha senha")
    await sql`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ password_reset_tokens table ready');

    // Log de notificações enviadas (auditoria + deduplicação de eventos "marco")
    await sql`
      CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        related_key TEXT,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('✅ notification_log table ready');

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
initDatabase();

// Azure DevOps configuration
const AZURE_CONFIG = {
  organization: (process.env.AZURE_ORG || 'your-organization').replace(/[\r\n]/g, '').trim(),
  project: (process.env.AZURE_PROJECT || 'your-project').replace(/[\r\n]/g, '').trim(),
  pat: (process.env.AZURE_PAT || 'your-token').replace(/[\r\n]/g, '').trim()
};

// Estados elegíveis pro alerta de PRs sem review do Teams (e pra busca de votos que o alimenta na sync).
// Fonte única — o gate da sync e a query do alerta usam exatamente essa lista, senão itens nos estados
// novos nunca teriam linked_pr_votes calculado.
const PR_REVIEW_ELIGIBLE_STATES = ['aguardando code review', 'fazendo code review', 'aguardando qa', 'testando qa'];

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

// A sync (via WIQL) só sabe adicionar/atualizar itens que o Azure DevOps ainda retorna — um item excluído
// lá simplesmente para de aparecer na query, e a linha local fica congelada pra sempre no último estado
// sincronizado (ex.: ainda contando como impedimento/WIP mesmo não existindo mais). A lixeira do Azure
// DevOps (recycle bin) é a fonte oficial de "isto foi excluído" — usada aqui pra remover essas linhas.
async function purgeDeletedWorkItems() {
  try {
    const response = await axios.get(
      `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/recyclebin?api-version=7.0`,
      { headers: getAuthHeader() }
    );
    const deletedIds = (response.data.value || []).map(v => v.id);
    if (!deletedIds.length) return;
    const removed = await sql`DELETE FROM work_items WHERE work_item_id = ANY(${deletedIds}) RETURNING work_item_id`;
    if (removed.length) {
      console.log(`   🗑️ Removidos ${removed.length} item(ns) excluído(s) no Azure DevOps (lixeira)`);
    }
  } catch (error) {
    // Não trava a sync — se a lixeira falhar (permissão do PAT, rede etc.), os itens excluídos só
    // continuam congelados até a próxima sync bem-sucedida dessa checagem.
    console.error('⚠️ Não foi possível checar a lixeira do Azure DevOps para remover itens excluídos:', error.message);
  }
}

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
        const bloqueio    = fields['Custom.Block']       === true; // campo renomeado no Azure DevOps (era Custom.Bloqueio)
        const categoria = fields['Custom.Category'] || fields['Custom.Categoria'] || null;
        // Campos de estimativa (Tasks) — existiam na tabela e na API, mas nunca eram lidos da sync, por
        // isso "Horas Total" no burndown do Scrum Dashboard sempre dava 0h.
        const originalEstimate = fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] ?? null;
        const remainingWork = fields['Microsoft.VSTS.Scheduling.RemainingWork'] ?? null;
        const completedWork = fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? null;
        // Datas de planejamento (Gantt por time)
        const startDate = fields['Microsoft.VSTS.Scheduling.StartDate'] || '';
        const targetDate = fields['Microsoft.VSTS.Scheduling.TargetDate'] || '';
        // Item pai (hierarquia Feature > User Story/Issue > Task) — vem de relations (Hierarchy-Reverse
        // aponta do filho pro pai), não de um campo simples. Coluna já existia mas nunca era populada.
        const parentRelation = (item.relations || []).find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
        const parentId = parentRelation ? parseInt((parentRelation.url || '').split('/').pop(), 10) || null : null;

        // Pull Requests vinculadas via link "Pull Request" no work item (relations, vem do $expand=all).
        // URL no formato vstfs:///Git/PullRequestId/{projectId}%2F{repositoryId}%2F{pullRequestId} — repositoryId
        // e pullRequestId são os dois últimos segmentos. O repositoryId é único na organização, então dá pra
        // buscar a PR direto (sem precisar do nome do projeto) mesmo quando ela vive num projeto diferente do
        // configurado em AZURE_PROJECT — foi o caso real encontrado: várias PRs vinculadas ficam em outro projeto.
        const prRelations = (item.relations || [])
          .filter(r => r.rel === 'ArtifactLink' && r.attributes?.name === 'Pull Request')
          .map(r => {
            const segments = (r.url || '').split(/%2[fF]/);
            const prId = segments[segments.length - 1];
            const repoId = segments[segments.length - 2];
            return (/^\d+$/.test(prId) && repoId) ? { repoId, prId: parseInt(prId, 10) } : null;
          })
          .filter(Boolean);
        const linkedPrIds = JSON.stringify(prRelations.map(p => p.prId));

        // Busca os votos, comentários e histórico de push da PR ao vivo — só pra itens parados em code review,
        // que é o único lugar que usa esse dado hoje (alerta do Teams). Não vale a pena pagar essas chamadas
        // extra de API por PR pra todo o board.
        let linkedPrVotes = null;
        if (prRelations.length && PR_REVIEW_ELIGIBLE_STATES.includes((state || '').toLowerCase())) {
          let chosenReviewers = null;
          let chosenMergeStatus = null;
          let chosenRepoId = null;
          let chosenPrId = null;
          let hasInactivePrs = false;
          for (const { repoId, prId } of prRelations) {
            try {
              const prDetailUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.0`;
              const prDetailRes = await axios.get(prDetailUrl, { headers: getAuthHeader() });
              // Só PR ativa conta — sem fallback pra uma já fechada/abandonada (pedido explícito: "e o PR
              // esteja como ativo"). Se nenhuma das PRs vinculadas estiver ativa, linkedPrVotes fica null,
              // igual ao caso de não ter PR nenhuma — o item some do alerta.
              if (prDetailRes.data.status !== 'active') {
                hasInactivePrs = true;
                continue;
              }
              if (!chosenReviewers) {
                chosenReviewers = (prDetailRes.data.reviewers || []).map(r => ({ name: r.displayName, vote: r.vote, isRequired: !!r.isRequired }));
                chosenMergeStatus = prDetailRes.data.mergeStatus || null;
                chosenRepoId = repoId;
                chosenPrId = prId;
              }
            } catch (err) {
              // PR pode ter sido excluída ou o PAT não ter acesso ao repositório — não trava a sync
              console.warn(`⚠️ Erro ao buscar PR ${prId} do item ${workItemId}: ${err.message}`);
            }
          }
          // Log quando há PRs vinculadas mas linkedPrVotes fica null (ajuda a debugar por que itens não aparecem)
          if (prRelations.length && !chosenReviewers) {
            console.warn(`⚠️ Item ${workItemId} "${title}" tem ${prRelations.length} PR(s) vinculada(s) mas nenhuma está ativa — não aparecerá nos alertas`);
          }

          if (chosenReviewers && chosenRepoId && chosenPrId) {
            let pushCount = null;
            let commentCount = null;
            try {
              const iterationsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${chosenRepoId}/pullrequests/${chosenPrId}/iterations?api-version=7.0`;
              const iterationsRes = await axios.get(iterationsUrl, { headers: getAuthHeader() });
              pushCount = (iterationsRes.data.value || []).length;
            } catch (err) {
              // segue sem o dado de pushes — não é crítico pro alerta
            }
            try {
              const threadsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${chosenRepoId}/pullrequests/${chosenPrId}/threads?api-version=7.0`;
              const threadsRes = await axios.get(threadsUrl, { headers: getAuthHeader() });
              // commentType 'system' são gerados automaticamente (ex: "Fulano voted 10", "Policy status has been
              // updated") — só 'text' é comentário real de humano.
              commentCount = (threadsRes.data.value || [])
                .flatMap(t => t.comments || [])
                .filter(c => c.commentType === 'text' && !c.isDeleted).length;
            } catch (err) {
              // segue sem o dado de comentários — não é crítico pro alerta
            }
            linkedPrVotes = JSON.stringify({ votes: chosenReviewers, pushCount, commentCount, mergeStatus: chosenMergeStatus });
          }
        }

        await sql`
          INSERT INTO work_items (work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
            created_date, changed_date, closed_date, story_points, tags, tipo_cliente, priority, url, first_activation_date,
            code_review_level1, code_review_level2, custom_type, root_cause_status, squad, area, complexity,
            reincidencia, performance_days, qa, causa_raiz, root_cause_legacy, created_by, po, ready_date, done_date,
            root_cause_task, root_cause_team, root_cause_version, dev, platform, application, branch_base, delivered_version, base_version,
            identificacao, falha_do_processo, impedimento, bloqueio, categoria, linked_pr_ids, linked_pr_votes,
            original_estimate, remaining_work, completed_work, start_date, target_date, parent_id, synced_at)
          VALUES (${workItemId}, ${title}, ${state}, ${type}, ${assignedTo}, ${team}, ${areaPath}, ${iterationPath},
            ${createdDate}, ${changedDate}, ${closedDate}, ${storyPoints}, ${tags}, ${tipoCliente}, ${priority}, ${url}, ${activatedDate || null},
            ${codeReviewLevel1}, ${codeReviewLevel2}, ${customType}, ${rootCauseStatus}, ${squad}, ${area}, ${complexity},
            ${reincidencia}, ${performanceDays}, ${qa}, ${causaRaiz}, ${rootCauseLegacy}, ${createdBy}, ${po}, ${readyDate}, ${doneDate},
            ${rootCauseTask}, ${rootCauseTeam}, ${rootCauseVersion}, ${dev}, ${platform}, ${application}, ${branchBase}, ${deliveredVersion}, ${baseVersion},
            ${identificacao}, ${falhaDoProcesso}, ${impedimento}, ${bloqueio}, ${categoria}, ${linkedPrIds}, ${linkedPrVotes},
            ${originalEstimate}, ${remainingWork}, ${completedWork}, ${startDate}, ${targetDate}, ${parentId}, ${new Date().toISOString()})
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
            bloqueio    = EXCLUDED.bloqueio,
            categoria = EXCLUDED.categoria,
            linked_pr_ids = EXCLUDED.linked_pr_ids,
            linked_pr_votes = EXCLUDED.linked_pr_votes,
            original_estimate = EXCLUDED.original_estimate,
            remaining_work = EXCLUDED.remaining_work,
            completed_work = EXCLUDED.completed_work,
            start_date = EXCLUDED.start_date,
            target_date = EXCLUDED.target_date,
            parent_id = EXCLUDED.parent_id,
            synced_at = EXCLUDED.synced_at
        `;
      }

      console.log(`   ✅ Saved ${allWorkItems.length} work items to database`);

      // Alertas imediatos: detecta tarefas que acabaram de entrar em estado de code review
      await checkAndSendImmediateAlerts(workItemIds);
    }

    await purgeDeletedWorkItems();

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
              isRequired: r.isRequired || false,
              isContainer: r.isContainer || false
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

// 'admin' mantém acesso elevado (requireAdmin acima). QA/PO/DEV/GESTOR/user são só etiquetas funcionais,
// usadas para rotear os relatórios automáticos por email — não alteram permissão nenhuma.
const VALID_ROLES = ['admin', 'QA', 'PO', 'DEV', 'GESTOR', 'user'];

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
        tab_permissions: user.tab_permissions ? JSON.parse(user.tab_permissions) : null,
        notifications_enabled: user.notifications_enabled !== false
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT id, username, email, role, tab_permissions, notifications_enabled FROM users WHERE id = ${req.user.id}`;
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
        notifications_enabled: u.notifications_enabled !== false,
      }
    });
  } catch {
    res.json({ valid: true, user: req.user });
  }
});

// Self-service: usuário logado liga/desliga o recebimento de notificações do QA Tracker
app.put('/api/auth/notification-preferences', authenticateToken, async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Campo "enabled" (boolean) é obrigatório' });
    }
    await sql`UPDATE users SET notifications_enabled = ${enabled}, updated_at = CURRENT_TIMESTAMP WHERE id = ${req.user.id}`;
    res.json({ notifications_enabled: enabled });
  } catch (error) {
    console.error('❌ Error updating notification preferences:', error);
    res.status(500).json({ error: 'Erro ao atualizar preferência de notificações' });
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

    const { subject, html } = emailService.passwordChangedEmail({ username: user.username });
    emailService.sendEmail({ to: user.email, subject, html, log: { sql, type: 'password_changed' } });

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('❌ Error changing password:', error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// Esqueci minha senha — solicita link de redefinição por email
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    // Resposta sempre genérica para não revelar se o email existe
    const genericResponse = { message: 'Se o email existir, você receberá um link de redefinição de senha.' };

    const users = await sql`SELECT id, username, email FROM users WHERE email = ${email}`;
    const user = users[0];
    if (!user) {
      return res.json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    await sql`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (${user.id}, ${token}, ${expiresAt})
    `;

    const resetUrl = `${emailService.FRONTEND_URL}/?reset=${token}`;
    const { subject, html } = emailService.forgotPasswordEmail({ username: user.username, resetUrl });
    emailService.sendEmail({ to: user.email, subject, html, log: { sql, type: 'password_reset_requested' } });

    res.json(genericResponse);
  } catch (error) {
    console.error('❌ Error in forgot-password:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Redefinir senha via token recebido por email
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' });
    }

    const tokens = await sql`
      SELECT * FROM password_reset_tokens
      WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
    `;
    const resetToken = tokens[0];
    if (!resetToken) {
      return res.status(400).json({ error: 'Link inválido ou expirado' });
    }

    const users = await sql`SELECT * FROM users WHERE id = ${resetToken.user_id}`;
    const user = users[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const hashedNew = bcrypt.hashSync(newPassword, 10);
    await sql`UPDATE users SET password = ${hashedNew}, updated_at = CURRENT_TIMESTAMP WHERE id = ${user.id}`;
    await sql`UPDATE password_reset_tokens SET used = TRUE WHERE id = ${resetToken.id}`;

    const { subject, html } = emailService.passwordChangedEmail({ username: user.username });
    emailService.sendEmail({ to: user.email, subject, html, log: { sql, type: 'password_reset' } });

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('❌ Error in reset-password:', error);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
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
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Cargo inválido. Use um de: ${VALID_ROLES.join(', ')}` });
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

    const { subject, html } = emailService.welcomeEmail({ username, email, tempPassword: password, role });
    emailService.sendEmail({ to: email, subject, html, log: { sql, type: 'welcome' } });

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

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Cargo inválido. Use um de: ${VALID_ROLES.join(', ')}` });
    }

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

    if (password) {
      const { subject, html } = emailService.passwordChangedEmail({ username: newUsername });
      emailService.sendEmail({ to: newEmail, subject, html, log: { sql, type: 'password_changed' } });
    }

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

// Gera uma senha temporária legível (sem caracteres ambíguos como 0/O, 1/l/I).
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[crypto.randomInt(chars.length)];
  return pw;
}

// Reenvia cadastro/senha: gera uma nova senha temporária, atualiza e envia por email.
// A senha original nunca é recuperável (só o hash é guardado), então "reenviar" na prática
// é resetar para uma nova senha temporária e notificar o usuário.
app.post('/api/users/:id/resend-credentials', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const users = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const user = users[0];

    const tempPassword = generateTempPassword();
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);
    await sql`UPDATE users SET password = ${hashedPassword}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;

    const { subject, html } = emailService.resendCredentialsEmail({ username: user.username, tempPassword, role: user.role });
    await emailService.sendEmail({ to: user.email, subject, html, log: { sql, type: 'resend_credentials' } });

    res.json({ message: 'Credenciais reenviadas com sucesso', tempPassword });
  } catch (error) {
    console.error('❌ Error resending credentials:', error);
    res.status(500).json({ error: 'Erro ao reenviar credenciais' });
  }
});

// ===========================================
// HISTÓRICO E REENVIO DE RELATÓRIOS POR EMAIL
// ===========================================

// Últimos envios registrados (quem recebeu o quê e quando) — mesma tabela usada pelo resto do sistema de notificações.
app.get('/api/notifications/history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await sql`
      SELECT type, recipient_email, related_key, sent_at
      FROM notification_log
      ORDER BY sent_at DESC
      LIMIT 200
    `;
    res.json(rows);
  } catch (error) {
    console.error('❌ Error fetching notification history:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de notificações' });
  }
});

// Reenvia o resumo diário agora, com os dados atuais (não é o conteúdo exato do último envio — roda a mesma
// lógica do cron às 8h, na hora). runAdminOverviewDigest é definida mais abaixo no arquivo (hoisting cobre isso).
app.post('/api/notifications/resend/admin-overview-digest', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { recipients } = req.body || {};
    await runAdminOverviewDigest(Array.isArray(recipients) && recipients.length ? recipients : undefined);
    res.json({ message: 'Resumo diário reenviado com sucesso' });
  } catch (error) {
    console.error('❌ Error resending admin overview digest:', error);
    res.status(500).json({ error: 'Erro ao reenviar resumo diário' });
  }
});

// Reenvia o informativo semanal agora, com os dados atuais — demora ~2min por causa do espaçamento
// entre chamadas de IA (limite da camada gratuita do Gemini).
// Body opcional: { recipients: string[] } — se informado, envia só pra esses emails em vez do mapeamento por cargo.
app.post('/api/notifications/resend/weekly-team-report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { recipients } = req.body || {};
    await runWeeklyTeamReport(Array.isArray(recipients) && recipients.length ? recipients : undefined);
    res.json({ message: 'Informativo semanal reenviado com sucesso' });
  } catch (error) {
    console.error('❌ Error resending weekly team report:', error);
    res.status(500).json({ error: 'Erro ao reenviar informativo semanal' });
  }
});

// "Testar agora" — dispara o alerta de PRs sem review pro Teams na hora, com a config atual.
// runPrReviewAlert é definida mais abaixo no arquivo (hoisting cobre isso).
app.post('/api/notifications/resend/pr-review-alert', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await runPrReviewAlert();
    res.json({ message: 'Alerta de PRs sem review disparado com sucesso' });
  } catch (error) {
    console.error('❌ Error resending PR review alert:', error);
    res.status(500).json({ error: 'Erro ao disparar alerta de PRs sem review' });
  }
});

// Testa um webhook do Teams isoladamente, com a URL que está no campo (não precisa ter salvo a config ainda).
// sendTeamsMessage é definida em services/teams.js (import já existe no topo do arquivo).
app.post('/api/notifications/teams/test-webhook', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { webhookUrl, level } = req.body;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Campo "webhookUrl" é obrigatório' });
    }
    const label = level === 2 ? 'Nível 2' : 'Nível 1';
    const message = `🧪 **Teste de conexão — ${label}**\nSe você está vendo esta mensagem, o webhook está configurado corretamente.`;
    const result = await sendTeamsMessage(webhookUrl, [message], TEAMS_FOOTER);
    if (result?.success) {
      res.json({ message: `Mensagem de teste enviada para ${label}` });
    } else {
      res.status(502).json({ error: result?.error || 'Não foi possível enviar a mensagem de teste' });
    }
  } catch (error) {
    console.error('❌ Error testing Teams webhook:', error);
    res.status(500).json({ error: 'Erro ao testar webhook' });
  }
});

// Reseta o histórico de alertas imediatos (last_alerted_state) de todos os work items
app.post('/api/notifications/reset-alert-history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await sql`UPDATE work_items SET last_alerted_state = NULL`;
    res.json({ message: 'Histórico de alertas resetado com sucesso' });
  } catch (error) {
    console.error('❌ Error resetting alert history:', error);
    res.status(500).json({ error: 'Erro ao resetar histórico de alertas' });
  }
});

// ===========================================
// APP SETTINGS ENDPOINTS
// ===========================================

// Chaves sensíveis (contêm segredos, tipo URL de webhook) — só admin pode ler, mesmo via chamada direta à API.
const ADMIN_ONLY_SETTINGS_KEYS = ['teams_pr_review_config'];

// Leitura de configuração global (qualquer usuário autenticado, exceto chaves sensíveis)
app.get('/api/settings/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    if (ADMIN_ONLY_SETTINGS_KEYS.includes(key) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
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

// Branding público (sem auth) — usado na tela de login antes de autenticar
app.get('/api/public/branding', async (req, res) => {
  try {
    const rows = await sql`SELECT key, value FROM app_settings WHERE key IN ('branding')`;
    const setting = rows[0];
    const defaults = { company_name: 'DevOps Dashboard', logo_url: '', footer_text: '', cover_url: '' };
    const branding = setting ? { ...defaults, ...JSON.parse(setting.value) } : defaults;
    res.json(branding);
  } catch {
    res.json({ company_name: 'DevOps Dashboard', logo_url: '', footer_text: '', cover_url: '' });
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
        startDate: row.start_date,
        targetDate: row.target_date,
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
      startDate: row.start_date,
      targetDate: row.target_date,
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

// Sincronizar work items específicos por ID (útil para itens fora do filtro de 180 dias)
app.post('/api/sync-work-item/:id', authenticateToken, async (req, res) => {
  if (!isConfigured() || !sql) {
    return res.status(400).json({ error: 'Azure DevOps ou banco de dados não configurado' });
  }
  
  try {
    const workItemId = parseInt(req.params.id, 10);
    if (!workItemId || workItemId <= 0) {
      return res.status(400).json({ error: 'ID de work item inválido' });
    }
    
    console.log(`🔄 Sincronizando work item específico: ${workItemId}`);
    
    const baseUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}`;
    const detailsUrl = `${baseUrl}/_apis/wit/workitems?ids=${workItemId}&$expand=all&api-version=7.0`;
    
    const detailsResponse = await axios.get(detailsUrl, { headers: getAuthHeader() });
    const items = detailsResponse.data.value || [];
    
    if (items.length === 0) {
      return res.status(404).json({ error: `Work item ${workItemId} não encontrado no Azure DevOps` });
    }
    
    // Processar o item usando a mesma lógica da sincronização normal
    const item = items[0];
    const fields = item.fields || {};
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
    const identificacao = fields['Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5'] || '';
    const falhaDoProcesso = fields['Custom.Falhadoprocesso'] || '';
    const impedimento = fields['Custom.Impedimento'] === true;
    const bloqueio = fields['Custom.Block'] === true;
    const categoria = fields['Custom.Category'] || fields['Custom.Categoria'] || null;
    const originalEstimate = fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] ?? null;
    const remainingWork = fields['Microsoft.VSTS.Scheduling.RemainingWork'] ?? null;
    const completedWork = fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? null;
    const startDate = fields['Microsoft.VSTS.Scheduling.StartDate'] || '';
    const targetDate = fields['Microsoft.VSTS.Scheduling.TargetDate'] || '';
    const parentRelation = (item.relations || []).find(r => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
    const parentId = parentRelation ? parseInt((parentRelation.url || '').split('/').pop(), 10) || null : null;
    
    const prRelations = (item.relations || [])
      .filter(r => r.rel === 'ArtifactLink' && r.attributes?.name === 'Pull Request')
      .map(r => {
        const segments = (r.url || '').split(/%2[fF]/);
        const prId = segments[segments.length - 1];
        const repoId = segments[segments.length - 2];
        return (/^\d+$/.test(prId) && repoId) ? { repoId, prId: parseInt(prId, 10) } : null;
      })
      .filter(Boolean);
    const linkedPrIds = JSON.stringify(prRelations.map(p => p.prId));
    
    let linkedPrVotes = null;
    if (prRelations.length && PR_REVIEW_ELIGIBLE_STATES.includes((state || '').toLowerCase())) {
      let chosenReviewers = null;
      let chosenMergeStatus = null;
      let chosenRepoId = null;
      let chosenPrId = null;
      for (const { repoId, prId } of prRelations) {
        try {
          const prDetailUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.0`;
          const prDetailRes = await axios.get(prDetailUrl, { headers: getAuthHeader() });
          if (prDetailRes.data.status !== 'active') continue;
          if (!chosenReviewers) {
            chosenReviewers = (prDetailRes.data.reviewers || []).map(r => ({ name: r.displayName, vote: r.vote, isRequired: !!r.isRequired }));
            chosenMergeStatus = prDetailRes.data.mergeStatus || null;
            chosenRepoId = repoId;
            chosenPrId = prId;
          }
        } catch (err) {
          console.warn(`⚠️ Erro ao buscar PR ${prId} do item ${workItemId}: ${err.message}`);
        }
      }
      
      if (chosenReviewers && chosenRepoId && chosenPrId) {
        let pushCount = null;
        let commentCount = null;
        try {
          const iterationsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${chosenRepoId}/pullrequests/${chosenPrId}/iterations?api-version=7.0`;
          const iterationsRes = await axios.get(iterationsUrl, { headers: getAuthHeader() });
          pushCount = (iterationsRes.data.value || []).length;
        } catch (err) { /* ignora */ }
        try {
          const threadsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${chosenRepoId}/pullrequests/${chosenPrId}/threads?api-version=7.0`;
          const threadsRes = await axios.get(threadsUrl, { headers: getAuthHeader() });
          commentCount = (threadsRes.data.value || [])
            .flatMap(t => t.comments || [])
            .filter(c => c.commentType === 'text' && !c.isDeleted).length;
        } catch (err) { /* ignora */ }
        linkedPrVotes = JSON.stringify({ votes: chosenReviewers, pushCount, commentCount, mergeStatus: chosenMergeStatus });
      }
    }
    
    await sql`
      INSERT INTO work_items (work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
        created_date, changed_date, closed_date, story_points, tags, tipo_cliente, priority, url, first_activation_date,
        code_review_level1, code_review_level2, custom_type, root_cause_status, squad, area, complexity,
        reincidencia, performance_days, qa, causa_raiz, root_cause_legacy, created_by, po, ready_date, done_date,
        root_cause_task, root_cause_team, root_cause_version, dev, platform, application, branch_base, delivered_version, base_version,
        identificacao, falha_do_processo, impedimento, bloqueio, categoria, linked_pr_ids, linked_pr_votes,
        original_estimate, remaining_work, completed_work, start_date, target_date, parent_id, synced_at)
      VALUES (${workItemId}, ${title}, ${state}, ${type}, ${assignedTo}, ${team}, ${areaPath}, ${iterationPath},
        ${createdDate}, ${changedDate}, ${closedDate}, ${storyPoints}, ${tags}, ${tipoCliente}, ${priority}, ${url}, ${activatedDate || null},
        ${codeReviewLevel1}, ${codeReviewLevel2}, ${customType}, ${rootCauseStatus}, ${squad}, ${area}, ${complexity},
        ${reincidencia}, ${performanceDays}, ${qa}, ${causaRaiz}, ${rootCauseLegacy}, ${createdBy}, ${po}, ${readyDate}, ${doneDate},
        ${rootCauseTask}, ${rootCauseTeam}, ${rootCauseVersion}, ${dev}, ${platform}, ${application}, ${branchBase}, ${deliveredVersion}, ${baseVersion},
        ${identificacao}, ${falhaDoProcesso}, ${impedimento}, ${bloqueio}, ${categoria}, ${linkedPrIds}, ${linkedPrVotes},
        ${originalEstimate}, ${remainingWork}, ${completedWork}, ${startDate}, ${targetDate}, ${parentId}, ${new Date().toISOString()})
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
        bloqueio = EXCLUDED.bloqueio,
        categoria = EXCLUDED.categoria,
        linked_pr_ids = EXCLUDED.linked_pr_ids,
        linked_pr_votes = EXCLUDED.linked_pr_votes,
        original_estimate = EXCLUDED.original_estimate,
        remaining_work = EXCLUDED.remaining_work,
        completed_work = EXCLUDED.completed_work,
        start_date = EXCLUDED.start_date,
        target_date = EXCLUDED.target_date,
        parent_id = EXCLUDED.parent_id,
        synced_at = EXCLUDED.synced_at
    `;
    
    console.log(`✅ Work item ${workItemId} sincronizado com sucesso`);
    res.json({ 
      success: true, 
      workItemId, 
      title, 
      state, 
      linkedPrVotes: linkedPrVotes ? JSON.parse(linkedPrVotes) : null 
    });
    
  } catch (error) {
    console.error(`❌ Erro ao sincronizar work item ${req.params.id}:`, error.message);
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
        w.impedimento, w.bloqueio, w.categoria, w.area_path,
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
      ? await sql`SELECT * FROM ceremony_config WHERE team = ${team} AND active = true ORDER BY team, ritual_type`
      : await sql`SELECT * FROM ceremony_config WHERE active = true ORDER BY team, ritual_type`;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/ceremonies/config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ceremonies/teams — times cadastrados na config
app.get('/api/ceremonies/teams', authenticateToken, async (req, res) => {
  try {
    const rows = await sql`SELECT DISTINCT team FROM ceremony_config WHERE active = true ORDER BY team`;
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
      INSERT INTO ceremony_config (team, ritual_type, frequency, active)
      VALUES (${team}, ${ritual_type}, ${frequency}, true)
      ON CONFLICT (team, ritual_type) DO UPDATE SET frequency = ${frequency}, active = true
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
    await sql`UPDATE ceremony_config SET active = false WHERE id = ${req.params.id}`;
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
      WHERE qa IS NOT NULL AND qa != ''
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
        WHERE r.work_item_id = wi.work_item_id AND r.qa_person = ${qa}
        ORDER BY r.version DESC
        LIMIT 1
      ) qtr ON true
      WHERE wi.qa = ${qa} OR qtr.id IS NOT NULL
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
        WHERE tags LIKE '%[%'
      `,
      sql`
        SELECT DISTINCT delivered_version AS version
        FROM work_items
        WHERE delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
          AND delivered_version IS NOT NULL AND delivered_version != ''
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
      WHERE tags ILIKE ${tagPattern}
         OR delivered_version = ${version}
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
      UNIQUE(work_item_id, version)
    )
  `;
}

// GET /api/qa-tracker/records?version=3.66.0.0
app.get('/api/qa-tracker/records', authenticateToken, async (req, res) => {
  try {
    await ensureQATrackerTable();
    const { version } = req.query;
    if (!version) return res.status(400).json({ error: 'version obrigatório' });
    const rows = await sql`SELECT * FROM qa_test_records WHERE version = ${version} ORDER BY work_item_id ASC`;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/records:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qa-tracker/records — upsert
// Dispara os emails de atenção do QA Tracker (bloqueado / atribuído / versão pronta).
// Nunca lança — falha de notificação não pode derrubar o salvamento do registro.
async function notifyQaRecordChange(record, previous) {
  try {
    const items = await sql`SELECT title FROM work_items WHERE work_item_id = ${record.work_item_id} LIMIT 1`;
    const workItemTitle = items[0]?.title || `Item ${record.work_item_id}`;

    const becameBlocked = record.status === 'blocked' && previous?.status !== 'blocked';
    const gotAssigned = record.qa_person && record.qa_person !== previous?.qa_person;

    if (becameBlocked) {
      const assignee = await findUserByName(sql, record.qa_person);
      const assigneeNotifiable = assignee && await isNotifiable(sql, assignee.email);
      const recipients = assigneeNotifiable ? [assignee.email] : await getAdminEmails(sql);
      const { subject, html } = emailService.qaBlockedEmail({
        recipientName: assignee?.username, workItemTitle, workItemId: record.work_item_id,
        version: record.version, obs: record.obs,
      });
      for (const to of recipients) {
        await emailService.sendEmail({ to, subject, html, log: { sql, type: 'qa_blocked', relatedKey: `${record.work_item_id}:${record.version}` } });
      }
    } else if (gotAssigned) {
      const assignee = await findUserByName(sql, record.qa_person);
      if (assignee && await isNotifiable(sql, assignee.email)) {
        const { subject, html } = emailService.qaAssignedEmail({
          recipientName: assignee.username, workItemTitle, workItemId: record.work_item_id, version: record.version,
        });
        await emailService.sendEmail({ to: assignee.email, subject, html, log: { sql, type: 'qa_assigned', relatedKey: `${record.work_item_id}:${record.version}` } });
      }
    }

    await checkVersionReady(record.version);
  } catch (err) {
    console.error('❌ notifyQaRecordChange error:', err.message);
  }
}

// Verifica se todos os itens da versão saíram de "pending" e, se sim, avisa os admins (uma única vez por versão).
async function checkVersionReady(version) {
  const rows = await sql`SELECT status FROM qa_test_records WHERE version = ${version}`;
  if (!rows.length || rows.some(r => r.status === 'pending')) return;

  const already = await sql`SELECT id FROM notification_log WHERE type = 'qa_version_ready' AND related_key = ${version}`;
  if (already.length) return;

  const doneCount = rows.filter(r => r.status === 'done').length;
  const blockedCount = rows.filter(r => r.status === 'blocked').length;
  const { subject, html } = emailService.qaVersionReadyEmail({ version, doneCount, blockedCount, totalCount: rows.length });

  const admins = await getAdminEmails(sql);
  for (const to of admins) {
    await emailService.sendEmail({ to, subject, html, log: { sql, type: 'qa_version_ready', relatedKey: version } });
  }
}

app.post('/api/qa-tracker/records', authenticateToken, async (req, res) => {
  try {
    await ensureQATrackerTable();
    const { work_item_id, version, qa_person, status, obs, cts, attachments,
            override_desc, override_client, override_tipo, override_area } = req.body;
    if (!work_item_id || !version) return res.status(400).json({ error: 'work_item_id e version obrigatórios' });

    const existing = await sql`SELECT status, qa_person FROM qa_test_records WHERE work_item_id = ${work_item_id} AND version = ${version}`;
    const previous = existing[0] || null;

    const ctsJson = JSON.stringify(cts || []);
    const attachJson = JSON.stringify(attachments || []);
    const rows = await sql`
      INSERT INTO qa_test_records
        (work_item_id, version, qa_person, status, obs, cts, attachments,
         override_desc, override_client, override_tipo, override_area, updated_at)
      VALUES
        (${work_item_id}, ${version}, ${qa_person || null}, ${status || 'pending'},
         ${obs || null}, ${ctsJson}::jsonb, ${attachJson}::jsonb,
         ${override_desc || null}, ${override_client || null}, ${override_tipo || null}, ${override_area || null}, NOW())
      ON CONFLICT (work_item_id, version) DO UPDATE SET
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
    notifyQaRecordChange(rows[0], previous);
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

    const existing = await sql`SELECT status, qa_person FROM qa_test_records WHERE id = ${req.params.id}`;
    const previous = existing[0] || null;

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
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Registro não encontrado' });
    res.json(rows[0]);
    notifyQaRecordChange(rows[0], previous);
  } catch (err) {
    console.error('❌ PUT /api/qa-tracker/records/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/qa-tracker/records/:id
app.delete('/api/qa-tracker/records/:id', authenticateToken, async (req, res) => {
  try {
    await sql`DELETE FROM qa_test_records WHERE id = ${req.params.id}`;
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
        ON qtr.work_item_id = wi.work_item_id AND qtr.version = ${version}
      WHERE wi.tags ILIKE ${tagPattern} OR wi.delivered_version = ${version}
      ORDER BY wi.priority ASC NULLS LAST, wi.work_item_id ASC
    `;
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /api/qa-tracker/version-items:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Notifica itens que viraram "blocked" durante o auto-populate em lote
async function notifyAutoPopulateBlocked(items) {
  for (const item of items) {
    try {
      const rows = await sql`
        SELECT qtr.qa_person, wi.title
        FROM qa_test_records qtr
        JOIN work_items wi ON wi.work_item_id = qtr.work_item_id
        WHERE qtr.work_item_id = ${item.work_item_id} AND qtr.version = ${item.version}
      `;
      const row = rows[0];
      if (!row) continue;
      const assignee = await findUserByName(sql, row.qa_person);
      const assigneeNotifiable = assignee && await isNotifiable(sql, assignee.email);
      const recipients = assigneeNotifiable ? [assignee.email] : await getAdminEmails(sql);
      const { subject, html } = emailService.qaBlockedEmail({
        recipientName: assignee?.username, workItemTitle: row.title,
        workItemId: item.work_item_id, version: item.version, obs: null,
      });
      for (const to of recipients) {
        await emailService.sendEmail({ to, subject, html, log: { sql, type: 'qa_blocked', relatedKey: `${item.work_item_id}:${item.version}` } });
      }
    } catch (err) {
      console.error('❌ notifyAutoPopulateBlocked item error:', err.message);
    }
  }
}

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
        WHERE tags LIKE '%[%'
        UNION
        SELECT DISTINCT delivered_version AS version, work_item_id
        FROM work_items
        WHERE delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
          AND delivered_version IS NOT NULL AND delivered_version != ''
      ) v
      JOIN work_items wi ON wi.work_item_id = v.work_item_id
      LEFT JOIN qa_test_records qtr
        ON qtr.work_item_id = v.work_item_id AND qtr.version = v.version
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
        const placeholders = chunk.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(',');
        const flatValues = chunk.flatMap(r => [r.work_item_id, r.version, r.status]);
        await pool.query(
          `INSERT INTO qa_test_records (work_item_id, version, status) VALUES ${placeholders}
           ON CONFLICT (work_item_id, version) DO NOTHING`,
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
           AND q.status = 'pending'`,
        [ids, versions, statuses]
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
        AND q.status = 'done'
        AND (q.qa_person IS NULL OR q.qa_person = '')
        AND NOT (
          -- Eventuality: só precisa de tag com versão
          (wi.type = 'Eventuality' AND wi.tags ~ '\\d+\\.\\d+\\.\\d+\\.\\d+')
          -- Demais tipos: precisa de delivered_version E tag com versão
          OR (wi.type != 'Eventuality' AND wi.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$' AND wi.tags ~ '\\d+\\.\\d+\\.\\d+\\.\\d+')
        )
    `);
    const corrected = retrofix.rowCount ?? 0;

    const versionsProcessed = new Set(allPairs.map(p => p.version)).size;
    res.json({ versionsProcessed, inserted, updated, corrected, total: inserted + updated + corrected });

    // Notificações pós-resposta: não atrasam o retorno do endpoint
    const blockedNow = toUpdate.filter(r => r.status === 'blocked');
    if (blockedNow.length) {
      notifyAutoPopulateBlocked(blockedNow).catch(e => console.error('❌ notifyAutoPopulateBlocked error:', e.message));
    }
    const affectedVersions = new Set([...toInsert, ...toUpdate].map(r => r.version));
    for (const version of affectedVersions) {
      checkVersionReady(version).catch(e => console.error('❌ checkVersionReady error:', e.message));
    }
  } catch (err) {
    console.error('❌ POST /api/qa-tracker/auto-populate:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qa-tracker/version-summary — resumo (done/pending/blocked) por versão
app.get('/api/qa-tracker/version-summary', authenticateToken, async (req, res) => {
  try {
    // Reutiliza a mesma lógica de /versions para obter a lista ordenada
    const tagRows = await sql`SELECT tags FROM work_items WHERE tags IS NOT NULL AND tags LIKE '%[%'`;
    const versionSet = new Set();
    const versionPattern = /\[(\d+\.\d+\.\d+\.\d+)\]/g;
    for (const row of tagRows) {
      let m;
      while ((m = versionPattern.exec(row.tags || '')) !== null) versionSet.add(m[1]);
      versionPattern.lastIndex = 0;
    }
    const dvRows = await sql`SELECT DISTINCT delivered_version FROM work_items WHERE delivered_version IS NOT NULL AND delivered_version != ''`;
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
        WHERE tags ILIKE ${tagPattern} OR delivered_version = ${v}
      `;
      const total = itemRows.length;
      if (total === 0) continue;
      const ids = itemRows.map(r => r.work_item_id);
      const recRows = await sql`
        SELECT status FROM qa_test_records
        WHERE version = ${v} AND work_item_id = ANY(${ids})
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
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND ritual_type = ${ritual_type} AND status = ${status} ORDER BY scheduled_date DESC, team, ritual_type`;
    } else if (team && ritual_type) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND ritual_type = ${ritual_type} ORDER BY scheduled_date DESC, team, ritual_type`;
    } else if (team && status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} AND status = ${status} ORDER BY scheduled_date DESC, ritual_type`;
    } else if (ritual_type && status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND ritual_type = ${ritual_type} AND status = ${status} ORDER BY scheduled_date DESC, team`;
    } else if (team) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND team = ${team} ORDER BY scheduled_date DESC, ritual_type`;
    } else if (ritual_type) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND ritual_type = ${ritual_type} ORDER BY scheduled_date DESC, team`;
    } else if (status) {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date AND status = ${status} ORDER BY scheduled_date DESC, team, ritual_type`;
    } else {
      rows = await sql`SELECT * FROM ceremony_records WHERE scheduled_date BETWEEN ${startDate}::date AND ${endDate}::date ORDER BY scheduled_date DESC, team, ritual_type`;
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

// DELETE /api/ceremonies/records/bulk — limpeza em massa (admin), mesmos filtros da Visão Geral.
app.delete('/api/ceremonies/records/bulk', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { from, to, team, ritual_type, status } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Período (from/to) é obrigatório' });
    let rows;
    if (team && ritual_type && status) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND team = ${team} AND ritual_type = ${ritual_type} AND status = ${status} RETURNING id`;
    } else if (team && ritual_type) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND team = ${team} AND ritual_type = ${ritual_type} RETURNING id`;
    } else if (team && status) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND team = ${team} AND status = ${status} RETURNING id`;
    } else if (ritual_type && status) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND ritual_type = ${ritual_type} AND status = ${status} RETURNING id`;
    } else if (team) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND team = ${team} RETURNING id`;
    } else if (ritual_type) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND ritual_type = ${ritual_type} RETURNING id`;
    } else if (status) {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date AND status = ${status} RETURNING id`;
    } else {
      rows = await sql`DELETE FROM ceremony_records WHERE scheduled_date BETWEEN ${from}::date AND ${to}::date RETURNING id`;
    }
    res.json({ deleted: rows.length });
  } catch (err) {
    console.error('❌ DELETE /api/ceremonies/records/bulk:', err.message);
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
        WHERE team = ${team} AND scheduled_date BETWEEN ${start}::date AND ${end}::date
        ORDER BY scheduled_date, ritual_type
      `;
    } else if (team) {
      rows = await sql`SELECT * FROM ceremony_records WHERE team = ${team} ORDER BY scheduled_date DESC, ritual_type`;
    } else if (month) {
      const [yr, mo] = month.split('-').map(Number);
      const start = `${month}-01`;
      const lastDay = new Date(yr, mo, 0).getDate();
      const end = `${month}-${String(lastDay).padStart(2, '0')}`;
      rows = await sql`
        SELECT * FROM ceremony_records
        WHERE scheduled_date BETWEEN ${start}::date AND ${end}::date
        ORDER BY team, scheduled_date, ritual_type
      `;
    } else {
      rows = await sql`SELECT * FROM ceremony_records ORDER BY scheduled_date DESC LIMIT 200`;
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
      INSERT INTO ceremony_records (team, ritual_type, scheduled_date, status, reason, notes, imported_from, created_by)
      VALUES (${team}, ${ritual_type}, ${scheduled_date}::date, ${status}, ${reason || null}, ${notes || null}, ${imported_from || null}, ${req.user.username})
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
      WHERE id = ${req.params.id}
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
    await sql`DELETE FROM ceremony_records WHERE id = ${req.params.id}`;
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
        INSERT INTO ceremony_records (team, ritual_type, scheduled_date, status, notes, imported_from, created_by)
        VALUES (${ev.team}, ${ev.ritual_type}, ${ev.date}::date, 'done', ${ev.title || null}, 'calendar', ${req.user.username})
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

// Alerta os admins após falhas consecutivas de sync (evita spam em falhas transitórias).
// syncData()/syncPullRequests() não rejeitam a Promise em erro — retornam { status: 'error' } — por isso o
// resultado precisa ser inspecionado aqui, não capturado via .catch().
let consecutiveSyncFailures = 0;
async function handleSyncResult(result, label) {
  if (result?.status === 'error') {
    consecutiveSyncFailures++;
    console.warn(`⚠️ ${label} failed (${consecutiveSyncFailures} consecutive failures)`);
    if (consecutiveSyncFailures === 3) {
      const admins = await getReportRecipients(sql, 'sync_failure');
      const { subject, html } = emailService.syncFailureEmail({ failureCount: consecutiveSyncFailures, lastError: result.message });
      for (const to of admins) {
        await emailService.sendEmail({ to, subject, html, log: { sql, type: 'sync_failure' } });
      }
    }
  } else {
    consecutiveSyncFailures = 0;
  }
}

// Schedule sync every 30 minutes
if (isConfigured()) {
  schedule.scheduleJob('*/30 * * * *', () => {
    console.log('🔄 Running scheduled sync...');
    syncData()
      .then(r => handleSyncResult(r, 'Sync'))
      .catch(e => console.error('❌ Scheduled sync error (non-fatal):', e.message));
    syncPullRequests()
      .then(r => handleSyncResult(r, 'PR Sync'))
      .catch(e => console.error('❌ Scheduled PR sync error (non-fatal):', e.message));
  });
  console.log('⏰ Scheduled sync every 30 minutes');
}

// ===========================================
// EMAIL / NOTIFICATIONS — resumo diário
// ===========================================

// Envia, para cada QA com itens pendentes/bloqueados, um resumo diário por email.
// Não envia nada para quem não tem pendências.
async function runDailyDigest() {
  try {
    const rows = await sql`
      SELECT qtr.work_item_id, qtr.version, qtr.qa_person, qtr.status, wi.title
      FROM qa_test_records qtr
      JOIN work_items wi ON wi.work_item_id = qtr.work_item_id
      WHERE qtr.status != 'done' AND qtr.qa_person IS NOT NULL AND qtr.qa_person != ''
    `;

    const byPerson = new Map();
    for (const row of rows) {
      if (!byPerson.has(row.qa_person)) byPerson.set(row.qa_person, []);
      byPerson.get(row.qa_person).push(row);
    }

    for (const [personName, items] of byPerson) {
      const user = await findUserByName(sql, personName);
      if (!user || !(await isNotifiable(sql, user.email))) continue;
      const pendingCount = items.filter(i => i.status === 'pending').length;
      const blockedCount = items.filter(i => i.status === 'blocked').length;
      const { subject, html } = emailService.dailyDigestEmail({ username: user.username, pendingCount, blockedCount, items });
      await emailService.sendEmail({ to: user.email, subject, html, log: { sql, type: 'daily_digest', relatedKey: String(user.id) } });
    }
  } catch (err) {
    console.error('❌ runDailyDigest (QA) error:', err.message);
  }

  try {
    await runAdminOverviewDigest();
  } catch (err) {
    console.error('❌ runDailyDigest (admin overview) error:', err.message);
  }
}

// Helpers de fluxo (cycle time / lead time) reaproveitados pelo resumo diário de admins e pelo informativo semanal.
const average = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
const percentile85 = (sortedArr) => {
  if (!sortedArr.length) return 0;
  const idx = Math.max(0, Math.ceil(sortedArr.length * 0.85) - 1);
  return Math.round(sortedArr[idx] * 10) / 10;
};

// rows: itens fechados com created_date/first_activation_date/closed_date.
// cycle time = fechamento - ativação (tempo realmente em andamento); lead time = fechamento - criação (tempo total).
function computeFlowTimes(rows) {
  const leadTimes = [];
  const cycleTimes = [];
  for (const r of rows) {
    const closed = new Date(r.closed_date).getTime();
    const created = new Date(r.created_date).getTime();
    const activated = r.first_activation_date ? new Date(r.first_activation_date).getTime() : created;
    const lt = Math.ceil((closed - created) / 86400000);
    const ct = Math.ceil((closed - activated) / 86400000);
    if (lt >= 0 && lt < 1000) leadTimes.push(lt);
    if (ct >= 0 && ct < 1000) cycleTimes.push(ct);
  }
  leadTimes.sort((a, b) => a - b);
  cycleTimes.sort((a, b) => a - b);
  return { leadTimes, cycleTimes };
}

// Agrega quem mais aprovou/votou em Pull Requests no período (linhas já filtradas por data pelo chamador).
// Ignora identidades de grupo (isContainer=true, ex: "[org]\Code Review", "[org]\QA Review") — não são pessoas.
// Restringe a desenvolvedores conhecidos (nomes que já apareceram em work_items.dev, o mesmo campo "Desenvolvedor"
// usado no resto do app) — sem isso, QAs e outros revisores acabam entrando no ranking de quem mais aprova código.
// Escopo conhecido: só enxerga PRs do projeto principal sincronizado (AZURE_CONFIG.project).
function getReviewEngagementLeaderboard(prRows, knownDevNames) {
  const devSet = new Set((knownDevNames || []).map(n => n.toLowerCase().trim()));
  const byName = new Map();
  for (const row of prRows) {
    let reviewers = [];
    try { reviewers = JSON.parse(row.reviewers || '[]'); } catch { /* ignora PR com reviewers inválido */ }
    for (const r of reviewers) {
      if (r.isContainer || !r.name || !r.vote) continue;
      if (!devSet.has(r.name.toLowerCase().trim())) continue;
      if (!byName.has(r.name)) byName.set(r.name, { name: r.name, approvals: 0, totalVotes: 0 });
      const entry = byName.get(r.name);
      entry.totalVotes += 1;
      if (r.vote === 10 || r.vote === 5) entry.approvals += 1;
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.approvals - a.approvals || b.totalVotes - a.totalVotes)
    .slice(0, 5);
}

// Visão geral da operação para admins: impedimentos mais antigos (mesma regra da tela "Impedimentos" —
// tags contendo "IMPEDIMENTO") + resumo simples por time (em andamento, entregues nos últimos 7 dias, bugs abertos).
// Estados "concluído" reaproveitados de GET /api/devtracker/active-tasks.
// overrideRecipients: se informado (reenvio manual pra pessoas específicas), ignora o mapeamento por cargo.
async function runAdminOverviewDigest(overrideRecipients) {
  const admins = overrideRecipients?.length ? overrideRecipients : await getReportRecipients(sql, 'admin_overview_digest');
  if (!admins.length) return;

  const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [impedimentRows, newImpedimentRows, externalBlockRows, inProgressRows, deliveredRows, bugRows, closedItemRows, reviewedPrRows, devNameRows] = await Promise.all([
    sql`
      SELECT work_item_id, title, team, assigned_to,
        GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(changed_date, created_date)::timestamp))::int AS days_stopped,
        COUNT(*) OVER() AS total_count
      FROM work_items
      WHERE tags IS NOT NULL AND UPPER(tags) LIKE '%IMPEDIMENTO%'
      ORDER BY days_stopped DESC NULLS LAST
      LIMIT 10
    `,
    // Impedimentos novos: mesma regra de tag, mas criados nos últimos 7 dias — mostrados antes da lista "mais antigos".
    sql`
      SELECT work_item_id, title, team, assigned_to,
        GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(changed_date, created_date)::timestamp))::int AS days_stopped
      FROM work_items
      WHERE tags IS NOT NULL AND UPPER(tags) LIKE '%IMPEDIMENTO%'
        AND created_date >= ${sevenDaysAgoStr}
      ORDER BY created_date DESC
    `,
    // Tarefas com Bloqueio Externo (Custom.Block no Azure DevOps) ainda em aberto.
    sql`
      SELECT work_item_id, title, team, assigned_to
      FROM work_items
      WHERE bloqueio = true
        AND state NOT IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed')
      ORDER BY team, work_item_id
    `,
    sql`
      SELECT team, COUNT(*) AS count FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND state NOT IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed')
      GROUP BY team
    `,
    sql`
      SELECT team, COUNT(*) AS count FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND state IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto')
        AND changed_date >= ${sevenDaysAgoStr}
      GROUP BY team
    `,
    sql`
      SELECT team, COUNT(*) AS count FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND type = 'Bug'
        AND state NOT IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed')
      GROUP BY team
    `,
    // Itens entregues na semana com datas para cycle time (fechamento - ativação) e lead time (fechamento - criação).
    // Mesma fórmula de fallback usada em frontend/src/hooks/useAzureDevOpsData.ts, com first_activation_date
    // como início do cycle time (tempo realmente em andamento) em vez de created_date (tempo total, isso é lead time).
    sql`
      SELECT created_date, first_activation_date, closed_date FROM work_items
      WHERE state IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto')
        AND closed_date IS NOT NULL AND created_date IS NOT NULL
        AND changed_date >= ${sevenDaysAgoStr}
    `,
    // PRs ativas ou fechadas nos últimos 7 dias, pra ranking de engajamento em code review.
    sql`
      SELECT reviewers FROM pull_requests
      WHERE created_date >= ${sevenDaysAgoStr} OR closed_date >= ${sevenDaysAgoStr}
    `,
    // Nomes já usados no campo "Desenvolvedor" (Custom.DEV) de alguma tarefa — mesma fonte usada no resto do
    // app pra identificar quem é dev, pra filtrar QAs/outros revisores fora do ranking de engajamento.
    sql`SELECT DISTINCT dev FROM work_items WHERE dev IS NOT NULL AND dev != ''`,
  ]);

  const teamMap = new Map();
  const ensureTeam = (team) => {
    if (!teamMap.has(team)) teamMap.set(team, { team, in_progress: 0, delivered_7d: 0, open_bugs: 0 });
    return teamMap.get(team);
  };
  for (const r of inProgressRows) ensureTeam(r.team).in_progress = Number(r.count);
  for (const r of deliveredRows) ensureTeam(r.team).delivered_7d = Number(r.count);
  for (const r of bugRows) ensureTeam(r.team).open_bugs = Number(r.count);
  // Só mostra times com pelo menos 1 entrega nos últimos 7 dias — times zerados não aparecem na tabela.
  const teamSummaries = [...teamMap.values()]
    .filter(t => t.delivered_7d > 0)
    .sort((a, b) => b.delivered_7d - a.delivered_7d);

  const impediments = impedimentRows.map(r => ({ ...r, days_stopped: Number(r.days_stopped) }));
  const totalImpediments = impedimentRows[0]?.total_count ? Number(impedimentRows[0].total_count) : 0;
  const newImpediments = newImpedimentRows.map(r => ({ ...r, days_stopped: Number(r.days_stopped) }));
  const externalBlocks = externalBlockRows;

  const { leadTimes, cycleTimes } = computeFlowTimes(closedItemRows);

  const flowMetrics = {
    deliveredCount: closedItemRows.length,
    cycleTimeAvg: average(cycleTimes),
    cycleTimeP85: percentile85(cycleTimes),
    leadTimeAvg: average(leadTimes),
    // Soma de todos os times (não só os com entrega, que é o que teamSummaries virou) — WIP total real da operação.
    totalWip: [...teamMap.values()].reduce((sum, t) => sum + t.in_progress, 0),
  };

  if (!teamSummaries.length && !impediments.length) return;

  const engagementLeaderboard = getReviewEngagementLeaderboard(reviewedPrRows, devNameRows.map(r => r.dev));

  const insight = await generateWeeklyInsight({
    impedimentos_total: totalImpediments,
    impedimentos_mais_antigos: impediments.slice(0, 5).map(i => ({ titulo: i.title, time: i.team, dias_parado: i.days_stopped })),
    impedimentos_novos_semana: newImpediments.map(i => ({ titulo: i.title, time: i.team, dias_parado: i.days_stopped })),
    tarefas_bloqueio_externo: externalBlocks.map(i => ({ titulo: i.title, time: i.team })),
    times: teamSummaries,
    fluxo_semanal: flowMetrics,
    ranking_engajamento_code_review: engagementLeaderboard,
  }).catch(err => { console.error('❌ generateWeeklyInsight error:', err.message); return null; });

  const { subject, html } = emailService.adminOverviewDigestEmail({ impediments, totalImpediments, newImpediments, externalBlocks, teamSummaries, flowMetrics, insight, engagementLeaderboard });
  for (const to of admins) {
    await emailService.sendEmail({ to, subject, html, log: { sql, type: 'admin_overview_digest' } });
  }
}

// Resumo diário às 8h, dias úteis
schedule.scheduleJob('0 8 * * 1-5', () => {
  console.log('📧 Running daily digest...');
  runDailyDigest().catch(e => console.error('❌ Daily digest error (non-fatal):', e.message));
});
console.log('⏰ Scheduled daily digest at 08:00 (weekdays)');

// Informativo semanal por time: ranking de entregas, composição por tipo, cycle/lead time da semana fechada,
// ritmo da semana atual com projeção até sexta, WIP, impedimentos, retrabalho e gargalo.
// Tipos considerados "entrega": User Story, Issue, Bug, Eventuality — Task/Feature/Epic/etc. ficam de fora.
// Gargalo aqui é um proxy simples (idade média no estado atual dos itens em aberto), não o algoritmo sintético
// do dashboard (que distribui o cycle time por status sem histórico real — ver azureDevOpsService.ts).
// Times cobertos pelo informativo semanal (nome no banco -> nome de exibição). Só esses entram no relatório —
// outras tags de time na base (squads internos, times legados, etc.) ficam de fora.
const REPORT_TEAMS = {
  'Sustentacao': 'Sustentação',
  'Franquia': 'Franquia/CTC',
  'Boltz': 'Boltz',
  'Inovacao_novo': 'Inovação',
  'Tatico': 'Tático',
  'Diretoria': 'Diretoria',
  'Wakanda': 'Wakanda',
  'Estrategico': 'Estratégico',
};

// Estados que realmente são coluna de algum board (Stories/Epics/Features) do time no Azure DevOps agora —
// usado pra filtrar o cálculo de gargalo. Investigado: sem isso, "state NOT IN (fechados)" pega qualquer
// state, inclusive de tipos que nunca aparecem num board Kanban (Test Case/Test Suite/Test Plan têm ciclo
// próprio — "Design"/"Ready"/"In Progress" — e um item assim pode ficar anos parado sem ser um gargalo real)
// e states legados sem coluna mapeada em User Story/Issue/Bug (ex. "Disapproved" — item rejeitado e
// esquecido). Busca ao vivo (não é sincronizado): o relatório roda só 1x/semana, não precisa de cache.
async function fetchBoardStatesByTeam(reportTeamNames) {
  const result = new Map(); // nome interno do time -> Set de states válidos (undefined = não achou o board, sem whitelist pra esse time)
  if (!isConfigured()) return result;
  try {
    const teamsRes = await axios.get(
      `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/teams?api-version=7.0-preview.3&$top=200`,
      { headers: getAuthHeader() }
    );
    const azureTeams = teamsRes.data.value || [];
    // Nome interno (extraído do Area Path) nem sempre bate exatamente com o nome do Team no Azure DevOps
    // (ex.: "Estrategico" -> "Estrategico(GOTHAM)", "Tatico" -> "Tatico (Condado)") — tenta exato, senão prefixo.
    const resolveAzureTeamName = (internalName) => {
      const normalized = internalName.toLowerCase();
      const exact = azureTeams.find(t => t.name.toLowerCase() === normalized);
      if (exact) return exact.name;
      const prefixed = azureTeams.find(t => t.name.toLowerCase().startsWith(normalized));
      return prefixed ? prefixed.name : null;
    };

    await Promise.all(reportTeamNames.map(async (teamName) => {
      const azureTeamName = resolveAzureTeamName(teamName);
      if (!azureTeamName) return;
      try {
        const boardsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${encodeURIComponent(AZURE_CONFIG.project)}/${encodeURIComponent(azureTeamName)}/_apis/work/boards`;
        const boardsRes = await axios.get(`${boardsUrl}?api-version=7.0-preview.1`, { headers: getAuthHeader() });
        const states = new Set();
        await Promise.all((boardsRes.data.value || []).map(async (board) => {
          const colsRes = await axios.get(`${boardsUrl}/${board.id}/columns?api-version=7.0-preview.1`, { headers: getAuthHeader() });
          for (const col of colsRes.data.value || []) {
            Object.values(col.stateMappings || {}).forEach(state => states.add(state));
          }
        }));
        result.set(teamName, states);
      } catch (e) {
        console.error(`⚠️ Não foi possível buscar colunas do board do time "${teamName}" (Azure: "${azureTeamName}"):`, e.message);
      }
    }));
  } catch (e) {
    console.error('⚠️ Não foi possível buscar lista de times do Azure DevOps pro gargalo do informativo semanal:', e.message);
  }
  return result;
}

// overrideRecipients: se informado (reenvio manual pra pessoas específicas), ignora o mapeamento por cargo.
async function runWeeklyTeamReport(overrideRecipients) {
  const admins = overrideRecipients?.length ? overrideRecipients : await getReportRecipients(sql, 'weekly_team_report');
  if (!admins.length) return;

  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday.getTime() - 1);

  const threeWeeksAgo = new Date(thisMonday);
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

  const closedStartStr = lastMonday.toISOString();
  const closedEndStr = lastSunday.toISOString();
  const currentStartStr = thisMonday.toISOString();
  const nowStr = now.toISOString();
  const threeWeeksAgoStr = threeWeeksAgo.toISOString();

  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const closedWeekLabel = `Semana fechada: ${fmt(lastMonday)} a ${fmt(lastSunday)}`;
  const currentWeekLabel = `Semana atual: ${fmt(thisMonday)} em andamento`;

  const [closedRows, currentRows, last3WeeksRows, openRows, impedimentRows, awaitingVersionRows] = await Promise.all([
    sql`
      SELECT team, type, closed_date, created_date, first_activation_date, reincidencia
      FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND type IN ('User Story','Issue','Bug','Eventuality')
        AND state IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto')
        AND closed_date >= ${closedStartStr} AND closed_date <= ${closedEndStr}
    `,
    sql`
      SELECT team, type
      FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND type IN ('User Story','Issue','Bug','Eventuality')
        AND state IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto')
        AND closed_date >= ${currentStartStr} AND closed_date <= ${nowStr}
    `,
    // Últimas 3 semanas cheias antes da atual — usado como base da projeção quando a semana atual
    // ainda não tem nenhuma entrega (ver `projected` abaixo).
    sql`
      SELECT team, COUNT(*) AS count FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND type IN ('User Story','Issue','Bug','Eventuality')
        AND state IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto')
        AND closed_date >= ${threeWeeksAgoStr} AND closed_date < ${currentStartStr}
      GROUP BY team
    `,
    sql`
      SELECT team, state, changed_date
      FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND state NOT IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed')
    `,
    sql`
      SELECT team, COUNT(*) AS count FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND tags IS NOT NULL AND UPPER(tags) LIKE '%IMPEDIMENTO%'
        AND state NOT IN ('Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto','Removed')
      GROUP BY team
    `,
    // Tarefas fechadas (Finished/Resolved/Closed) na semana do relatório (fechada + atual) ainda sem
    // Delivered Version — restrito à mesma janela do resto do relatório, não é o acumulado histórico
    // (testado sem esse filtro antes: números ficavam enormes, ex. 8525 num time só, sem sentido prático).
    sql`
      SELECT team, COUNT(*) AS count FROM work_items
      WHERE team IS NOT NULL AND team != ''
        AND state IN ('Finished','Resolved','Closed')
        AND (delivered_version IS NULL OR delivered_version = '')
        AND closed_date >= ${closedStartStr} AND closed_date <= ${nowStr}
      GROUP BY team
    `,
  ]);

  const teamNames = Object.keys(REPORT_TEAMS);
  const boardStatesByTeam = await fetchBoardStatesByTeam(teamNames);

  const impedimentsByTeam = new Map(impedimentRows.map(r => [r.team, Number(r.count)]));
  const awaitingVersionByTeam = new Map(awaitingVersionRows.map(r => [r.team, Number(r.count)]));
  const last3WeeksAvgByTeam = new Map(last3WeeksRows.map(r => [r.team, Math.round((Number(r.count) / 3) * 10) / 10]));

  // WIP + gargalo (idade média no estado atual, só itens em aberto)
  // ponytail: item sem toque há >6 meses é órfão/esquecido, mesmo estando num estado que é coluna válida
  // do board (ex. um card real esquecido em "Aguardando QA") — continua sendo ruído, não um gargalo ativo.
  const STALE_ITEM_THRESHOLD_DAYS = 180;
  const wipByTeam = new Map();
  const stateAgeByTeam = new Map(); // team -> Map(state -> {totalDays, count})
  for (const r of openRows) {
    wipByTeam.set(r.team, (wipByTeam.get(r.team) || 0) + 1);
    const ageDays = r.changed_date ? Math.floor((now.getTime() - new Date(r.changed_date).getTime()) / 86400000) : 0;
    if (ageDays > STALE_ITEM_THRESHOLD_DAYS) continue;
    // Só considera pro gargalo states que são coluna de algum board do time agora (fetchBoardStatesByTeam).
    // Sem whitelist resolvida pro time (Azure DevOps não encontrado), cai no comportamento anterior.
    const validStates = boardStatesByTeam.get(r.team);
    if (validStates && !validStates.has(r.state)) continue;
    if (!stateAgeByTeam.has(r.team)) stateAgeByTeam.set(r.team, new Map());
    const byState = stateAgeByTeam.get(r.team);
    const acc = byState.get(r.state) || { totalDays: 0, count: 0 };
    acc.totalDays += ageDays;
    acc.count += 1;
    byState.set(r.state, acc);
  }

  const buildComposition = (rows) => {
    const comp = { 'User Story': 0, Issue: 0, Bug: 0, Eventuality: 0 };
    for (const r of rows) comp[r.type] = (comp[r.type] || 0) + 1;
    return comp;
  };

  let workingDaysElapsed = 0;
  for (const d = new Date(thisMonday); d <= now; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) workingDaysElapsed++;
  }
  workingDaysElapsed = Math.max(1, workingDaysElapsed);

  const teams = [];
  for (const team of teamNames) {
    const closedTeamRows = closedRows.filter(r => r.team === team);
    const currentTeamRows = currentRows.filter(r => r.team === team);

    const { leadTimes, cycleTimes } = computeFlowTimes(closedTeamRows);

    const reworkCount = closedTeamRows.filter(r => {
      const n = Number(r.reincidencia);
      return !isNaN(n) && n > 0;
    }).length;
    const reworkPct = closedTeamRows.length ? Math.round((reworkCount / closedTeamRows.length) * 100) : 0;

    const currentCount = currentTeamRows.length;
    // Sem nada fechado ainda essa semana, extrapolar do ritmo atual (0) sempre daria 0 — usa a média
    // das últimas 3 semanas como estimativa em vez de um "~0" que não ajuda ninguém.
    const projected = currentCount > 0
      ? Math.round((currentCount / workingDaysElapsed) * 5)
      : Math.round(last3WeeksAvgByTeam.get(team) || 0);

    let bottleneck = null;
    const byState = stateAgeByTeam.get(team);
    if (byState) {
      for (const [state, acc] of byState) {
        const avgDays = Math.round((acc.totalDays / acc.count) * 10) / 10;
        if (!bottleneck || avgDays > bottleneck.avgDays) bottleneck = { state, avgDays };
      }
    }

    teams.push({
      team: REPORT_TEAMS[team],
      closedWeek: {
        count: closedTeamRows.length,
        composition: buildComposition(closedTeamRows),
        cycleTimeAvg: average(cycleTimes),
        cycleTimeP85: percentile85(cycleTimes),
        leadTimeAvg: average(leadTimes),
      },
      currentWeek: {
        count: currentCount,
        composition: buildComposition(currentTeamRows),
        projected,
      },
      wip: wipByTeam.get(team) || 0,
      impediments: impedimentsByTeam.get(team) || 0,
      awaitingVersion: awaitingVersionByTeam.get(team) || 0,
      reworkPct,
      bottleneck,
    });
  }

  teams.sort((a, b) => b.closedWeek.count - a.closedWeek.count);

  // Narrativa por time via IA — sequencial, com espaçamento pra respeitar o limite da camada gratuita do
  // Gemini (5 requisições/minuto pro gemini-2.5-flash) — 1.5s era curto demais e gerava erro 429.
  for (const t of teams) {
    const { recommendation, suggestedMessage } = await generateTeamNarrative({
      time: t.team,
      semana_fechada: t.closedWeek,
      semana_atual: t.currentWeek,
      wip: t.wip,
      impedimentos_ativos: t.impediments,
      aguardando_versao: t.awaitingVersion,
      retrabalho_pct: t.reworkPct,
      gargalo: t.bottleneck,
    });
    t.recommendation = recommendation;
    t.suggestedMessage = suggestedMessage;
    await new Promise(resolve => setTimeout(resolve, 13000));
  }

  const ranking = teams
    .filter(t => t.closedWeek.count > 0)
    .map(t => ({ team: t.team, closedWeekCount: t.closedWeek.count }));

  const generalReading = await generateWeeklyInsight({
    tipo: 'informativo_semanal_times',
    semana_fechada: closedWeekLabel,
    times: teams.map(t => ({
      time: t.team, entregas_semana_fechada: t.closedWeek.count, entregas_semana_atual: t.currentWeek.count,
      wip: t.wip, impedimentos: t.impediments, aguardando_versao: t.awaitingVersion, retrabalho_pct: t.reworkPct, gargalo: t.bottleneck,
    })),
  });

  const { subject, html } = emailService.weeklyTeamReportEmail({
    closedWeekLabel, currentWeekLabel, ranking, teams, generalReading,
  });
  for (const to of admins) {
    await emailService.sendEmail({ to, subject, html, log: { sql, type: 'weekly_team_report' } });
  }
}

// Informativo semanal dos times às 8h de segunda-feira
schedule.scheduleJob('0 8 * * 1', () => {
  console.log('📰 Running weekly team report...');
  runWeeklyTeamReport().catch(e => console.error('❌ Weekly team report error (non-fatal):', e.message));
});
console.log('⏰ Scheduled weekly team report at 08:00 (Mondays)');

// ===========================================
// ALERTA DE PRs SEM REVIEW (MICROSOFT TEAMS)
// ===========================================

const DEFAULT_HEADER_LEVEL1 = '🔴 **PULL REQUESTS SEM REVIEW NÍVEL 1:**';
const DEFAULT_HEADER_LEVEL2 = '🟡 **PULL REQUESTS SEM REVIEW NÍVEL 2:**';
const IMMEDIATE_HEADER_LEVEL1 = '🆕 **NOVA TAREFA AGUARDANDO CODE REVIEW NÍVEL 1:**';
const IMMEDIATE_HEADER_LEVEL2 = '🆕 **NOVA TAREFA AGUARDANDO CODE REVIEW NÍVEL 2:**';
const DEFAULT_ITEM_LINE = `📌 #{id} — {title}
🔗 [Abrir Item]({url})
👤 Autor: {author}
🗳️ {votes}
💬 {comments} · 🔄 {pushes}
🛡️ {requiredReview} · {hasApproval}
{conflictWarning}`;
const TEAMS_FOOTER = 'Notificação Automática de https://dsmetrics.online';

const PR_VOTE_LABELS = {
  10: '✅ Aprovado',
  5: '✅ Aprovado c/ sugestões',
  0: '⏳ Sem voto',
  '-5': '🔁 Aguardando autor',
  '-10': '❌ Rejeitado',
};

function formatVoteSummary(votes) {
  // A essa altura o item já passou pelo filtro linked_pr_votes IS NOT NULL — chegar aqui com array vazio
  // significa PR ativa encontrada mas sem nenhum revisor atribuído ainda, não "sem PR".
  if (!votes || !votes.length) return 'PR ativa, nenhum revisor atribuído ainda';
  const withVote = votes.filter(v => v.vote);
  if (!withVote.length) return `${votes.length} revisor(es), nenhum voto ainda`;
  const parts = withVote.map(v => `${v.name || 'Revisor'}: ${PR_VOTE_LABELS[v.vote] || 'Sem voto'}`);
  return `${withVote.length}/${votes.length} voto(s) — ${parts.join(', ')}`;
}

function formatCommentSummary(commentCount) {
  if (commentCount === null || commentCount === undefined) return 'sem dado';
  if (!commentCount) return 'sem comentários';
  return `${commentCount} comentário${commentCount > 1 ? 's' : ''}`;
}

// pushCount = quantidade de iterations (pushes) da PR. Azure DevOps não expõe um campo direto de "voto ficou
// desatualizado" — o jeito prático de sinalizar isso é: mais de 1 push feito na PR pode ter invalidado votos
// já dados (dependendo da política de branch "Reset code reviewer votes when there are new changes").
function formatPushSummary(pushCount) {
  if (pushCount === null || pushCount === undefined) return 'sem dado';
  if (pushCount <= 1) return 'sem novos commits após abertura';
  return `${pushCount} envios — pode ter revotação`;
}

// Grupo obrigatório de política de branch no Azure DevOps (ex: "[org]\Code Review") — distinto de outros
// grupos obrigatórios como "QA Review". Não há ID estável exposto pela API de reviewers pra esse grupo,
// então o casamento é por nome (aceita variação de caixa e o prefixo "[org]\").
const REQUIRED_CODE_REVIEW_NAME_RE = /code review/i;

function getRequiredCodeReviewVote(rawVotes) {
  const entry = (rawVotes || []).find(v => v.isRequired === true && REQUIRED_CODE_REVIEW_NAME_RE.test(v.name || ''));
  return entry ? entry.vote : undefined;
}

function formatRequiredReviewSummary(rawVotes) {
  const vote = getRequiredCodeReviewVote(rawVotes);
  if (vote === undefined) return 'sem grupo obrigatório configurado';
  if (vote === -10) return '❌ Rejeitado pelo grupo obrigatório "Code Review"';
  if (vote === -5) return '🔁 Aguardando autor (grupo obrigatório "Code Review")';
  if (vote > 0) return '✅ Aprovado pelo grupo obrigatório "Code Review"';
  return '⏳ Grupo obrigatório "Code Review" ainda sem voto';
}

function formatApprovalFlag(rawVotes) {
  return (rawVotes || []).some(v => v.vote > 0) ? '✅ ao menos 1 aprovação' : '⏳ nenhuma aprovação ainda';
}

function formatConflictWarning(mergeStatus) {
  return mergeStatus === 'conflicts' ? '🚫 **CONFLITO DE MERGE — resolver antes da revisão**' : '';
}

// Classifica cada tarefa num único grupo dentro da mensagem, por prioridade: conflito de merge é o mais
// urgente (bloqueia o merge, independente de revisão), depois quem já teve correção pedida, depois quem
// tem discussão em aberto, depois quem já avançou com algum voto positivo, e por fim quem ainda não teve
// nenhuma movimentação de review.
const PR_SECTION_LABELS = {
  conflito_merge: '🚫 **Conflito de merge (resolver antes da revisão):**',
  aguardando_correcoes: '🟡 **Aguardando correções:**',
  comentarios: '🟠 **Com comentários não resolvidos:**',
  com_voto: '🟢 **Já com voto:**',
  sem_voto: '🔴 **Sem nenhum voto ainda:**',
};
const PR_SECTION_ORDER = ['conflito_merge', 'aguardando_correcoes', 'comentarios', 'com_voto', 'sem_voto'];

function classifyPrItem(item) {
  if (item.rawMergeStatus === 'conflicts') return 'conflito_merge';
  const votes = item.rawVotes || [];
  if (votes.some(v => v.vote === -5 || v.vote === -10)) return 'aguardando_correcoes';
  if (item.rawCommentCount) return 'comentarios';
  if (votes.some(v => v.vote > 0)) return 'com_voto';
  return 'sem_voto';
}

function formatPrReviewLine(template, item, title) {
  return (template || DEFAULT_ITEM_LINE)
    .replaceAll('{id}', item.work_item_id)
    .replaceAll('{title}', title || item.title || 'sem título')
    .replaceAll('{url}', item.url || '')
    .replaceAll('{author}', item.assigned_to || item.dev || 'sem responsável definido')
    .replaceAll('{votes}', item.voteSummary || 'sem PR vinculada')
    .replaceAll('{comments}', item.commentSummary || 'sem dado')
    .replaceAll('{pushes}', item.pushSummary || 'sem dado')
    .replaceAll('{requiredReview}', item.requiredReviewSummary || 'sem dado')
    .replaceAll('{hasApproval}', item.approvalFlag || 'sem dado')
    .replaceAll('{conflictWarning}', item.conflictWarning || '');
}

// Alerta itens parados esperando revisão de código, separados por Nível 1 (sem revisor nível 1) e
// Nível 2 (nível 1 ok, falta nível 2), cada grupo indo pro webhook do Teams correspondente.
// Configuração (webhooks, template, IA) fica em app_settings (key='teams_pr_review_config'), editável
// pela tela "Integração com Teams" — nada disso é fixo no código.
async function runPrReviewAlert() {
  const configRows = await sql`SELECT value FROM app_settings WHERE key = 'teams_pr_review_config'`;
  if (!configRows.length) return;

  let config;
  try {
    config = JSON.parse(configRows[0].value);
  } catch (err) {
    console.error('❌ runPrReviewAlert: teams_pr_review_config inválido:', err.message);
    return;
  }

  const { webhookLevel1, webhookLevel2, header1, header2, itemLineTemplate, aiEnabled } = config;
  if (!webhookLevel1 && !webhookLevel2) return;

  const rows = await sql`
    SELECT work_item_id, title, url, dev, assigned_to, code_review_level1, code_review_level2, linked_pr_votes
    FROM work_items
    WHERE LOWER(state) = ANY(${PR_REVIEW_ELIGIBLE_STATES})
      AND linked_pr_votes IS NOT NULL
      AND type NOT IN ('Feature', 'Epic')
  `;

  // linked_pr_votes já vem pronto da sync (buscado ao vivo direto da PR pelo repositoryId — algumas PRs
  // vinculadas vivem em outro projeto do Azure DevOps, então não dá pra confiar só na tabela local pull_requests,
  // que é escopada a um único projeto). Formato: { votes: [{name, vote, isRequired}], commentCount, pushCount, mergeStatus }.
  // Linhas sincronizadas antes dessa versão podem não ter isRequired/mergeStatus — os defaults abaixo cobrem
  // isso com segurança (se autocorrige no próximo ciclo de sync).
  function attachVoteSummary(item) {
    let meta = { votes: [], commentCount: null, pushCount: null, mergeStatus: null };
    try { meta = { ...meta, ...(JSON.parse(item.linked_pr_votes || 'null') || {}) }; } catch { /* ignora PR com dado inválido */ }
    return {
      ...item,
      rawVotes: meta.votes || [],
      rawCommentCount: meta.commentCount,
      rawMergeStatus: meta.mergeStatus || null,
      voteSummary: formatVoteSummary(meta.votes),
      commentSummary: formatCommentSummary(meta.commentCount),
      pushSummary: formatPushSummary(meta.pushCount),
      requiredReviewSummary: formatRequiredReviewSummary(meta.votes),
      approvalFlag: formatApprovalFlag(meta.votes),
      conflictWarning: formatConflictWarning(meta.mergeStatus),
    };
  }

  // Base de Nível 1/2 continua vindo dos campos manuais "CR Nível 1/2" (quem foi designado revisor) —
  // isso não muda. Três regras redirecionam (nunca duplicam) tarefas pra Nível 2, restritas às que já
  // cairiam no alerta hoje — não trazem de volta tarefas que já têm os dois campos preenchidos:
  // 1) PR com conflito de merge (de qualquer nível) — já bloqueia o merge, precisa de atenção já.
  // 2) Só a partir do Nível 1: já tem voto de aprovação e nenhum comentário pendente, OU já tem voto de
  //    correção solicitada ("aguardando autor"/"rejeitado") — nos dois casos alguém já revisou de verdade,
  //    mesmo que ninguém tenha preenchido o campo manual "CR Nível 1" ainda. Deixar essas tarefas paradas
  //    no Nível 1 só polui o chat com algo que já não é mais "falta o primeiro revisor" — o objetivo agora
  //    é o grupo obrigatório "Code Review" também aprovar, que é papel do Nível 2.
  let missingLevel1 = rows.filter(r => !r.code_review_level1).map(attachVoteSummary);
  let missingLevel2 = rows.filter(r => r.code_review_level1 && !r.code_review_level2).map(attachVoteSummary);

  const isConflicted = r => r.rawMergeStatus === 'conflicts';
  const isApprovedNoComments = r => r.rawVotes.some(v => v.vote > 0) && !r.rawCommentCount;
  const isAwaitingCorrections = r => r.rawVotes.some(v => v.vote === -5 || v.vote === -10);

  const promoted = [
    ...missingLevel1.filter(r => isConflicted(r) || isApprovedNoComments(r) || isAwaitingCorrections(r)),
    ...missingLevel2.filter(isConflicted),
  ];
  if (promoted.length) {
    const promotedIds = new Set(promoted.map(r => r.work_item_id));
    missingLevel1 = missingLevel1.filter(r => !promotedIds.has(r.work_item_id));
    missingLevel2 = [...missingLevel2.filter(r => !promotedIds.has(r.work_item_id)), ...promoted];
  }

  // Quem o grupo obrigatório "Code Review" já aprovou não precisa mais aparecer no Nível 2 — o objetivo
  // dessa mensagem é justamente cobrar essa aprovação; uma vez que ela existe, manter a tarefa na lista só
  // polui o chat com algo que já foi resolvido.
  missingLevel2 = missingLevel2.filter(r => (getRequiredCodeReviewVote(r.rawVotes) ?? 0) <= 0);

  async function sendGroup(items, webhookUrl, header, logType) {
    if (!webhookUrl || !items.length) return;

    let titles = items.map(i => i.title || 'sem título');
    if (aiEnabled) {
      titles = await shortenTitles(titles).catch(err => {
        console.error('❌ shortenTitles error (non-fatal):', err.message);
        return titles;
      });
    }

    // Agrupa dentro da mesma mensagem: correções pedidas primeiro (mais urgente), depois comentários em
    // aberto, depois quem já tem voto positivo, e por último quem ainda não teve nenhum voto — cada item
    // cai só num grupo (o de maior prioridade que ele bater), pra não repetir a mesma tarefa duas vezes.
    // Cada tarefa formatada vira seu próprio bloco (pode ter várias linhas internas) — divisória só entre
    // blocos, não entre as linhas de uma mesma tarefa (ver buildAdaptiveCard em services/teams.js).
    // Cada bloco carrega o rótulo da seção atual — usado pra repetir contexto se a mensagem for dividida.
    const sectionBuckets = new Map(PR_SECTION_ORDER.map(key => [key, []]));
    items.forEach((item, idx) => {
      const itemBlock = formatPrReviewLine(itemLineTemplate, item, titles[idx]);
      sectionBuckets.get(classifyPrItem(item)).push(itemBlock);
    });

    const blockEntries = [];
    PR_SECTION_ORDER
      .filter(key => sectionBuckets.get(key).length > 0)
      .forEach(key => {
        blockEntries.push({ text: PR_SECTION_LABELS[key], label: PR_SECTION_LABELS[key] });
        sectionBuckets.get(key).forEach(itemText => blockEntries.push({ text: itemText, label: PR_SECTION_LABELS[key] }));
      });

    // O Teams (via Power Automate) tem limite prático de tamanho de card — passar disso derruba a ação
    // "Post card in a chat or channel" com RequestEntityTooLarge, silenciosamente pro nosso lado (o gatilho
    // aceita a chamada normalmente). Divide em várias mensagens quando o acumulado se aproxima do limite,
    // repetindo o cabeçalho + rótulo da seção atual no início de cada continuação.
    // O que importa pro limite é o JSON final do Adaptive Card (Container + TextBlock por linha), não o
    // texto puro — a estrutura em si já quase dobra o tamanho. blockJsonSize simula isso pra medir certo.
    const MAX_MESSAGE_BYTES = 15000;
    const blockJsonSize = text => {
      const lines = (text || '').split('\n').filter(l => l.length > 0);
      if (!lines.length) return 0;
      const container = { type: 'Container', separator: true, items: lines.map(line => ({ type: 'TextBlock', text: line, wrap: true })) };
      return Buffer.byteLength(JSON.stringify(container), 'utf8');
    };
    const sectionLabels = new Set(Object.values(PR_SECTION_LABELS));
    const headerSize = blockJsonSize(header);
    const messageChunks = [];
    let current = [header];
    let currentSize = headerSize;
    let lastLabel = null;
    for (const entry of blockEntries) {
      const entrySize = blockJsonSize(entry.text);
      if (current.length > 1 && currentSize + entrySize > MAX_MESSAGE_BYTES) {
        messageChunks.push(current);
        current = [header];
        currentSize = headerSize;
        if (lastLabel && !sectionLabels.has(entry.text)) {
          const contLabel = `${lastLabel} (continuação)`;
          current.push(contLabel);
          currentSize += blockJsonSize(contLabel);
        }
      }
      current.push(entry.text);
      currentSize += entrySize;
      lastLabel = entry.label;
    }
    messageChunks.push(current);

    if (messageChunks.length > 1) {
      messageChunks.forEach((chunk, idx) => {
        chunk[0] = `${header} (parte ${idx + 1}/${messageChunks.length})`;
      });
    }

    const results = [];
    for (const chunk of messageChunks) {
      results.push(await sendTeamsMessage(webhookUrl, chunk, TEAMS_FOOTER));
    }

    if (results.every(r => r?.success)) {
      await sql`
        INSERT INTO notification_log (type, recipient_email, related_key)
        VALUES (${logType}, ${logType === 'teams_pr_review_level1' ? 'Teams - Nível 1' : 'Teams - Nível 2'}, ${String(items.length)})
      `.catch(err => console.error('❌ notification_log insert failed:', err.message));
    } else {
      console.error(`❌ sendGroup (${logType}): nem todas as partes da mensagem foram enviadas com sucesso`, results);
    }
  }

  await sendGroup(missingLevel1, webhookLevel1, header1 || DEFAULT_HEADER_LEVEL1, 'teams_pr_review_level1');
  await sendGroup(missingLevel2, webhookLevel2, header2 || DEFAULT_HEADER_LEVEL2, 'teams_pr_review_level2');
  
  // Atualizar last_alerted_state de todos os itens alertados (para coordenar com alertas imediatos)
  for (const item of missingLevel1) {
    await sql`UPDATE work_items SET last_alerted_state = 'level1' WHERE work_item_id = ${item.work_item_id}`.catch(() => {});
  }
  for (const item of missingLevel2) {
    await sql`UPDATE work_items SET last_alerted_state = 'level2' WHERE work_item_id = ${item.work_item_id}`.catch(() => {});
  }
}

// Agendador leve: a cada 5 minutos, confere se o horário atual bate com algum horário configurado
// em teams_pr_review_config.schedule (ex: ["09:00","13:00","17:00"]). Controle em memória evita disparo
// duplicado no mesmo slot — reseta ao reiniciar o processo, o que não é crítico aqui.
let lastPrReviewAlertSlot = null;
async function checkTeamsPrReviewSchedule() {
  const configRows = await sql`SELECT value FROM app_settings WHERE key = 'teams_pr_review_config'`;
  if (!configRows.length) return;

  let config;
  try {
    config = JSON.parse(configRows[0].value);
  } catch {
    return;
  }
  const times = Array.isArray(config.schedule) ? config.schedule : [];
  if (!times.length) return;

  const now = new Date();
  // Só dispara em dia útil (segunda a sexta) — sábado (6) e domingo (0) ficam de fora.
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return;

  const currentSlot = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (!times.includes(currentSlot)) return;

  const slotId = `${now.toISOString().slice(0, 10)}T${currentSlot}`;
  if (lastPrReviewAlertSlot === slotId) return;
  lastPrReviewAlertSlot = slotId;

  console.log(`📣 Running Teams PR review alert (slot ${currentSlot})...`);
  await runPrReviewAlert();
}

schedule.scheduleJob('*/5 * * * *', () => {
  checkTeamsPrReviewSchedule().catch(e => console.error('❌ Teams PR review schedule error (non-fatal):', e.message));
});
console.log('⏰ Scheduled Teams PR review alert check every 5 minutes (horários configuráveis)');

// ===========================================
// ALERTAS IMEDIATOS (TAREFAS NOVAS)
// ===========================================

// Detecta tarefas que acabaram de entrar em estado de code review e dispara alerta imediato (se habilitado)
async function checkAndSendImmediateAlerts(workItemIds) {
  if (!sql || !workItemIds.length) return;

  // Buscar config e verificar se alertas imediatos estão habilitados
  const configRows = await sql`SELECT value FROM app_settings WHERE key = 'teams_pr_review_config'`;
  if (!configRows.length) return;

  let config;
  try {
    config = JSON.parse(configRows[0].value);
  } catch (err) {
    return;
  }

  if (!config.instantAlertsEnabled) return; // Toggle desligado

  // Buscar itens que precisam de alerta (estados elegíveis + PR ativa + não é Feature/Epic)
  const rows = await sql`
    SELECT work_item_id, title, url, dev, assigned_to, code_review_level1, code_review_level2, 
           linked_pr_votes, last_alerted_state, state, type
    FROM work_items
    WHERE work_item_id = ANY(${workItemIds})
      AND LOWER(state) = ANY(${PR_REVIEW_ELIGIBLE_STATES})
      AND linked_pr_votes IS NOT NULL
      AND type NOT IN ('Feature', 'Epic')
  `;

  for (const item of rows) {
    // Determinar nível atual (mesma lógica de runPrReviewAlert)
    let currentLevel = null;
    
    // Parse do linked_pr_votes para classificação
    let meta = { votes: [], commentCount: null, mergeStatus: null };
    try { meta = { ...meta, ...(JSON.parse(item.linked_pr_votes || 'null') || {}) }; } catch { /* ignora */ }
    
    const rawVotes = meta.votes || [];
    const rawCommentCount = meta.commentCount;
    const rawMergeStatus = meta.mergeStatus || null;
    
    const isConflicted = rawMergeStatus === 'conflicts';
    const isApprovedNoComments = rawVotes.some(v => v.vote > 0) && !rawCommentCount;
    const isAwaitingCorrections = rawVotes.some(v => v.vote === -5 || v.vote === -10);
    
    // Determinar se é Nível 1 ou Nível 2
    const baseIsLevel1 = !item.code_review_level1;
    const baseIsLevel2 = item.code_review_level1 && !item.code_review_level2;
    
    // Regras de promoção para Nível 2
    if (baseIsLevel1 && (isConflicted || isApprovedNoComments || isAwaitingCorrections)) {
      currentLevel = 'level2';
    } else if (baseIsLevel2 && isConflicted) {
      currentLevel = 'level2';
    } else if (baseIsLevel1) {
      currentLevel = 'level1';
    } else if (baseIsLevel2) {
      // Verificar se grupo obrigatório "Code Review" já aprovou
      const codeReviewVote = rawVotes.find(v => v.isRequired && v.name && v.name.includes('Code Review'));
      const hasCodeReviewApproval = codeReviewVote && codeReviewVote.vote > 0;
      if (!hasCodeReviewApproval) {
        currentLevel = 'level2';
      }
    }
    
    // Se não há nível atual (item não elegível após regras), skip
    if (!currentLevel) continue;
    
    // Verificar se é tarefa NOVA (last_alerted_state é NULL ou diferente do nível atual)
    if (item.last_alerted_state === currentLevel) {
      continue; // Já foi alertada nesse nível, skip
    }
    
    // Tarefa nova ou mudou de nível → enviar alerta imediato
    await sendImmediateAlert(item, currentLevel, config);
    
    // Atualizar last_alerted_state
    await sql`
      UPDATE work_items 
      SET last_alerted_state = ${currentLevel}
      WHERE work_item_id = ${item.work_item_id}
    `;
  }
}

// Envia alerta imediato individual para 1 tarefa
async function sendImmediateAlert(item, level, config) {
  const webhookUrl = level === 'level1' ? config.webhookLevel1 : config.webhookLevel2;
  if (!webhookUrl) return;

  const header = level === 'level1' ? IMMEDIATE_HEADER_LEVEL1 : IMMEDIATE_HEADER_LEVEL2;
  const itemLineTemplate = config.itemLineTemplate || DEFAULT_ITEM_LINE;
  
  // Parse linked_pr_votes para formatar o item
  let meta = { votes: [], commentCount: null, pushCount: null, mergeStatus: null };
  try { meta = { ...meta, ...(JSON.parse(item.linked_pr_votes || 'null') || {}) }; } catch { /* ignora */ }
  
  const enrichedItem = {
    ...item,
    rawVotes: meta.votes || [],
    rawCommentCount: meta.commentCount,
    rawMergeStatus: meta.mergeStatus || null,
    voteSummary: formatVoteSummary(meta.votes),
    commentSummary: formatCommentSummary(meta.commentCount),
    pushSummary: formatPushSummary(meta.pushCount),
    requiredReviewSummary: formatRequiredReviewSummary(meta.votes),
    approvalFlag: formatApprovalFlag(meta.votes),
    conflictWarning: formatConflictWarning(meta.mergeStatus),
  };
  
  // Encurtar título se IA habilitada
  let title = item.title || 'sem título';
  if (config.aiEnabled) {
    const shortened = await shortenTitles([title]).catch(() => [title]);
    title = shortened[0];
  }
  
  const formattedItem = formatPrReviewLine(itemLineTemplate, enrichedItem, title);
  const messageBlocks = [header, formattedItem];
  
  const result = await sendTeamsMessage(webhookUrl, messageBlocks, TEAMS_FOOTER);
  
  if (result?.success) {
    const logType = level === 'level1' ? 'teams_pr_review_immediate_level1' : 'teams_pr_review_immediate_level2';
    await sql`
      INSERT INTO notification_log (type, recipient_email, related_key)
      VALUES (${logType}, ${'Teams - Imediato ' + (level === 'level1' ? 'Nível 1' : 'Nível 2')}, ${String(item.work_item_id)})
    `.catch(err => console.error('❌ notification_log insert failed:', err.message));
  }
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

// Export for Node.js
module.exports = app;
