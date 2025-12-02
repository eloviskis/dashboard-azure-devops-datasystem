// backend/server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const schedule = require('node-schedule');
const Database = require('better-sqlite3');
const path = require('node:path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// SQLite setup
const dbPath = path.join(__dirname, 'devops.db');
const db = new Database(dbPath);
console.log('✅ Database connected:', dbPath);

// Helper functions for better-sqlite3
const dbAllAsync = (query, params = []) => {
  try {
    return db.prepare(query).all(...params);
  } catch (err) {
    console.error('❌ Error in dbAllAsync:', err.message);
    throw err;
  }
};

const dbRunAsync = (query, params = []) => {
  try {
    const stmt = db.prepare(query);
    const info = stmt.run(...params);
    return { id: info.lastInsertRowid, changes: info.changes };
  } catch (err) {
    console.error('❌ Error in dbRunAsync:', err.message);
    throw err;
  }
};

// Extract team from Area Path
function extractTeam(areaPath) {
  if (!areaPath) return 'Sem Time';
  const parts = areaPath.split('\\');
  return parts.length > 1 ? parts[parts.length - 1] : areaPath;
}

// Generic function to calculate difference in days
function calculateDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

// Calculate cycle time (from first activation to close)
function calculateCycleTime(firstActivationDate, closedDate) {
  return calculateDaysBetween(firstActivationDate, closedDate);
}

// Calculate lead time (from creation to close)
function calculateLeadTime(createdDate, closedDate) {
  return calculateDaysBetween(createdDate, closedDate);
}

// Calculate age in days
function calculateAge(changedDate) {
  if (!changedDate) return 0;
  const changed = new Date(changedDate);
  const now = new Date();
  return Math.round((now - changed) / (1000 * 60 * 60 * 24));
}

// Initialize database
(async () => {
  // Tabela de Work Items
  dbRunAsync(`
    CREATE TABLE IF NOT EXISTS work_items (
      id INTEGER PRIMARY KEY,
      workItemId INTEGER UNIQUE,
      title TEXT,
      state TEXT,
      type TEXT,
      assignedTo TEXT,
      team TEXT,
      areaPath TEXT,
      iterationPath TEXT,
      createdDate TEXT,
      changedDate TEXT,
      closedDate TEXT,
      firstActivationDate TEXT,
      storyPoints INTEGER,
      tags TEXT,
      codeReviewLevel1 TEXT,
      codeReviewLevel2 TEXT,
      codeReviewLevel1Raw TEXT,
      codeReviewLevel2Raw TEXT,
      tipoCliente TEXT,
      url TEXT,
      syncedAt TEXT,
      priority TEXT,
      customType TEXT,
      rootCauseStatus TEXT,
      squad TEXT,
      area TEXT,
      reincidencia TEXT,
      performanceDays TEXT,
      qa TEXT,
      complexity TEXT,
      causaRaiz TEXT
    )
  `);
  console.log('✅ work_items table ready');
  
  // Adiciona novas colunas se não existirem (para bancos de dados existentes)
  const extraColumns = [
    'firstActivationDate TEXT',
    'priority TEXT',
    'customType TEXT',
    'rootCauseStatus TEXT',
    'squad TEXT',
    'area TEXT',
    'reincidencia TEXT',
    'performanceDays TEXT',
    'qa TEXT',
    'complexity TEXT',
    'causaRaiz TEXT',
    'createdBy TEXT',
    'po TEXT',
    'readyDate TEXT',
    'doneDate TEXT'
  ];
  for (const col of extraColumns) {
    const colName = col.split(' ')[0];
    try {
      dbRunAsync(`ALTER TABLE work_items ADD COLUMN ${col}`);
      console.log(`✅ "${colName}" column added to work_items table.`);
    } catch (e) {
      if (e.message.includes('duplicate column name') || e.message.includes('already exists')) {
        // Coluna já existe
      } else {
        console.error(`❌ Error adding column ${colName}:`, e.message);
      }
    }
  }


  // Tabela de Pull Requests
  dbRunAsync(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY,
      pullRequestId INTEGER UNIQUE,
      title TEXT,
      description TEXT,
      status TEXT,
      createdBy TEXT,
      createdDate TEXT,
      closedDate TEXT,
      sourceRefName TEXT,
      targetRefName TEXT,
      repositoryId TEXT,
      repositoryName TEXT,
      labels TEXT,
      reviewers TEXT,
      votes TEXT,
      hasValidaCRLabel INTEGER,
      url TEXT,
      syncedAt TEXT
    )
  `);
  console.log('✅ pull_requests table ready');

  // Tabela de Commits
  dbRunAsync(`
    CREATE TABLE IF NOT EXISTS commits (
      id INTEGER PRIMARY KEY,
      commitId TEXT UNIQUE,
      author TEXT,
      authorEmail TEXT,
      committer TEXT,
      committerEmail TEXT,
      commitDate TEXT,
      message TEXT,
      repositoryId TEXT,
      repositoryName TEXT,
      pullRequestId INTEGER,
      syncedAt TEXT
    )
  `);
  console.log('✅ commits table ready');

  // Tabela de Sync Log
  dbRunAsync(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      syncTime TEXT,
      itemsCount INTEGER,
      pullRequestsCount INTEGER,
      commitsCount INTEGER,
      status TEXT,
      errorMessage TEXT
    )
  `);
  console.log('✅ sync_log table ready');

  console.log('✅ Database initialized');
})();

