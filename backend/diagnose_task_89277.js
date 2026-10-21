// backend/diagnose_task_89277.js
// Script de diagnóstico para verificar por que a tarefa 89277 não aparece nos alertas

const axios = require('axios');
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false });

const AZURE_CONFIG = {
  organization: (process.env.AZURE_ORG || '').trim(),
  project: (process.env.AZURE_PROJECT || '').trim(),
  pat: (process.env.AZURE_PAT || '').trim()
};

const getAuthHeader = () => {
  const credentials = Buffer.from(`:${AZURE_CONFIG.pat}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
};

const PR_REVIEW_ELIGIBLE_STATES = ['aguardando code review', 'fazendo code review', 'aguardando qa', 'testando qa'];

async function diagnoseTask89277() {
  console.log('🔍 Diagnóstico da tarefa 89277\n');
  console.log('═'.repeat(80));
  
  try {
    // 1. Verificar dados no banco
    console.log('\n📊 1. DADOS NO BANCO DE DADOS:');
    console.log('─'.repeat(80));
    
    const result = await pool.query(`
      SELECT work_item_id, title, state, type, 
             code_review_level1, code_review_level2,
             linked_pr_ids, linked_pr_votes,
             assigned_to, dev, synced_at
      FROM work_items 
      WHERE work_item_id = 89277
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Tarefa 89277 não encontrada no banco!');
      return;
    }
    
    const task = result.rows[0];
    console.log('ID:', task.work_item_id);
    console.log('Título:', task.title);
    console.log('Estado:', task.state);
    console.log('Tipo:', task.type);
    console.log('Code Review Nível 1:', task.code_review_level1 || '(vazio)');
    console.log('Code Review Nível 2:', task.code_review_level2 || '(vazio)');
    console.log('Linked PR IDs:', task.linked_pr_ids || '(vazio)');
    console.log('Linked PR Votes:', task.linked_pr_votes || '(NULL - ESTE É O PROBLEMA!)');
    console.log('Assigned To:', task.assigned_to || '(vazio)');
    console.log('Dev:', task.dev || '(vazio)');
    console.log('Última sincronização:', task.synced_at);
    
    // 2. Verificar se estado é elegível
    console.log('\n✅ 2. VERIFICAÇÃO DE ELEGIBILIDADE:');
    console.log('─'.repeat(80));
    
    const stateNormalized = (task.state || '').toLowerCase();
    const isEligibleState = PR_REVIEW_ELIGIBLE_STATES.includes(stateNormalized);
    console.log('Estado normalizado:', stateNormalized);
    console.log('Estados elegíveis:', PR_REVIEW_ELIGIBLE_STATES.join(', '));
    console.log('É estado elegível?', isEligibleState ? '✅ SIM' : '❌ NÃO');
    
    const isEligibleType = !['Feature', 'Epic'].includes(task.type);
    console.log('Tipo elegível (não Feature/Epic)?', isEligibleType ? '✅ SIM' : '❌ NÃO');
    
    // 3. Verificar PRs vinculadas no Azure DevOps
    if (!task.linked_pr_ids || task.linked_pr_ids === '[]') {
      console.log('\n⚠️ 3. PROBLEMA IDENTIFICADO:');
      console.log('─'.repeat(80));
      console.log('A tarefa não tem PRs vinculadas no campo linked_pr_ids!');
      console.log('Isso significa que a sincronização não encontrou PRs vinculadas no Azure DevOps.');
      console.log('\nVerifique:');
      console.log('- A PR está vinculada à tarefa no Azure DevOps?');
      console.log('- A relação é do tipo "Pull Request" (ArtifactLink)?');
      return;
    }
    
    console.log('\n🔗 3. VERIFICAÇÃO DAS PRS NO AZURE DEVOPS:');
    console.log('─'.repeat(80));
    
    const prIds = JSON.parse(task.linked_pr_ids);
    console.log('PRs vinculadas:', prIds);
    
    // Buscar detalhes no Azure DevOps
    console.log('\nBuscando detalhes da tarefa no Azure DevOps...');
    const itemUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/workitems/${task.work_item_id}?$expand=all&api-version=7.0`;
    const itemResponse = await axios.get(itemUrl, { headers: getAuthHeader() });
    const item = itemResponse.data;
    
    const prRelations = (item.relations || [])
      .filter(r => r.rel === 'ArtifactLink' && r.attributes?.name === 'Pull Request')
      .map(r => {
        const segments = (r.url || '').split(/%2[fF]/);
        const prId = segments[segments.length - 1];
        const repoId = segments[segments.length - 2];
        return (/^\d+$/.test(prId) && repoId) ? { repoId, prId: parseInt(prId, 10), url: r.url } : null;
      })
      .filter(Boolean);
    
    console.log(`\nEncontradas ${prRelations.length} PR(s) vinculadas:`);
    
    for (const { repoId, prId, url } of prRelations) {
      console.log(`\n  PR #${prId} (Repositório: ${repoId})`);
      console.log(`  URL original: ${url}`);
      
      try {
        const prDetailUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.0`;
        console.log(`  Buscando: ${prDetailUrl}`);
        
        const prDetailRes = await axios.get(prDetailUrl, { headers: getAuthHeader() });
        const pr = prDetailRes.data;
        
        console.log(`  Status: ${pr.status}`);
        console.log(`  Merge Status: ${pr.mergeStatus || 'N/A'}`);
        console.log(`  Criada por: ${pr.createdBy?.displayName || 'N/A'}`);
        console.log(`  Branch origem: ${pr.sourceRefName || 'N/A'}`);
        console.log(`  Branch destino: ${pr.targetRefName || 'N/A'}`);
        
        if (pr.status !== 'active') {
          console.log(`  ⚠️ PROBLEMA: PR não está ativa! Status: ${pr.status}`);
          console.log(`  A sincronização IGNORA PRs que não estão com status 'active'.`);
        } else {
          console.log(`  ✅ PR está ativa`);
          
          // Verificar reviewers
          const reviewers = pr.reviewers || [];
          console.log(`  Reviewers (${reviewers.length}):`);
          reviewers.forEach(r => {
            console.log(`    - ${r.displayName}: vote=${r.vote}, isRequired=${!!r.isRequired}`);
          });
          
          // Verificar iterations (pushes)
          try {
            const iterationsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${repoId}/pullrequests/${prId}/iterations?api-version=7.0`;
            const iterationsRes = await axios.get(iterationsUrl, { headers: getAuthHeader() });
            const pushCount = (iterationsRes.data.value || []).length;
            console.log(`  Push count: ${pushCount}`);
          } catch (err) {
            console.log(`  ⚠️ Erro ao buscar iterations: ${err.message}`);
          }
          
          // Verificar comentários
          try {
            const threadsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.0`;
            const threadsRes = await axios.get(threadsUrl, { headers: getAuthHeader() });
            const commentCount = (threadsRes.data.value || [])
              .flatMap(t => t.comments || [])
              .filter(c => c.commentType === 'text' && !c.isDeleted).length;
            console.log(`  Comment count: ${commentCount}`);
          } catch (err) {
            console.log(`  ⚠️ Erro ao buscar threads: ${err.message}`);
          }
        }
        
      } catch (err) {
        console.log(`  ❌ ERRO ao buscar PR: ${err.message}`);
        if (err.response) {
          console.log(`  Status HTTP: ${err.response.status}`);
          console.log(`  Resposta: ${JSON.stringify(err.response.data).substring(0, 200)}`);
        }
        console.log(`  ⚠️ Este erro durante a sincronização faz com que linked_pr_votes fique NULL!`);
      }
    }
    
    // 4. Resumo e recomendações
    console.log('\n📋 4. RESUMO E RECOMENDAÇÕES:');
    console.log('═'.repeat(80));
    
    if (!task.linked_pr_votes) {
      console.log('❌ PROBLEMA CONFIRMADO: linked_pr_votes está NULL');
      console.log('\nPossíveis causas:');
      console.log('1. PR não está com status "active" no Azure DevOps');
      console.log('2. Erro ao buscar detalhes da PR (permissões, rede, PR em outro projeto)');
      console.log('3. Sincronização ainda não rodou após PR ser vinculada');
      console.log('\nSolução:');
      console.log('- Execute uma sincronização manual: POST /api/sync');
      console.log('- Verifique os logs acima para identificar o problema específico');
      console.log('- Se a PR estiver inativa, mude o status para "active" no Azure DevOps');
    } else {
      console.log('✅ Campo linked_pr_votes está populado');
      console.log('\nSe a tarefa ainda não aparece nos alertas, verifique:');
      console.log('- Code Review Nível 1 está preenchido? (para aparecer no N2)');
      console.log('- O grupo obrigatório "Code Review" já aprovou? (seria filtrado do N2)');
    }
    
  } catch (error) {
    console.error('\n❌ ERRO DURANTE DIAGNÓSTICO:', error.message);
    if (error.response) {
      console.error('Status HTTP:', error.response.status);
      console.error('Resposta:', JSON.stringify(error.response.data).substring(0, 500));
    }
    console.error('\nStack:', error.stack);
  } finally {
    await pool.end();
  }
}

diagnoseTask89277().catch(console.error);
