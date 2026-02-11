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

async function findFieldDefinitions() {
  // Buscar todas as definições de campos customizados do projeto
  const url = `https://dev.azure.com/${AZURE_CONFIG.organization}/${AZURE_CONFIG.project}/_apis/wit/fields?api-version=7.1`;
  
  try {
    console.log('🔍 Buscando definições de campos...\n');
    const response = await axios.get(url, { headers: getAuthHeader() });
    const fields = response.data.value;
    
    // Filtrar campos que contém "causa" ou "raiz" no nome
    const causaFields = fields.filter(f => 
      f.name.toLowerCase().includes('causa') || 
      f.name.toLowerCase().includes('raiz') ||
      f.referenceName.toLowerCase().includes('causa') ||
      f.referenceName.toLowerCase().includes('raiz')
    );
    
    console.log('=== Campos relacionados a Causa/Raiz ===\n');
    causaFields.forEach(f => {
      console.log(`Nome: ${f.name}`);
      console.log(`Reference Name: ${f.referenceName}`);
      console.log(`Type: ${f.type}`);
      console.log(`Is Identity: ${f.isIdentity || false}`);
      console.log(`Is Picklist: ${f.isPicklist || false}`);
      console.log(`---`);
    });
    
    // Buscar também todos os campos Custom
    console.log('\n=== Todos os campos Custom (para referência) ===\n');
    const customFields = fields.filter(f => f.referenceName.startsWith('Custom.'));
    console.log(`Total de campos Custom: ${customFields.length}`);
    
    // Mostrar campos Custom que são picklists (dropdowns)
    const customPicklists = customFields.filter(f => f.isPicklist);
    console.log(`\n=== Campos Custom do tipo Dropdown/Picklist ===\n`);
    customPicklists.forEach(f => {
      console.log(`Nome: "${f.name}" -> ${f.referenceName}`);
    });
    
    // Buscar valores do Root Cause Status para ver se tem "Cenários de testes"
    console.log('\n=== Buscando valores do Root Cause Status ===\n');
    const rootCauseField = customFields.find(f => f.referenceName === 'Custom.RootCauseStatus');
    if (rootCauseField && rootCauseField.picklistId) {
      console.log('Tem picklist ID:', rootCauseField.picklistId);
      // Buscar os valores do picklist
      const picklistUrl = `https://dev.azure.com/${AZURE_CONFIG.organization}/_apis/work/processes/lists/${rootCauseField.picklistId}?api-version=7.1`;
      try {
        const picklistResponse = await axios.get(picklistUrl, { headers: getAuthHeader() });
        console.log('Valores:', picklistResponse.data.items?.map(i => i.value || i));
      } catch (e) {
        console.log('Erro ao buscar picklist:', e.message);
      }
    }
    
  } catch (error) {
    console.error('Erro:', error.response?.data || error.message);
  }
}

findFieldDefinitions();
