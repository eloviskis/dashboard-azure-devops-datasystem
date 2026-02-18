#!/usr/bin/env node
/**
 * Data System - Sincronizador Standalone
 * 
 * Este executável sincroniza dados do Azure DevOps com o banco PostgreSQL.
 * Pode rodar em modo contínuo (a cada 30 min) ou único.
 * 
 * Uso:
 *   ./datasystem-sync              (Linux - modo contínuo)
 *   datasystem-sync.exe            (Windows - modo contínuo)
 *   ./datasystem-sync --once       (executa uma vez e sai)
 *   ./datasystem-sync --config     (mostra configuração atual)
 *   ./datasystem-sync --help       (ajuda)
 */

const https = require('https');
const { Pool } = require('pg');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// ============== CONFIGURAÇÃO PADRÃO ==============
// Estas são as configurações padrão. Podem ser sobrescritas por variáveis de ambiente
// ou por um arquivo config.json na mesma pasta do executável.

const DEFAULT_CONFIG = {
  AZURE_ORG: process.env.AZURE_ORG || '',
  AZURE_PROJECT: process.env.AZURE_PROJECT || '',
  AZURE_PAT: process.env.AZURE_PAT || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  SYNC_INTERVAL_MINUTES: 30
};

// Tenta carregar config.json se existir
function loadConfig() {
  const config = { ...DEFAULT_CONFIG };
  
  // Sobrescreve com variáveis de ambiente se existirem
  if (process.env.AZURE_ORG) config.AZURE_ORG = process.env.AZURE_ORG;
  if (process.env.AZURE_PROJECT) config.AZURE_PROJECT = process.env.AZURE_PROJECT;
  if (process.env.AZURE_PAT) config.AZURE_PAT = process.env.AZURE_PAT;
  if (process.env.DATABASE_URL) config.DATABASE_URL = process.env.DATABASE_URL;
  if (process.env.SYNC_INTERVAL_MINUTES) config.SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES);
  
  // Tenta carregar config.json - procura na pasta do executável e em cwd
  const possiblePaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(path.dirname(process.execPath), 'config.json'),
    path.join(__dirname, 'config.json')
  ];
  
  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        Object.assign(config, fileConfig);
        console.log('📄 Configuração carregada de', configPath);
        break;
      }
    } catch (e) {
      console.error('⚠️ Erro ao carregar config.json:', e.message);
    }
  }
  
  return config;
}

const CONFIG = loadConfig();

// ============== DATABASE ==============
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
});

