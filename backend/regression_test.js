/**
 * TESTE DE REGRESSÃO AUTOMATIZADO - DASHBOARD AZURE DEVOPS
 * 
 * Este teste valida que todos os campos PostgreSQL estão chegando
 * corretamente na API (com mapeamento snake_case -> camelCase)
 * 
 * DB_TO_API_MAPPING:
 *   tipo_cliente -> tipoCliente
 *   custom_type -> customType  
 *   root_cause_team -> rootCauseTeam
 *   causa_raiz -> causaRaiz
 *   story_points -> storyPoints
 *   created_date -> createdDate
 *   closed_date -> closedDate
 *   etc.
 */
const axios = require('axios');
const BASE_URL = 'https://backend-hazel-three-14.vercel.app';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const log = (msg, color = '') => console.log(color + msg + COLORS.reset);

async function getToken() {
  const response = await axios.post(BASE_URL + '/api/auth/login', {
    username: 'admin',
    password: 'Pwk8q12v@'
  });
  return response.data.token;
}

async function runTests() {
  log('\n' + '='.repeat(70), COLORS.cyan);
  log('    TESTE DE REGRESSAO - PostgreSQL -> API', COLORS.bold + COLORS.cyan);
  log('='.repeat(70) + '\n', COLORS.cyan);

  const results = { passed: 0, failed: 0, warnings: 0 };

  const testItem = (name, condition, details = '') => {
    if (condition) {
      results.passed++;
      log('   [OK] ' + name + (details ? ': ' + details : ''), COLORS.green);
    } else {
      results.failed++;
      log('   [FAIL] ' + name + (details ? ': ' + details : ''), COLORS.red);
    }
  };

  const testWarn = (name, condition, details = '') => {
    if (condition) {
      results.passed++;
      log('   [OK] ' + name + (details ? ': ' + details : ''), COLORS.green);
    } else {
      results.warnings++;
      log('   [WARN] ' + name + (details ? ': ' + details : ''), COLORS.yellow);
    }
  };

  const countFilled = (arr, field) => arr.filter(i => i[field] && String(i[field]).trim() !== '').length;
  const pct = (count, total) => total > 0 ? count + '/' + total + ' (' + ((count / total) * 100).toFixed(1) + '%)' : '0/0';

  try {
    log('[LOGIN]', COLORS.blue);
    const token = await getToken();
    const headers = { Authorization: 'Bearer ' + token };
    log('   [OK] Autenticado\n', COLORS.green);

    log('[CARREGANDO DADOS]', COLORS.blue);
    const items = (await axios.get(BASE_URL + '/api/items', { headers })).data;
    log('   [OK] ' + items.length + ' work items\n', COLORS.green);

    let prs = [];
    try {
      prs = (await axios.get(BASE_URL + '/api/pull-requests', { headers })).data;
    } catch (e) {
      // PRs podem nao estar disponiveis
    }

    const issues = items.filter(i => i.type === 'Issue');
    const bugs = items.filter(i => i.type === 'Bug');
    const userStories = items.filter(i => i.type === 'User Story');
    const closedItems = items.filter(i => i.state === 'Closed' || i.state === 'Done');
    const closedIssues = issues.filter(i => i.state === 'Closed');
    const backlog = items.filter(i => !['Closed', 'Done', 'Removed'].includes(i.state));

    log('='.repeat(70), COLORS.cyan);
    log('[EXECUTIVE HOME]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('Total Work Items', items.length > 0, items.length + ' itens');
    testItem('Closed/Done', closedItems.length > 0, pct(closedItems.length, items.length));
    testItem('team', countFilled(items, 'team') > 0, pct(countFilled(items, 'team'), items.length));

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[CYCLE TIME]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('createdDate', countFilled(items, 'createdDate') > 0, pct(countFilled(items, 'createdDate'), items.length));
    testItem('closedDate', countFilled(closedItems, 'closedDate') > 0, pct(countFilled(closedItems, 'closedDate'), closedItems.length));
    testWarn('storyPoints', countFilled(items, 'storyPoints') > 0, pct(countFilled(items, 'storyPoints'), items.length));
    testItem('tags', countFilled(items, 'tags') > 0, pct(countFilled(items, 'tags'), items.length));

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[TEAM INSIGHTS]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('assignedTo', countFilled(items, 'assignedTo') > 0, pct(countFilled(items, 'assignedTo'), items.length));
    testItem('createdBy', countFilled(items, 'createdBy') > 0, pct(countFilled(items, 'createdBy'), items.length));
    testWarn('dev', countFilled(items, 'dev') > 0, pct(countFilled(items, 'dev'), items.length));
    testWarn('qa', countFilled(items, 'qa') > 0, pct(countFilled(items, 'qa'), items.length));
    testWarn('po', countFilled(items, 'po') > 0, pct(countFilled(items, 'po'), items.length));

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[BUGS & ISSUES]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('Bugs', bugs.length > 0, bugs.length + ' bugs');
    testItem('Issues', issues.length > 0, issues.length + ' issues');
    testItem('priority (bugs)', countFilled(bugs, 'priority') > 0, pct(countFilled(bugs, 'priority'), bugs.length));

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[CLIENTS]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testWarn('tipoCliente', countFilled(items, 'tipoCliente') > 0, pct(countFilled(items, 'tipoCliente'), items.length));

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[ROOT CAUSE]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('Issues fechadas', closedIssues.length > 0, closedIssues.length + ' issues');
    
    const hasCustomType = closedIssues.some(i => i.customType && i.customType.trim() !== '');
    testItem('customType', hasCustomType, pct(countFilled(closedIssues, 'customType'), closedIssues.length));
    
    const correcoes = hasCustomType 
      ? closedIssues.filter(i => i.customType === 'Correção' || i.customType === 'Correcao')
      : closedIssues;
    testItem('Correcoes', correcoes.length > 0, correcoes.length + ' correcoes');

    log('   [Campos Root Cause]:', COLORS.dim);
    testItem('complexity', countFilled(correcoes, 'complexity') > 0, pct(countFilled(correcoes, 'complexity'), correcoes.length));
    testItem('reincidencia', countFilled(correcoes, 'reincidencia') > 0, pct(countFilled(correcoes, 'reincidencia'), correcoes.length));
    testItem('tipoCliente (correcoes)', countFilled(correcoes, 'tipoCliente') > 0, pct(countFilled(correcoes, 'tipoCliente'), correcoes.length));
    testWarn('rootCauseTeam', countFilled(correcoes, 'rootCauseTeam') > 0, pct(countFilled(correcoes, 'rootCauseTeam'), correcoes.length));
    testWarn('platform', countFilled(correcoes, 'platform') > 0, pct(countFilled(correcoes, 'platform'), correcoes.length));
    testWarn('dev (correcoes)', countFilled(correcoes, 'dev') > 0, pct(countFilled(correcoes, 'dev'), correcoes.length));
    testWarn('causaRaiz', countFilled(correcoes, 'causaRaiz') > 0, pct(countFilled(correcoes, 'causaRaiz'), correcoes.length));

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[PULL REQUESTS]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('PRs', prs.length > 0, prs.length + ' PRs');

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[BACKLOG]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('Backlog', backlog.length > 0, backlog.length + ' itens');

    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[PO ANALYSIS]', COLORS.bold);
    log('-'.repeat(70), COLORS.cyan);
    testItem('User Stories', userStories.length > 0, userStories.length + ' US');
    testItem('iterationPath', countFilled(items, 'iterationPath') > 0, pct(countFilled(items, 'iterationPath'), items.length));
    testWarn('squad', countFilled(items, 'squad') > 0, pct(countFilled(items, 'squad'), items.length));

    // Resumo
    log('\n' + '='.repeat(70), COLORS.cyan);
    log('[RESUMO]', COLORS.bold + COLORS.cyan);
    log('='.repeat(70), COLORS.cyan);
    
    const total = results.passed + results.failed + results.warnings;
    log('\n   Total: ' + total, COLORS.bold);
    log('   [OK] Passou: ' + results.passed, COLORS.green);
    log('   [WARN] Avisos: ' + results.warnings, COLORS.yellow);
    log('   [FAIL] Falhou: ' + results.failed, COLORS.red);
    
    const rate = ((results.passed / total) * 100).toFixed(1);
    log('\n   Taxa: ' + rate + '%', results.failed === 0 ? COLORS.green : COLORS.yellow);
    
    if (results.failed === 0) {
      log('\n   TODOS OS TESTES PASSARAM!', COLORS.green + COLORS.bold);
    }
    
    log('\n' + '='.repeat(70) + '\n', COLORS.cyan);

  } catch (e) {
    log('[ERRO] ' + e.message, COLORS.red);
  }
}

runTests();