// Azure DevOps configuration
const AZURE_CONFIG = {
  organization: process.env.AZURE_ORG || 'your-organization',
  project: process.env.AZURE_PROJECT || 'your-project',
  pat: process.env.AZURE_PAT || 'your-token'
};

// Validar configuração
const isConfigured = () => {
  return AZURE_CONFIG.organization !== 'your-organization' && 
         AZURE_CONFIG.project !== 'your-project' && 
         AZURE_CONFIG.pat !== 'your-token'
};

console.log('\n📋 Azure DevOps Configuration:');
console.log('   Organization:', AZURE_CONFIG.organization);
console.log('   Project:', AZURE_CONFIG.project);
console.log('   PAT:', AZURE_CONFIG.pat ? '✅ Configured' : '❌ Missing');
console.log('   Status:', isConfigured() ? '✅ Ready' : '⚠️  Not configured - using mock data\n');

const getAuthHeader = () => {
  const credentials = Buffer.from(`:${AZURE_CONFIG.pat}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
};

// Fetch work items from Azure DevOps
async function fetchWorkItems() {
  try {
    if (!isConfigured()) {
      console.log('⚠️  Azure DevOps not configured - skipping fetch');
      return [];
    }

    const wiql = `
      SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType],
             [System.AssignedTo], [System.AreaPath], [System.IterationPath], [System.CreatedDate],
             [System.ChangedDate], [Microsoft.VSTS.Common.ClosedDate], [Microsoft.VSTS.Scheduling.StoryPoints], [System.Tags]
      FROM workitems
      WHERE [System.TeamProject] = '${AZURE_CONFIG.project}'
      AND [System.State] <> 'Removed'
      AND [System.ChangedDate] >= @today - 180
      ORDER BY [System.ChangedDate] DESC
    `;

    const queryUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/wiql?api-version=7.1`;
    
    console.log('🔍 Fetching work items from:', queryUrl);
    
    const queryResponse = await axios.post(queryUrl, { query: wiql }, {
      headers: getAuthHeader(),
      timeout: 60000
    });

    console.log('✅ Query returned:', queryResponse.data.workItems?.length || 0, 'items');

    const itemIds = queryResponse.data.workItems?.map(i => i.id) || [];
    
    if (itemIds.length === 0) {
      console.log('⚠️ No work items found');
      return [];
    }

    const workItems = [];

    const batchSize = 100;
    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      
      const fields = [
        'System.Id',
        'System.Title',
        'System.State',
        'System.WorkItemType',
        'System.AssignedTo',
        'System.CreatedBy',
        'System.AreaPath',
        'System.IterationPath',
        'System.CreatedDate',
        'System.ChangedDate',
        'Microsoft.VSTS.Common.ClosedDate',
        'Microsoft.VSTS.Scheduling.StoryPoints',
        'System.Tags',
        'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028',
        'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e',
        'Custom.Tipocliente',
        'Microsoft.VSTS.Common.Priority',
        'Custom.Type',
        'Custom.RootCauseStatus',
        'Custom.Squad',
        'Custom.Area',
        'Custom.Complexity',
        'Custom.REINCIDENCIA',
        'Custom.PerformanceDays',
        'Custom.QA',
        'Custom.PO',
        'Custom.Rootcausetask',
        'Microsoft.VSTS.CMMI.RootCause',
        'Custom.DOR'
      ];
      
      const batchUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/workitems?ids=${batch.join(',')}&fields=${fields.join(',')}&api-version=7.1`;
      
      try {
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1} (items ${i} to ${Math.min(i + batchSize, itemIds.length)})`);
        
        const batchResponse = await axios.get(batchUrl, { 
          headers: getAuthHeader(),
          timeout: 60000
        });
        
        const batchItems = batchResponse.data.value || [];
        workItems.push(...batchItems);
        
        console.log(`   ✅ Batch processed: ${batchItems.length} items`);
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (batchError) {
        console.error(`❌ Error processing batch:`, batchError.message);
      }
    }

    console.log(`✅ Total work items fetched: ${workItems.length}`);
    return workItems;
  } catch (error) {
    console.error('❌ Error fetching work items:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    throw error;
  }
}

