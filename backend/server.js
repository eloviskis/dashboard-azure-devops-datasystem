// backend/server.js - PostgreSQL version (compatible with Neon serverless & standard pg)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const schedule = require('node-schedule');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Database driver: use pg (node-postgres) Pool with a tagged-template-literal
// compatible `sql` function, same API as @neondatabase/serverless
const { Pool } = require('pg');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('\u274c FATAL: JWT_SECRET environment variable is required. Set it in .env or Vercel env vars.');
  process.exit(1);
}

const app = express();
app.use(cors({
  origin: [
    'https://dashboard-azure-devops-datasystem.vercel.app',
    'https://dashboard-azure-devops-datasystem-git-main-eloviskis.vercel.app',
    /\.vercel\.app$/,
    'https://devops-datasystem.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://31.97.64.250',
    'https://31.97.64.250'
  ],
  credentials: true
}));
app.use(express.json());

// PostgreSQL setup (works with local PG, Neon, Supabase, any PG-compatible DB)
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
}

let pool = null;
let sql = null;

if (DATABASE_URL) {
  // Optimized for Vercel serverless environment
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Enable SSL only for cloud providers (Neon/Supabase URLs contain 'neon' or 'supabase')
    ssl: /neon\.tech|supabase\.co/.test(DATABASE_URL) ? { rejectUnauthorized: false } : false,
    // Serverless-friendly settings: smaller pool, faster timeouts
    max: 2, // Reduced for serverless - Vercel doesn't keep connections alive
    min: 0,
    idleTimeoutMillis: 10000, // Close idle connections faster
    connectionTimeoutMillis: 5000, // Faster connection timeout
    allowExitOnIdle: true, // Allow pool to close when all connections are idle
  });

  // Tagged template literal function compatible with Neon's sql`...` API
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

// Helper functions for Neon PostgreSQL
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ users table ready');

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
        const qa = fields['Custom.QA'] || '';
        const causaRaiz = fields['Custom.Raizdoproblema'] || '';
        const rootCauseLegacy = fields['Microsoft.VSTS.CMMI.RootCause'] || '';
        const createdBy = fields['System.CreatedBy']?.displayName || '';
        const po = fields['Custom.PO'] || fields['Custom.ProductOwner'] || '';
        const readyDate = fields['Custom.DOR'] || '';
        const doneDate = fields['Custom.DoneDate'] || '';
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

        await sql`
          INSERT INTO work_items (work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
            created_date, changed_date, closed_date, story_points, tags, tipo_cliente, priority, url, first_activation_date,
            code_review_level1, code_review_level2, custom_type, root_cause_status, squad, area, complexity,
            reincidencia, performance_days, qa, causa_raiz, root_cause_legacy, created_by, po, ready_date, done_date,
            root_cause_task, root_cause_team, root_cause_version, dev, platform, application, branch_base, delivered_version, base_version,
            identificacao, falha_do_processo, synced_at)
          VALUES (${workItemId}, ${title}, ${state}, ${type}, ${assignedTo}, ${team}, ${areaPath}, ${iterationPath},
            ${createdDate}, ${changedDate}, ${closedDate}, ${storyPoints}, ${tags}, ${tipoCliente}, ${priority}, ${url}, ${activatedDate || null},
            ${codeReviewLevel1}, ${codeReviewLevel2}, ${customType}, ${rootCauseStatus}, ${squad}, ${area}, ${complexity},
            ${reincidencia}, ${performanceDays}, ${qa}, ${causaRaiz}, ${rootCauseLegacy}, ${createdBy}, ${po}, ${readyDate}, ${doneDate},
            ${rootCauseTask}, ${rootCauseTeam}, ${rootCauseVersion}, ${dev}, ${platform}, ${application}, ${branchBase}, ${deliveredVersion}, ${baseVersion},
            ${identificacao}, ${falhaDoProcesso}, ${new Date().toISOString()})
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
        role: user.role
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

// ===========================================
// USER MANAGEMENT ENDPOINTS
// ===========================================

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await sql`SELECT id, username, email, role, created_at, updated_at FROM users ORDER BY created_at DESC`;
    res.json(users);
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email e password são obrigatórios' });
    }

    const existing = await sql`SELECT id FROM users WHERE username = ${username} OR email = ${email}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username ou email já existe' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await sql`
      INSERT INTO users (username, email, password, role) 
      VALUES (${username}, ${email}, ${hashedPassword}, ${role})
      RETURNING id
    `;

    res.status(201).json({
      id: result[0].id,
      username,
      email,
      role
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

    await sql`
      UPDATE users SET 
        username = ${newUsername}, 
        email = ${newEmail}, 
        password = ${newPassword}, 
        role = ${newRole},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;

    const updated = await sql`SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ${id}`;
    res.json(updated[0]);
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
        falhaDoProcesso: row.falha_do_processo
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
      falhaDoProcesso: row.falha_do_processo
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
    syncData();
    syncPullRequests();
  });
  console.log('⏰ Scheduled sync every 30 minutes');
}

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
