// backend/test_azure_auth.js
// Teste simples de autenticação com Azure DevOps

const axios = require('axios');
require('dotenv').config();

const AZURE_ORG = process.env.AZURE_ORG?.replace(/[\r\n]/g, '').trim();
const AZURE_PROJECT = process.env.AZURE_PROJECT?.replace(/[\r\n]/g, '').trim();
const AZURE_PAT = process.env.AZURE_PAT?.replace(/[\r\n]/g, '').trim();

console.log('Configuração:');
console.log('  Organização:', AZURE_ORG);
console.log('  Projeto:', AZURE_PROJECT);
console.log('  PAT length:', AZURE_PAT?.length);
console.log('  PAT primeiros 10 chars:', AZURE_PAT?.substring(0, 10));
console.log('  PAT últimos 10 chars:', AZURE_PAT?.substring(AZURE_PAT.length - 10));

const getAuthHeader = () => {
  const credentials = Buffer.from(`:${AZURE_PAT}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
};

async function testAuth() {
  try {
    console.log('\n🔍 Testando autenticação...\n');
    
    // Teste 1: Buscar projetos da organização
    console.log('1. Buscando projetos da organização...');
    const projectsUrl = `https://dev.azure.com/${AZURE_ORG}/_apis/projects?api-version=7.0`;
    const projectsRes = await axios.get(projectsUrl, { headers: getAuthHeader() });
    console.log(`✅ Sucesso! Encontrados ${projectsRes.data.count} projetos`);
    
    // Teste 2: Buscar work item específico (89277)
    console.log('\n2. Buscando work item 89277...');
    const itemUrl = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems/89277?api-version=7.0`;
    const itemRes = await axios.get(itemUrl, { headers: getAuthHeader() });
    console.log(`✅ Work item encontrado: "${itemRes.data.fields['System.Title']}"`);
    console.log(`   Estado: ${itemRes.data.fields['System.State']}`);
    console.log(`   Tipo: ${itemRes.data.fields['System.WorkItemType']}`);
    console.log(`   Modificado em: ${itemRes.data.fields['System.ChangedDate']}`);
    
    // Teste 3: Query WIQL para verificar se retorna a tarefa
    console.log('\n3. Executando query WIQL (últimos 180 dias)...');
    const wiqlUrl = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/wiql?api-version=7.0`;
    const wiqlQuery = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${AZURE_PROJECT}' AND [System.ChangedDate] >= @Today - 180 AND [System.Id] = 89277`
    };
    const wiqlRes = await axios.post(wiqlUrl, wiqlQuery, { headers: getAuthHeader() });
    const found = wiqlRes.data.workItems?.some(wi => wi.id === 89277);
    
    if (found) {
      console.log('✅ A tarefa 89277 SERIA retornada pela query WIQL da sincronização');
    } else {
      console.log('❌ A tarefa 89277 NÃO é retornada pela query WIQL!');
      console.log('   Isso significa que ChangedDate >= @Today - 180 é FALSE');
      console.log('   A tarefa não foi modificada nos últimos 180 dias.');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Dados:', error.response.data);
    }
  }
}

testAuth();
