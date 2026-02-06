// backend/server.js - PostgreSQL (Neon) version
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const schedule = require('node-schedule');
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'devops-dashboard-secret-key-2026';

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL (Neon) setup
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
console.log('✅ Database connection configured');

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

function calculateAge(changedDate) {
  if (!changedDate) return 0;
  const changed = new Date(changedDate);
  const now = new Date();
  return Math.round((now - changed) / (1000 * 60 * 60 * 24));
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
        created_by TEXT,
        po TEXT,
        ready_date TEXT,
        done_date TEXT
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
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await sql`INSERT INTO users (username, email, password, role) VALUES ('admin', 'admin@datasystem.com', ${hashedPassword}, 'admin')`;
      console.log('✅ Default admin user created (admin/admin123)');
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
        const tipoCliente = fields['Custom.TipoCliente'] || '';
        const priority = fields['Microsoft.VSTS.Common.Priority']?.toString() || '';
        const url = item._links?.html?.href || '';
        const activatedDate = fields['Microsoft.VSTS.Common.ActivatedDate'] || '';

        await sql`
          INSERT INTO work_items (work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
            created_date, changed_date, closed_date, story_points, tags, tipo_cliente, priority, url, first_activation_date, synced_at)
          VALUES (${workItemId}, ${title}, ${state}, ${type}, ${assignedTo}, ${team}, ${areaPath}, ${iterationPath},
            ${createdDate}, ${changedDate}, ${closedDate}, ${storyPoints}, ${tags}, ${tipoCliente}, ${priority}, ${url}, ${activatedDate || null}, ${new Date().toISOString()})
          ON CONFLICT (work_item_id) DO UPDATE SET
            title = EXCLUDED.title, state = EXCLUDED.state, type = EXCLUDED.type, assigned_to = EXCLUDED.assigned_to,
            team = EXCLUDED.team, area_path = EXCLUDED.area_path, iteration_path = EXCLUDED.iteration_path,
            created_date = EXCLUDED.created_date, changed_date = EXCLUDED.changed_date, closed_date = EXCLUDED.closed_date,
            story_points = EXCLUDED.story_points, tags = EXCLUDED.tags, tipo_cliente = EXCLUDED.tipo_cliente,
            priority = EXCLUDED.priority, url = EXCLUDED.url, 
            first_activation_date = COALESCE(EXCLUDED.first_activation_date, work_items.first_activation_date),
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

// Debug endpoint para verificar tabela users
app.get('/api/debug/users-schema', async (req, res) => {
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

// Endpoint para forçar inicialização do banco
app.post('/api/init-db', async (req, res) => {
  try {
    console.log('🔄 Forcing database initialization...');
    await initDatabase();
    res.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint para verificar configuração do Azure
app.get('/api/debug/azure-config', (req, res) => {
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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: DATABASE_URL ? 'PostgreSQL (Neon)' : 'Not configured',
    azureConfigured: isConfigured()
  });
});

app.get('/api/items', async (req, res) => {
  try {
    console.log('📊 GET /api/items - Fetching work items...');
    
    const rows = await sql`SELECT * FROM work_items ORDER BY changed_date DESC`;
    
    console.log(`   Found ${rows.length} items in database`);

    const items = rows.map(row => {
      const cycleTime = calculateCycleTime(row.first_activation_date, row.closed_date);
      const leadTime = calculateLeadTime(row.created_date, row.closed_date);
      const age = calculateAge(row.changed_date);

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
        doneDate: row.done_date
      };
    });

    res.json(items);
  } catch (err) {
    console.error('❌ Error in /api/items:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items/period/:days', async (req, res) => {
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
      createdDate: row.created_date,
      changedDate: row.changed_date,
      closedDate: row.closed_date,
      cycleTime: calculateCycleTime(row.first_activation_date, row.closed_date),
      leadTime: calculateLeadTime(row.created_date, row.closed_date),
      age: calculateAge(row.changed_date)
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync/status', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM sync_log ORDER BY sync_time DESC LIMIT 1`;
    res.json(rows[0] || { status: 'No sync yet' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync/log', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM sync_log ORDER BY sync_time DESC LIMIT 50`;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Manual sync triggered');
    const result = await syncData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
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
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Schedule sync every 30 minutes
if (isConfigured()) {
  schedule.scheduleJob('*/30 * * * *', () => {
    console.log('🔄 Running scheduled sync...');
    syncData();
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
  }
});

// Export for Vercel serverless
module.exports = app;