// ============== HELPERS ==============
function extractTeam(areaPath) {
  if (!areaPath) return 'Sem Time';
  const parts = areaPath.split('\\');
  return parts.length > 1 ? parts[parts.length - 1] : areaPath;
}

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ============== AZURE DEVOPS API ==============
async function fetchWorkItems() {
  const token = Buffer.from(`:${CONFIG.AZURE_PAT}`).toString('base64');
  const baseUrl = `https://dev.azure.com/${CONFIG.AZURE_ORG}/${CONFIG.AZURE_PROJECT}`;
  
  console.log('📡 Buscando work items do Azure DevOps (últimos 180 dias + alterados)...');
  
  // Buscar itens criados ou alterados nos últimos 180 dias (histórico já sincronizado)
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${CONFIG.AZURE_PROJECT}' AND [System.ChangedDate] >= @Today - 180 ORDER BY [System.ChangedDate] DESC`;
  
  const wiqlQuery = JSON.stringify({ query });
  
  const wiqlUrl = new URL(`${baseUrl}/_apis/wit/wiql?api-version=7.1`);
  const wiqlResponse = await httpsRequest(wiqlUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(wiqlQuery)
    },
    body: wiqlQuery
  });
  
  const allWorkItemIds = new Set();
  
  if (wiqlResponse.status === 200 && wiqlResponse.data.workItems) {
    wiqlResponse.data.workItems.forEach(wi => allWorkItemIds.add(wi.id));
    console.log(`   ${allWorkItemIds.size} work items alterados nos últimos 180 dias`);
  } else {
    console.log(`   Erro ao buscar work items`);
  }
  
  const workItemIds = Array.from(allWorkItemIds);
  console.log(`   Total: ${workItemIds.length} work items únicos`);
  
  if (workItemIds.length === 0) return [];
  
  // Buscar detalhes em batches de 200
  const allItems = [];
  const batchSize = 200;
  
  for (let i = 0; i < workItemIds.length; i += batchSize) {
    const batchIds = workItemIds.slice(i, i + batchSize);
    const idsParam = batchIds.join(',');
    
    const detailsUrl = new URL(`${baseUrl}/_apis/wit/workitems?ids=${idsParam}&$expand=all&api-version=7.0`);
    const detailsResponse = await httpsRequest(detailsUrl, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${token}` }
    });
    
    if (detailsResponse.status !== 200) {
      console.error(`   ⚠️ Batch ${i}-${i+batchSize} falhou: ${detailsResponse.status}`);
      continue;
    }
    
    allItems.push(...(detailsResponse.data.value || []));
    process.stdout.write(`\r   Carregados ${allItems.length}/${workItemIds.length} items...`);
  }
  
  console.log('\n   ✅ Todos os items carregados');
  return allItems;
}

async function fetchPullRequests() {
  const token = Buffer.from(`:${CONFIG.AZURE_PAT}`).toString('base64');
  const baseUrl = `https://dev.azure.com/${CONFIG.AZURE_ORG}/${CONFIG.AZURE_PROJECT}`;
  
  console.log('📡 Buscando Pull Requests...');
  
  try {
    // Listar repositórios
    const reposUrl = new URL(`${baseUrl}/_apis/git/repositories?api-version=7.1`);
    const reposResponse = await httpsRequest(reposUrl, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${token}` }
    });
    
    if (reposResponse.status !== 200) {
      throw new Error(`Repos failed: ${reposResponse.status}`);
    }
    
    const repos = reposResponse.data.value || [];
    const allPRs = [];
    
    for (const repo of repos) {
      const prsUrl = new URL(`${baseUrl}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=all&$top=500&api-version=7.1`);
      const prsResponse = await httpsRequest(prsUrl, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${token}` }
      });
      
      if (prsResponse.status === 200) {
        allPRs.push(...(prsResponse.data.value || []).map(pr => ({ ...pr, repositoryName: repo.name })));
      }
    }
    
    console.log(`   ✅ ${allPRs.length} PRs encontrados`);
    return allPRs;
  } catch (error) {
    console.error('   ❌ Erro ao buscar PRs:', error.message);
    return [];
  }
}