// 🆕 Função para buscar a data da primeira ativação de um item
async function findFirstActivationDate(workItemId) {
    try {
        const updatesUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/workitems/${workItemId}/updates?api-version=7.1`;
        const updatesResponse = await axios.get(updatesUrl, { headers: getAuthHeader() });
        const updates = updatesResponse.data.value || [];

        // Encontra a primeira atualização onde o estado se tornou "Active"
        const activationUpdate = updates.find(update => 
            update.fields &&
            update.fields['System.State'] &&
            update.fields['System.State'].newValue === 'Active'
        );
        
        return activationUpdate ? activationUpdate.fields['System.ChangedDate'].newValue || activationUpdate.revisedDate : null;
    } catch (error) {
        console.error(`❌ Error fetching history for item ${workItemId}:`, error.message);
        return null;
    }
}


// Process a single work item
async function processWorkItem(item) {
  const fields = item.fields || {};
  const team = extractTeam(fields['System.AreaPath']);
  
  const codeReviewLevel1Raw = fields['Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028'];
  const codeReviewLevel2Raw = fields['Custom.60cee051-7e66-4753-99d6-4bc8717fae0e'];
  const tipoClienteRaw = fields['Custom.Tipocliente'];
  
  const codeReviewLevel1 = codeReviewLevel1Raw && typeof codeReviewLevel1Raw === 'object' ? codeReviewLevel1Raw.displayName : (codeReviewLevel1Raw || null);
  const codeReviewLevel2 = codeReviewLevel2Raw && typeof codeReviewLevel2Raw === 'object' ? codeReviewLevel2Raw.displayName : (codeReviewLevel2Raw || null);
  const tipoCliente = tipoClienteRaw && typeof tipoClienteRaw === 'object' ? tipoClienteRaw.displayName : (tipoClienteRaw || null);

  // Campos customizados de Root Cause - nomes corretos do Azure DevOps
  const priority = fields['Microsoft.VSTS.Common.Priority'] || null;
  const customType = fields['Custom.Type'] || null;
  const rootCauseStatus = fields['Custom.RootCauseStatus'] || null;
  const squad = fields['Custom.Squad'] || null;
  const area = fields['Custom.Area'] || null;
  const complexity = fields['Custom.Complexity'] || null;
  const reincidencia = fields['Custom.REINCIDENCIA'] || null;
  const performanceDays = fields['Custom.PerformanceDays'] || null;
  // Campo Causa Raiz - Microsoft.VSTS.CMMI.RootCause (campo padrão CMMI)
  const causaRaiz = fields['Microsoft.VSTS.CMMI.RootCause'] || null;
  // QA e PO são objetos com displayName
  const qaRaw = fields['Custom.QA'];
  const poRaw = fields['Custom.PO'];
  const qa = qaRaw && typeof qaRaw === 'object' ? qaRaw.displayName : (qaRaw || null);
  const po = poRaw && typeof poRaw === 'object' ? poRaw.displayName : (poRaw || null);
  
  // Campo System.CreatedBy (quem criou o work item)
  const createdByRaw = fields['System.CreatedBy'];
  const createdBy = createdByRaw && typeof createdByRaw === 'object' ? createdByRaw.displayName : (createdByRaw || null);
  
  // Campo DOR (Definition of Ready) - quando o item ficou pronto para ser desenvolvido
  const readyDate = fields['Custom.DOR'] || null;
  // Campo Done - quando o item foi concluído (usando System.ClosedDate como fallback)
  const doneDate = fields['System.ClosedDate'] || null;

  const existing = await dbAllAsync('SELECT workItemId, firstActivationDate FROM work_items WHERE workItemId = ?', [item.id]);
  
  let firstActivationDate = null;
  if (existing.length > 0) {
    firstActivationDate = existing[0].firstActivationDate;
  }
  
  // Busca a data de ativação apenas se o item estiver "Active" ou além, e se ainda não tivermos a data
  if (!firstActivationDate && fields['System.State'] !== 'New' && fields['System.State'] !== 'Para Desenvolver') {
    console.log(`   -> Fetching history for item ${item.id} to find activation date...`);
    firstActivationDate = await findFirstActivationDate(item.id);
  }

  const commonParams = [
    fields['System.Title'],
    fields['System.State'],
    fields['System.WorkItemType'],
    fields['System.AssignedTo']?.displayName || null,
    team,
    fields['System.AreaPath'],
    fields['System.IterationPath'],
    fields['System.CreatedDate'],
    fields['System.ChangedDate'],
    fields['Microsoft.VSTS.Common.ClosedDate'] || null,
    firstActivationDate,
    fields['Microsoft.VSTS.Scheduling.StoryPoints'] || null,
    fields['System.Tags'] || null,
    codeReviewLevel1,
    codeReviewLevel2,
    JSON.stringify(codeReviewLevel1Raw),
    JSON.stringify(codeReviewLevel2Raw),
    tipoCliente,
    item.url,
    new Date().toISOString(),
    priority,
    customType,
    rootCauseStatus,
    squad,
    area,
    reincidencia,
    performanceDays,
    qa,
    complexity,
    causaRaiz,
    createdBy,
    po,
    readyDate,
    doneDate
  ];

  if (existing.length > 0) {
    await dbRunAsync(`
      UPDATE work_items SET
        title = ?, state = ?, type = ?, assignedTo = ?, team = ?,
        areaPath = ?, iterationPath = ?, createdDate = ?, changedDate = ?,
        closedDate = ?, firstActivationDate = ?, storyPoints = ?, tags = ?,
        codeReviewLevel1 = ?, codeReviewLevel2 = ?,
        codeReviewLevel1Raw = ?, codeReviewLevel2Raw = ?, tipoCliente = ?,
        url = ?, syncedAt = ?,
        priority = ?, customType = ?, rootCauseStatus = ?, squad = ?,
        area = ?, reincidencia = ?, performanceDays = ?, qa = ?, complexity = ?, causaRaiz = ?,
        createdBy = ?, po = ?, readyDate = ?, doneDate = ?
      WHERE workItemId = ?
    `, [...commonParams, item.id]);
    return 'updated';
  }
  
  await dbRunAsync(`
    INSERT INTO work_items (
      workItemId, title, state, type, assignedTo, team,
      areaPath, iterationPath, createdDate, changedDate,
      closedDate, firstActivationDate, storyPoints, tags, codeReviewLevel1, codeReviewLevel2,
      codeReviewLevel1Raw, codeReviewLevel2Raw, tipoCliente, url, syncedAt,
      priority, customType, rootCauseStatus, squad, area, reincidencia, performanceDays, qa, complexity, causaRaiz, createdBy, po, readyDate, doneDate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [item.id, ...commonParams]);
  return 'inserted';
}

// Sync data from Azure DevOps
async function syncData() {
  try {
    console.log('\n🔄 Starting sync...');
    
    const workItems = await fetchWorkItems();
    console.log(`📊 Processing ${workItems.length} work items...`);
    
    let itemsInserted = 0;
    let itemsUpdated = 0;

    for (const item of workItems) {
      try {
        const result = await processWorkItem(item);
        if (result === 'updated') itemsUpdated++;
        if (result === 'inserted') itemsInserted++;
      } catch (itemError) {
        console.error(`❌ Error processing item ${item.id}:`, itemError.message);
      }
    }

    console.log(`✅ Sync completed: ${itemsInserted} inserted, ${itemsUpdated} updated`);

    await dbRunAsync(`
      INSERT INTO sync_log (syncTime, itemsCount, pullRequestsCount, commitsCount, status, errorMessage)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [new Date().toISOString(), workItems.length, 0, 0, 'success', null]);

    return { success: true, itemsInserted, itemsUpdated };
  } catch (error) {
    console.error('❌ Sync error:', error.message);

    await dbRunAsync(`
      INSERT INTO sync_log (syncTime, itemsCount, pullRequestsCount, commitsCount, status, errorMessage)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [new Date().toISOString(), 0, 0, 0, 'error', error.message]);

    return { success: false, error: error.message };
  }
}

// ===========================================
// API ENDPOINTS
// ===========================================

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: dbPath,
    azureConfigured: isConfigured()
  });
});

