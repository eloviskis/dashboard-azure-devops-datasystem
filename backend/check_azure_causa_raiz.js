const axios = require('axios');
require('dotenv').config();

// Configuração do Azure DevOps
const AZURE_CONFIG = {
  organization: 'datasystemsoftwares',
  project: 'USE',
  pat: process.env.AZURE_PAT || ''
};

const getAuthHeader = () => ({
  'Authorization': `Basic ${Buffer.from(':' + AZURE_CONFIG.pat).toString('base64')}`,
  'Content-Type': 'application/json'
});

async function checkFields() {
  // Buscar TODOS os campos custom de um work item para encontrar "Cenários de testes"
  const workItemId = 78984;
  
  const url = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=7.1`;
  
  try {
    const response = await axios.get(url, { headers: getAuthHeader() });
    const fields = response.data.fields;
    
    console.log(`\n=== TODOS os campos Custom do Work Item ${workItemId} ===\n`);
    
    Object.keys(fields).filter(k => k.startsWith('Custom.')).forEach(key => {
      console.log(`${key}: ${JSON.stringify(fields[key])}`);
    });
    
  } catch (error) {
    console.error(`Erro:`, error.message);
  }
}

checkFields();
