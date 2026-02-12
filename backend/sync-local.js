#!/usr/bin/env node
/**
 * Script de Sincronização Local
 * 
 * Execute este script na sua máquina (que tem acesso à rede autorizada)
 * para sincronizar dados do Azure DevOps com o banco PostgreSQL.
 * 
 * Uso:
 *   node sync-local.js
 *   node sync-local.js --once   (executa uma vez e sai)
 * 
 * O script pode rodar em modo contínuo (a cada 30 min) ou único.
 */

require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

// ============== CONFIGURAÇÃO ==============
const AZURE_CONFIG = {
  organization: process.env.AZURE_ORG || 'datasystemsoftwares',
  project: process.env.AZURE_PROJECT || 'USE',
  pat: process.env.AZURE_PAT
};

// Database URL - usa a VPS diretamente
const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://devops_dash:6BYHS3gSL%2FzBNnoEW%2Bt9mev84%2FJwv5ke%2BJdfOzM7jXQ%3D@31.97.64.250:5433/devops_dashboard';

const pool = new Pool({
  connectionString: DATABASE_URL,
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

function calculateDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

// ============== AZURE DEVOPS API ==============
async function fetchWorkItems() {
  const token = Buffer.from(`:${AZURE_CONFIG.pat}`).toString('base64');
  const baseUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}`;
  
  // Query para buscar todos os work items (últimos 180 dias)
  const wiqlQuery = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${AZURE_CONFIG.project}' AND [System.ChangedDate] >= @Today - 180 ORDER BY [System.ChangedDate] DESC`
  };

  console.log('📡 Buscando work items do Azure DevOps...');
  
  const wiqlResponse = await axios.post(
    `${baseUrl}/_apis/wit/wiql?api-version=7.1`,
    wiqlQuery,
    { headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' } }
  );

  const workItemIds = wiqlResponse.data.workItems?.map(wi => wi.id) || [];
  console.log(`   Encontrados ${workItemIds.length} work items`);

  if (workItemIds.length === 0) return [];

  // Buscar detalhes em batches de 200
  const allItems = [];
  const batchSize = 200;
  
  for (let i = 0; i < workItemIds.length; i += batchSize) {
    const batchIds = workItemIds.slice(i, i + batchSize);
    const idsParam = batchIds.join(',');

    const detailsResponse = await axios.get(
      `${baseUrl}/_apis/wit/workitems?ids=${idsParam}&$expand=all&api-version=7.0`,
      { headers: { Authorization: `Basic ${token}` } }
    );

    allItems.push(...(detailsResponse.data.value || []));
    process.stdout.write(`\r   Carregados ${allItems.length}/${workItemIds.length} items...`);
  }
  
  console.log('\n   ✅ Todos os items carregados');
  return allItems;
}

async function fetchPullRequests() {
  const token = Buffer.from(`:${AZURE_CONFIG.pat}`).toString('base64');
  const baseUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}`;
  
  console.log('📡 Buscando Pull Requests...');
  
  try {
    // Listar repositórios
    const reposResponse = await axios.get(
      `${baseUrl}/_apis/git/repositories?api-version=7.1`,
      { headers: { Authorization: `Basic ${token}` } }
    );
    
    const repos = reposResponse.data.value || [];
    const allPRs = [];
    
    for (const repo of repos) {
      const prsResponse = await axios.get(
        `${baseUrl}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=all&$top=500&api-version=7.1`,
        { headers: { Authorization: `Basic ${token}` } }
      );
      allPRs.push(...(prsResponse.data.value || []).map(pr => ({ ...pr, repositoryName: repo.name })));
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
      const codeReviewLevel1 = f['Custom.CR1'] || '';
      const codeReviewLevel2 = f['Custom.CR2'] || '';
      const tipoCliente = f['Custom.Tipocliente'] || f['Custom.TipoCliente'] || f['Custom.tipocliente'] || '';
      const customType = f['Custom.Type'] || f['Custom.TipoCustomizado'] || '';
      const rootCauseStatus = f['Custom.RootCauseStatus'] || f['Custom.StatusCausaRaiz'] || '';
      const squad = f['Custom.Squad'] || '';
      const area = f['Custom.Area'] || '';
      const reincidencia = f['Custom.REINCIDENCIA'] || f['Custom.Reincidencia'] || '';
      const performanceDays = f['Custom.PerformanceDays'] || '';
      const qaField = f['Custom.QA'];
      const qa = qaField?.displayName || (typeof qaField === 'string' ? qaField : '') || '';
      const complexity = f['Custom.Complexity'] || f['Custom.Complexidade'] || '';
      const causaRaiz = f['Custom.Raizdoproblema'] || f['Custom.CausaRaiz'] || '';
      const createdBy = f['System.CreatedBy']?.displayName || '';
      const po = f['Custom.PO'] || '';
      const readyDate = f['Custom.ReadyDate'] || null;
      const doneDate = f['Custom.DoneDate'] || null;
      // Novos campos de Root Cause
      const rootCauseTask = f['Custom.Rootcausetask'] || '';
      const rootCauseTeam = f['Custom.rootcauseteam'] || '';
      const rootCauseVersion = f['Custom.rootcauseversion'] || '';
      const devField = f['Custom.DEV'];
      const dev = devField?.displayName || (typeof devField === 'string' ? devField : '') || '';
      const platform = f['Custom.Platform'] || '';
      const application = f['Custom.Aplication'] || f['Custom.Application'] || '';
      const branchBase = f['Custom.BranchBase'] || '';
      const deliveredVersion = f['Custom.DeliveredVersion'] || '';
      const baseVersion = f['Custom.BaseVersion'] || '';
      const url = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_workitems/edit/${workItemId}`;

      await client.query(`
        INSERT INTO work_items (
          work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
          created_date, changed_date, closed_date, first_activation_date, story_points, tags,
          priority, code_review_level1, code_review_level2, tipo_cliente, custom_type,
          root_cause_status, squad, area, reincidencia, performance_days, qa, complexity,
          causa_raiz, created_by, po, ready_date, done_date, url,
          root_cause_task, root_cause_team, root_cause_version, dev, platform, application,
          branch_base, delivered_version, base_version, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42)
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
          causa_raiz = EXCLUDED.causa_raiz, created_by = EXCLUDED.created_by, po = EXCLUDED.po,
          ready_date = EXCLUDED.ready_date, done_date = EXCLUDED.done_date, url = EXCLUDED.url,
          root_cause_task = EXCLUDED.root_cause_task, root_cause_team = EXCLUDED.root_cause_team,
          root_cause_version = EXCLUDED.root_cause_version, dev = EXCLUDED.dev, platform = EXCLUDED.platform,
          application = EXCLUDED.application, branch_base = EXCLUDED.branch_base,
          delivered_version = EXCLUDED.delivered_version, base_version = EXCLUDED.base_version,
          synced_at = EXCLUDED.synced_at
      `, [
        workItemId, title, state, type, assignedTo, team, areaPath, iterationPath,
        createdDate, changedDate, closedDate, firstActivationDate, storyPoints, tags,
        priority, codeReviewLevel1, codeReviewLevel2, tipoCliente, customType,
        rootCauseStatus, squad, area, reincidencia, performanceDays, qa, complexity,
        causaRaiz, createdBy, po, readyDate, doneDate, url,
        rootCauseTask, rootCauseTeam, rootCauseVersion, dev, platform, application,
        branchBase, deliveredVersion, baseVersion, syncedAt
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
async function main() {
  const args = process.argv.slice(2);
  const onceMode = args.includes('--once');
  
  console.log('\n🚀 Data System - Sync Local');
  console.log('   Azure Org:', AZURE_CONFIG.organization);
  console.log('   Project:', AZURE_CONFIG.project);
  console.log('   Database:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  
  if (!AZURE_CONFIG.pat) {
    console.error('\n❌ AZURE_PAT não configurado! Configure no .env ou variável de ambiente.');
    process.exit(1);
  }
  
  // Executar sync imediato
  await runSync();
  
  if (onceMode) {
    console.log('Modo único - encerrando.');
    await pool.end();
    process.exit(0);
  }
  
  // Modo contínuo - sync a cada 30 minutos
  console.log('⏰ Modo contínuo ativado - próximo sync em 30 minutos');
  console.log('   Pressione Ctrl+C para sair\n');
  
  setInterval(async () => {
    await runSync();
    console.log('⏰ Próximo sync em 30 minutos\n');
  }, 30 * 60 * 1000);
}

main().catch(console.error);
