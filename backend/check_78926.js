const axios = require('axios');
require('dotenv').config();

const AZURE_CONFIG = {
  organization: 'datasystemsoftwares',
  project: 'USE',
  pat: process.env.AZURE_PAT || ''
};

const getAuthHeader = () => ({
  'Authorization': `Basic ${Buffer.from(':' + AZURE_CONFIG.pat).toString('base64')}`,
  'Content-Type': 'application/json'
});

async function checkWorkItem78926() {
  const workItemId = 78926;
  
  const url = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=7.1`;
  
  try {
    console.log(`\n🔍 Buscando Work Item ${workItemId}...\n`);
    const response = await axios.get(url, { headers: getAuthHeader() });
    const fields = response.data.fields;
    
    console.log('=== TODOS os campos Custom ===\n');
    Object.keys(fields).filter(k => k.startsWith('Custom.')).forEach(key => {
      const value = fields[key];
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
      console.log(`${key}: ${displayValue}`);
    });
    
    console.log(`\n=== Buscando "Cenários" em TODOS os campos ===\n`);
    Object.keys(fields).forEach(key => {
      const value = fields[key];
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (strValue && strValue.toLowerCase().includes('cenário')) {
        console.log(`>>> ENCONTRADO! ${key}: ${strValue}`);
      }
    });
    
  } catch (error) {
    console.error(`Erro:`, error.response?.data || error.message);
  }
}

checkWorkItem78926();