// ============== DATABASE OPERATIONS ==============
async function saveWorkItems(items) {
  const client = await pool.connect();
  const syncedAt = new Date().toISOString();
  let saved = 0;
  
  console.log('💾 Salvando work items no banco...');
  
  try {
    for (const item of items) {
      const f = item.fields || {};
      const workItemId = item.id;
      const title = f['System.Title'] || '';
      const state = f['System.State'] || '';
      const type = f['System.WorkItemType'] || '';
      const assignedTo = f['System.AssignedTo']?.displayName || '';
      const areaPath = f['System.AreaPath'] || '';
      const team = extractTeam(areaPath);
      const iterationPath = f['System.IterationPath'] || '';
      const createdDate = f['System.CreatedDate'] || null;
      const changedDate = f['System.ChangedDate'] || null;
      const closedDate = f['Microsoft.VSTS.Common.ClosedDate'] || null;
      const firstActivationDate = f['Microsoft.VSTS.Common.ActivatedDate'] || null;
      const storyPoints = f['Microsoft.VSTS.Scheduling.StoryPoints'] || null;
      const tags = f['System.Tags'] || '';
      const priority = f['Microsoft.VSTS.Common.Priority']?.toString() || '';
      // Code Review Nível 1 e 2 são campos Identity com GUIDs
      const cr1Field = f['Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028'];
      const cr2Field = f['Custom.60cee051-7e66-4753-99d6-4bc8717fae0e'];
      const codeReviewLevel1 = cr1Field?.displayName || (typeof cr1Field === 'string' ? cr1Field : '') || '';
      const codeReviewLevel2 = cr2Field?.displayName || (typeof cr2Field === 'string' ? cr2Field : '') || '';
      const tipoCliente = f['Custom.Tipocliente'] || '';
      const customType = f['Custom.Type'] || '';
      const rootCauseStatus = f['Custom.RootCauseStatus'] || '';
      const squad = f['Custom.Squad'] || '';
      const area = f['Custom.Area'] || '';
      const reincidencia = f['Custom.REINCIDENCIA']?.toString() || '';
      const performanceDays = f['Custom.PerformanceDays'] || '';
      const qa = f['Custom.QA']?.displayName || '';
      const complexity = f['Custom.Complexity'] || '';
      const causaRaiz = f['Custom.Raizdoproblema'] || '';
      const rootCauseLegacy = f['Microsoft.VSTS.CMMI.RootCause'] || '';
      const createdBy = f['System.CreatedBy']?.displayName || '';
      const po = f['Custom.PO'] || '';
      const readyDate = f['Custom.ReadyDate'] || null;
      const doneDate = f['Custom.DoneDate'] || null;
      // Campos de identificação e falha do processo
      const identificacao = f['Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5'] || '';
      const falhaDoProcesso = f['Custom.Falhadoprocesso'] || '';
      // Campos de estimativa de tempo (Tasks)
      const originalEstimate = f['Microsoft.VSTS.Scheduling.OriginalEstimate'] || null;
      const remainingWork = f['Microsoft.VSTS.Scheduling.RemainingWork'] || null;
      const completedWork = f['Microsoft.VSTS.Scheduling.CompletedWork'] || null;
      const parentId = f['System.Parent'] || null;
      const url = `https://dev.azure.com/${CONFIG.AZURE_ORG}/${CONFIG.AZURE_PROJECT}/_workitems/edit/${workItemId}`;

      await client.query(`
        INSERT INTO work_items (
          work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
          created_date, changed_date, closed_date, first_activation_date, story_points, tags,
          priority, code_review_level1, code_review_level2, tipo_cliente, custom_type,
          root_cause_status, squad, area, reincidencia, performance_days, qa, complexity,
          causa_raiz, root_cause_legacy, created_by, po, ready_date, done_date, url, synced_at,
          original_estimate, remaining_work, completed_work, parent_id, identificacao, falha_do_processo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40)
        ON CONFLICT (work_item_id) DO UPDATE SET
          title = EXCLUDED.title, state = EXCLUDED.state, type = EXCLUDED.type,
          assigned_to = EXCLUDED.assigned_to, team = EXCLUDED.team, area_path = EXCLUDED.area_path,
          iteration_path = EXCLUDED.iteration_path, created_date = EXCLUDED.created_date,
          changed_date = EXCLUDED.changed_date, closed_date = EXCLUDED.closed_date,
          first_activation_date = EXCLUDED.first_activation_date, story_points = EXCLUDED.story_points,
          tags = EXCLUDED.tags, priority = EXCLUDED.priority, code_review_level1 = EXCLUDED.code_review_level1,
          code_review_level2 = EXCLUDED.code_review_level2, tipo_cliente = EXCLUDED.tipo_cliente,
          custom_type = EXCLUDED.custom_type, root_cause_status = EXCLUDED.root_cause_status,
          squad = EXCLUDED.squad, area = EXCLUDED.area, reincidencia = EXCLUDED.reincidencia,
          performance_days = EXCLUDED.performance_days, qa = EXCLUDED.qa, complexity = EXCLUDED.complexity,
          causa_raiz = EXCLUDED.causa_raiz, root_cause_legacy = EXCLUDED.root_cause_legacy, created_by = EXCLUDED.created_by, po = EXCLUDED.po,
          ready_date = EXCLUDED.ready_date, done_date = EXCLUDED.done_date, url = EXCLUDED.url,
          synced_at = EXCLUDED.synced_at,
          original_estimate = EXCLUDED.original_estimate, remaining_work = EXCLUDED.remaining_work,
          completed_work = EXCLUDED.completed_work, parent_id = EXCLUDED.parent_id,
          identificacao = EXCLUDED.identificacao, falha_do_processo = EXCLUDED.falha_do_processo
      `, [
        workItemId, title, state, type, assignedTo, team, areaPath, iterationPath,
        createdDate, changedDate, closedDate, firstActivationDate, storyPoints, tags,
        priority, codeReviewLevel1, codeReviewLevel2, tipoCliente, customType,
        rootCauseStatus, squad, area, reincidencia, performanceDays, qa, complexity,
        causaRaiz, rootCauseLegacy, createdBy, po, readyDate, doneDate, url, syncedAt,
        originalEstimate, remainingWork, completedWork, parentId, identificacao, falhaDoProcesso
      ]);
      
      saved++;
      if (saved % 100 === 0) {
        process.stdout.write(`\r   Salvos ${saved}/${items.length}...`);
      }
    }
    
    console.log(`\n   ✅ ${saved} work items salvos`);
  } finally {
    client.release();
  }
  
  return saved;
}

