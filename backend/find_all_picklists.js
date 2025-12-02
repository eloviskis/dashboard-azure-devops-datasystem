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

async function findAllPicklists() {
  const fieldsUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/fields?api-version=7.1`;
  
  try {
    console.log('🔍 Buscando TODOS os picklists...\n');
    const response = await axios.get(fieldsUrl, { headers: getAuthHeader() });
    const fields = response.data.value;
    
    const customPicklists = fields.filter(f => f.referenceName.startsWith('Custom.') && f.isPicklist);
    
    console.log(`Total de ${customPicklists.length} picklists Custom\n`);
    
    for (const field of customPicklists) {
      if (!field.picklistId) continue;
      
      const picklistUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/work/processes/lists/${field.picklistId}?api-version=7.1`;
      try {
        const picklistResponse = await axios.get(picklistUrl, { headers: getAuthHeader() });
        const values = picklistResponse.data.items?.map(i => i.value || i) || [];
        
        // Verificar se tem "Cenários" ou palavras similares
        const hasScenarios = values.some(v => v && v.toLowerCase().includes('cenário'));
        const hasCalculos = values.some(v => v && v.toLowerCase().includes('cálculo'));
        const hasErro = values.some(v => v && v.toLowerCase().includes('erro'));
        
        if (hasScenarios || hasCalculos || hasErro || values.length > 3) {
          console.log(`✅ Campo: "${field.name}" (${field.referenceName})`);
          console.log(`   Valores (${values.length}): ${values.join(', ')}`);
          console.log('');
        }
      } catch (e) {
        // Ignora erros
      }
    }
    
  } catch (error) {
    console.error('Erro:', error.response?.data || error.message);
  }
}

findAllPicklists();
