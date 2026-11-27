// backend/check_task_89277_azure.js
// Verifica se a tarefa 89277 existe no Azure DevOps e por que não foi sincronizada

const axios = require('axios');
require('dotenv').config();

const AZURE_CONFIG = {
  organization: (process.env.AZURE_ORG || '').trim(),
  project: (process.env.AZURE_PROJECT || '').trim(),
  pat: (process.env.AZURE_PAT || '').trim()
};

const getAuthHeader = () => {
  const credentials = Buffer.from(`:${AZURE_CONFIG.pat}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
};

async function checkTask89277() {
  console.log('🔍 Verificando tarefa 89277 no Azure DevOps\n');
  console.log('═'.repeat(80));
  
  try {
    // 1. Verificar se a tarefa existe no Azure DevOps
    console.log('\n📊 1. BUSCANDO TAREFA NO AZURE DEVOPS:');
    console.log('─'.repeat(80));
    
    const itemUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/workitems/89277?$expand=all&api-version=7.0`;
    console.log('URL:', itemUrl);
    
    const itemResponse = await axios.get(itemUrl, { headers: getAuthHeader() });
    const item = itemResponse.data;
    const fields = item.fields || {};
    
    console.log('\n✅ Tarefa encontrada no Azure DevOps!');
    console.log('ID:', item.id);
    console.log('Título:', fields['System.Title']);
    console.log('Estado:', fields['System.State']);
    console.log('Tipo:', fields['System.WorkItemType']);
    console.log('Projeto:', fields['System.TeamProject']);
    console.log('Área:', fields['System.AreaPath']);
    console.log('Criada em:', fields['System.CreatedDate']);
    console.log('Modificada em:', fields['System.ChangedDate']);
    
    // 2. Verificar se atende aos critérios da query WIQL
    console.log('\n📋 2. VERIFICAÇÃO DOS CRITÉRIOS DE SINCRONIZAÇÃO:');
    console.log('─'.repeat(80));
    
    const createdDate = new Date(fields['System.CreatedDate']);
    const changedDate = new Date(fields['System.ChangedDate']);
    const today = new Date();
    const days180Ago = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
    
    console.log('Data de criação:', createdDate.toISOString());
    console.log('Última modificação:', changedDate.toISOString());
    console.log('180 dias atrás:', days180Ago.toISOString());
    
    const meetsDateCriteria = changedDate >= days180Ago;
    console.log('\nAtende critério de data (ChangedDate >= @Today - 180)?', meetsDateCriteria ? '✅ SIM' : '❌ NÃO');
    
    if (!meetsDateCriteria) {
      const daysSinceChanged = Math.floor((today - changedDate) / (1000 * 60 * 60 * 24));
      console.log(`⚠️ A tarefa não foi modificada há ${daysSinceChanged} dias!`);
      console.log('A query WIQL da sincronização só busca itens modificados nos últimos 180 dias.');
    }
    
    const correctProject = fields['System.TeamProject'] === AZURE_CONFIG.project;
    console.log('Está no projeto correto?', correctProject ? '✅ SIM' : '❌ NÃO');
    if (!correctProject) {
      console.log(`  Projeto da tarefa: ${fields['System.TeamProject']}`);
      console.log(`  Projeto configurado: ${AZURE_CONFIG.project}`);
    }
    
    // 3. Verificar PRs vinculadas
    console.log('\n🔗 3. VERIFICAÇÃO DE PULL REQUESTS:');
    console.log('─'.repeat(80));
    
    const prRelations = (item.relations || [])
      .filter(r => r.rel === 'ArtifactLink' && r.attributes?.name === 'Pull Request');
    
    console.log(`Encontradas ${prRelations.length} PR(s) vinculadas`);
    
    if (prRelations.length > 0) {
      prRelations.forEach((rel, idx) => {
        console.log(`\nPR ${idx + 1}:`);
        console.log('  URL:', rel.url);
        console.log('  Atributos:', JSON.stringify(rel.attributes));
        
        const segments = (rel.url || '').split(/%2[fF]/);
        const prId = segments[segments.length - 1];
        const repoId = segments[segments.length - 2];
        console.log('  Repository ID:', repoId);
        console.log('  Pull Request ID:', prId);
      });
    }
    
    // 4. Verificar campos customizados relevantes
    console.log('\n🔧 4. CAMPOS CUSTOMIZADOS RELEVANTES:');
    console.log('─'.repeat(80));
    
    const nivel1Field = fields['Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028'];
    const nivel2Field = fields['Custom.60cee051-7e66-4753-99d6-4bc8717fae0e'];
    
    console.log('Code Review Nível 1:', nivel1Field?.displayName || nivel1Field || '(vazio)');
    console.log('Code Review Nível 2:', nivel2Field?.displayName || nivel2Field || '(vazio)');
    
    // 5. Conclusão
    console.log('\n📋 CONCLUSÃO:');
    console.log('═'.repeat(80));
    
    if (!meetsDateCriteria) {
      console.log('❌ PROBLEMA IDENTIFICADO: A tarefa não foi modificada nos últimos 180 dias!');
      console.log('\nA query WIQL da sincronização é:');
      console.log(`  SELECT [System.Id] FROM WorkItems`);
      console.log(`  WHERE [System.TeamProject] = '${AZURE_CONFIG.project}'`);
      console.log(`  AND [System.ChangedDate] >= @Today - 180`);
      console.log('\nSOLUÇÕES:');
      console.log('1. Faça qualquer alteração na tarefa no Azure DevOps (adicione um comentário)');
      console.log('2. OU altere a query WIQL em server.js para aumentar o período (ex: 365 dias)');
      console.log('3. OU adicione uma query adicional específica para esta tarefa');
    } else if (!correctProject) {
      console.log('❌ PROBLEMA: A tarefa está em projeto diferente do configurado!');
    } else {
      console.log('✅ A tarefa DEVERIA ter sido sincronizada!');
      console.log('\nPossíveis motivos:');
      console.log('- A sincronização ainda não rodou recentemente');
      console.log('- Houve erro durante a sincronização que não foi logado');
      console.log('- Execute uma sincronização manual: POST /api/sync');
    }
    
  } catch (error) {
    if (error.response?.status === 404) {
      console.error('\n❌ Tarefa 89277 não existe no Azure DevOps!');
      console.error('Verifique se o ID está correto e se você tem permissão para acessá-la.');
    } else {
      console.error('\n❌ ERRO:', error.message);
      if (error.response) {
        console.error('Status HTTP:', error.response.status);
        console.error('Resposta:', JSON.stringify(error.response.data).substring(0, 500));
      }
    }
  }
}

checkTask89277().catch(console.error);