async function savePullRequests(prs) {
  const client = await pool.connect();
  const syncedAt = new Date().toISOString();
  let saved = 0;
  
  console.log('💾 Salvando Pull Requests no banco...');
  
  try {
    for (const pr of prs) {
      await client.query(`
        INSERT INTO pull_requests (
          pull_request_id, title, description, status, created_by, created_date,
          closed_date, source_ref_name, target_ref_name, repository_id, repository_name,
          labels, reviewers, votes, url, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (pull_request_id) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description, status = EXCLUDED.status,
          closed_date = EXCLUDED.closed_date, reviewers = EXCLUDED.reviewers, votes = EXCLUDED.votes,
          synced_at = EXCLUDED.synced_at
      `, [
        pr.pullRequestId,
        pr.title || '',
        pr.description || '',
        pr.status || '',
        pr.createdBy?.displayName || '',
        pr.creationDate || null,
        pr.closedDate || null,
        pr.sourceRefName || '',
        pr.targetRefName || '',
        pr.repository?.id || '',
        pr.repositoryName || '',
        JSON.stringify(pr.labels || []),
        JSON.stringify(pr.reviewers || []),
        JSON.stringify(pr.reviewers?.map(r => ({ id: r.id, vote: r.vote })) || []),
        pr.url || '',
        syncedAt
      ]);
      saved++;
    }
    
    console.log(`   ✅ ${saved} PRs salvos`);
  } finally {
    client.release();
  }
  
  return saved;
}

async function logSync(itemsCount, prsCount, status, errorMessage = null) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO sync_log (sync_time, items_count, pull_requests_count, status, error_message)
      VALUES ($1, $2, $3, $4, $5)
    `, [new Date().toISOString(), itemsCount, prsCount, status, errorMessage]);
  } finally {
    client.release();
  }
}

// ============== MAIN SYNC ==============
async function runSync() {
  console.log('\n' + '='.repeat(60));
  console.log(`🔄 Iniciando sincronização - ${new Date().toLocaleString('pt-BR')}`);
  console.log('='.repeat(60));
  
  try {
    // Testar conexão com banco
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Conexão com banco OK');
    
    // Buscar e salvar work items
    const items = await fetchWorkItems();
    const itemsSaved = await saveWorkItems(items);
    
    // Buscar e salvar PRs
    const prs = await fetchPullRequests();
    const prsSaved = await savePullRequests(prs);
    
    // Registrar sync bem-sucedido
    await logSync(itemsSaved, prsSaved, 'success');
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Sincronização concluída com sucesso!`);
    console.log(`   Work Items: ${itemsSaved}`);
    console.log(`   Pull Requests: ${prsSaved}`);
    console.log('='.repeat(60) + '\n');
    
    return true;
  } catch (error) {
    console.error('\n❌ Erro na sincronização:', error.message);
    await logSync(0, 0, 'error', error.message).catch(() => {});
    return false;
  }
}