// Get all work items with calculations
app.get('/api/items', async (req, res) => {
  try {
    console.log('📊 GET /api/items - Fetching work items...');
    
    const rows = await dbAllAsync('SELECT * FROM work_items ORDER BY changedDate DESC');
    
    console.log(`   Found ${rows.length} items in database`);

    const items = rows.map(row => {
      // 🆕 Use a data de ativação para o Cycle Time e a data de criação para o Lead Time
      const cycleTime = calculateCycleTime(row.firstActivationDate, row.closedDate);
      const leadTime = calculateLeadTime(row.createdDate, row.closedDate);
      const age = calculateAge(row.changedDate);

      // Parse code reviewer fields
      let codeReviewLevel1Field = null;
      let codeReviewLevel2Field = null;
      
      try {
        if (row.codeReviewLevel1Raw && row.codeReviewLevel1Raw !== 'null') {
          codeReviewLevel1Field = JSON.parse(row.codeReviewLevel1Raw);
        }
        if (row.codeReviewLevel2Raw && row.codeReviewLevel2Raw !== 'null') {
          codeReviewLevel2Field = JSON.parse(row.codeReviewLevel2Raw);
        }
      } catch (e) {
        console.warn(`⚠️ Failed to parse code review fields for workItem ${row.workItemId || 'unknown'}:`, e.message);
        codeReviewLevel1Field = null;
        codeReviewLevel2Field = null;
      }

      return {
        workItemId: row.workItemId,
        title: row.title,
        state: row.state,
        type: row.type,
        assignedTo: row.assignedTo,
        team: row.team,
        areaPath: row.areaPath,
        iterationPath: row.iterationPath,
        createdDate: row.createdDate,
        changedDate: row.changedDate,
        closedDate: row.closedDate,
        storyPoints: row.storyPoints,
        tags: row.tags,
        cycleTime,
        leadTime,
        age,
        url: row.url,
        'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028': codeReviewLevel1Field,
        'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e': codeReviewLevel2Field,
        tipoCliente: row.tipoCliente,
        priority: row.priority,
        customType: row.customType,
        rootCauseStatus: row.rootCauseStatus,
        squad: row.squad,
        area: row.area,
        reincidencia: row.reincidencia,
        performanceDays: row.performanceDays,
        qa: row.qa,
        complexity: row.complexity,
        causaRaiz: row.causaRaiz,
        createdBy: row.createdBy,
        po: row.po,
        readyDate: row.readyDate,
        doneDate: row.doneDate
      };
    });

    res.json(items);
  } catch (err) {
    console.error('❌ Error in /api/items:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get items by period
app.get('/api/items/period/:days', async (req, res) => {
  try {
    const days = Number.parseInt(req.params.days, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    const rows = await dbAllAsync(
      'SELECT * FROM work_items WHERE changedDate >= ? ORDER BY changedDate DESC',
      [cutoffDateStr]
    );

    const items = rows.map(row => ({
      workItemId: row.workItemId,
      title: row.title,
      state: row.state,
      type: row.type,
      assignedTo: row.assignedTo,
      team: row.team,
      areaPath: row.areaPath,
      createdDate: row.createdDate,
      changedDate: row.changedDate,
      closedDate: row.closedDate,
      cycleTime: calculateCycleTime(row.firstActivationDate, row.closedDate), // 🆕 Corrigido
      leadTime: calculateLeadTime(row.createdDate, row.closedDate), // 🆕 Corrigido
      age: calculateAge(row.changedDate)
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Status Endpoint
app.get('/api/sync/status', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM sync_log ORDER BY syncTime DESC LIMIT 1').get();
    res.json(row || { status: 'No sync yet' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Log Endpoint
app.get('/api/sync/log', async (req, res) => {
  try {
    const rows = await dbAllAsync('SELECT * FROM sync_log ORDER BY syncTime DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Sync Trigger
app.post('/api/sync', async (req, res) => {
  try {
    console.log('🔄 Manual sync triggered');
    const result = await syncData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Statistics Endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = Number.parseInt(period, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    const [total, byState, byType, byTeam] = await Promise.all([
      dbAllAsync('SELECT COUNT(*) as count FROM work_items WHERE changedDate >= ?', [cutoffDateStr]),
      dbAllAsync('SELECT state, COUNT(*) as count FROM work_items WHERE changedDate >= ? GROUP BY state', [cutoffDateStr]),
      dbAllAsync('SELECT type, COUNT(*) as count FROM work_items WHERE changedDate >= ? GROUP BY type', [cutoffDateStr]),
      dbAllAsync('SELECT team, COUNT(*) as count FROM work_items WHERE changedDate >= ? GROUP BY team', [cutoffDateStr])
    ]);

    res.json({
      total: total[0].count,
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
  console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method,
    availableRoutes: [
      'GET /health',
      'GET /api/items',
      'GET /api/items/period/:days',
      'GET /api/stats',
      'GET /api/sync/status',
      'GET /api/sync/log',
      'POST /api/sync'
    ]
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
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
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Azure DevOps: ${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}`);
  console.log(`💾 Database: ${dbPath}`);
  console.log('='.repeat(50) + '\n');
  
  if (isConfigured()) {
    console.log('🔄 Starting initial sync...\n');
    syncData();
  } else {
    console.log('⚠️  Azure DevOps not configured');
    console.log('   Create a .env file with:');
    console.log('   AZURE_ORG=your-organization');
    console.log('   AZURE_PROJECT=your-project');
    console.log('   AZURE_PAT=your-personal-access-token\n');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  try {
    db.close();
    console.log('✅ Database closed');
  } catch (err) {
    console.error('❌ Error closing database:', err.message);
  }
  process.exit(0);
});
