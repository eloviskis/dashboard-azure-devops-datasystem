require('dotenv').config();
const axios = require('axios');

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG || 'datasystemsoftwares';
const AZURE_PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'USE';
const AZURE_PAT = process.env.AZURE_DEVOPS_PAT;

async function findDORField() {
  try {
    // Item 80886 que o usuário mencionou
    const itemId = 80886;
    
    console.log(`\nBuscando campos do item ${itemId} no Azure DevOps...\n`);
    
    const url = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems/${itemId}?api-version=7.1&$expand=all`;
    
    const response = await axios.get(url, {
      auth: {
        username: '',
        password: AZURE_PAT
      }
    });
    
    console.log('Status da resposta:', response.status);
    
    if (!response.data || !response.data.fields) {
      console.log('Erro: Resposta não contém fields');
      console.log('Dados recebidos:', JSON.stringify(response.data, null, 2).substring(0, 500));
      return;
    }
    
    const fields = response.data.fields;
    
    console.log('=== CAMPOS CUSTOM ENCONTRADOS ===\n');
    Object.keys(fields)
      .filter(key => key.startsWith('Custom.'))
      .sort()
      .forEach(key => {
        const value = fields[key];
        const displayValue = value ? (typeof value === 'object' ? JSON.stringify(value) : value) : '(vazio)';
        console.log(`${key}: ${displayValue}`);
      });
    
    console.log('\n=== BUSCANDO CAMPO DOR ===\n');
    const dorFields = Object.keys(fields).filter(key => 
      key.toLowerCase().includes('dor') || 
      key.toLowerCase().includes('ready')
    );
    
    if (dorFields.length === 0) {
      console.log('❌ Nenhum campo com "DOR" ou "READY" encontrado');
      console.log('\n💡 O campo pode ter outro nome. Listando TODOS os campos Custom:');
    } else {
      console.log('✅ Campos relacionados a DOR/READY:');
      dorFields.forEach(key => {
        console.log(`   ${key}: ${fields[key] || '(vazio)'}`);
      });
    }
    
  } catch (error) {
    if (error.response) {
      console.error('Erro na API:', error.response.status, error.response.statusText);
    } else {
      console.error('Erro:', error.message);
    }
  }
}

findDORField();