// ============== CLI ==============
function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DATA SYSTEM - Sincronizador Azure DevOps           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  COMANDOS:                                                   ║
║    --once      Executa sincronização uma vez e sai           ║
║    --config    Mostra configuração atual                     ║
║    --help      Mostra esta ajuda                             ║
║    (nenhum)    Modo contínuo (sync a cada 30 min)           ║
║                                                              ║
║  CONFIGURAÇÃO:                                               ║
║    Crie um arquivo 'config.json' na mesma pasta:             ║
║    {                                                         ║
║      "AZURE_PAT": "seu-token-aqui",                         ║
║      "DATABASE_URL": "postgresql://...",                     ║
║      "SYNC_INTERVAL_MINUTES": 30                             ║
║    }                                                         ║
║                                                              ║
║    Ou use variáveis de ambiente:                             ║
║    export AZURE_PAT=seu-token                                ║
║    export DATABASE_URL=postgresql://...                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

function showConfig() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   CONFIGURAÇÃO ATUAL                         ║
╠══════════════════════════════════════════════════════════════╣
║  Azure Org:     ${CONFIG.AZURE_ORG.padEnd(42)}║
║  Azure Project: ${CONFIG.AZURE_PROJECT.padEnd(42)}║
║  Azure PAT:     ${'*'.repeat(20) + CONFIG.AZURE_PAT.slice(-10).padEnd(22)}║
║  Database:      ${CONFIG.DATABASE_URL.replace(/:[^:@]+@/, ':***@').slice(0, 42).padEnd(42)}║
║  Intervalo:     ${(CONFIG.SYNC_INTERVAL_MINUTES + ' minutos').padEnd(42)}║
╚══════════════════════════════════════════════════════════════╝
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           🚀 DATA SYSTEM - Sincronizador v1.0                ║
╚══════════════════════════════════════════════════════════════╝
`);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (args.includes('--config') || args.includes('-c')) {
    showConfig();
    process.exit(0);
  }
  
  const onceMode = args.includes('--once') || args.includes('-1');
  
  console.log(`   Azure Org:     ${CONFIG.AZURE_ORG}`);
  console.log(`   Project:       ${CONFIG.AZURE_PROJECT}`);
  console.log(`   Database:      ${CONFIG.DATABASE_URL.replace(/:[^:@]+@/, ':***@').slice(0, 50)}...`);
  
  if (!CONFIG.AZURE_PAT) {
    console.error('\n❌ AZURE_PAT não configurado!');
    console.error('   Configure no config.json ou variável de ambiente.');
    process.exit(1);
  }
  
  // Executar sync imediato
  await runSync();
  
  if (onceMode) {
    console.log('📌 Modo único - encerrando.');
    await pool.end();
    process.exit(0);
  }
  
  // Modo contínuo
  console.log(`⏰ Modo contínuo ativado - sincroniza a cada ${CONFIG.SYNC_INTERVAL_MINUTES} minutos`);
  console.log('   Pressione Ctrl+C para sair\n');
  
  setInterval(async () => {
    await runSync();
    console.log(`⏰ Próximo sync em ${CONFIG.SYNC_INTERVAL_MINUTES} minutos\n`);
  }, CONFIG.SYNC_INTERVAL_MINUTES * 60 * 1000);
  
  // Manter processo rodando
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Encerrando sincronizador...');
    await pool.end();
    process.exit(0);
  });
}

// Função para esperar ENTER antes de fechar (útil no Windows)
function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('\nPressione ENTER para fechar...', () => {
      rl.close();
      resolve();
    });
  });
}

main().catch(async (err) => {
  console.error('\n❌ Erro fatal:', err.message || err);
  console.error('\nDetalhes:', err.stack || 'Sem detalhes');
  console.error('\nVerifique:');
  console.error('  1. config.json está na mesma pasta do executável');
  console.error('  2. DATABASE_URL está correta');
  console.error('  3. AZURE_PAT é válido');
  console.error('  4. Há conexão de rede com o banco e Azure');
  
  // No Windows, espera ENTER antes de fechar
  if (process.platform === 'win32') {
    await waitForEnter();
  }
  
  process.exit(1);
});
