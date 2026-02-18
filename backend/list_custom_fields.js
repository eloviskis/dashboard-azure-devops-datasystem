require('dotenv').config();
const axios = require('axios');

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG || 'datasystemsoftwares';
const AZURE_PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'USE';
const AZURE_PAT = process.env.AZURE_DEVOPS_PAT;

async function listCustomFields() {
  try {
    console.log('\nListando campos custom do projeto USE...\n');
    
    // Lista todos os campos (work item fields)
    const url = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/fields?api-version=7.1`;
    
    const response = await axios.get(url, {
      auth: {
        username: '',
        password: AZURE_PAT
      }
    });
    
    if (!response.data || !response.data.value) {
      console.log('Erro: Resposta inválida');
      return;
    }
    
    const customFields = response.data.value.filter(f => f.referenceName.startsWith('Custom.'));
    
    console.log(`Total de campos custom: ${customFields.length}\n`);
    console.log('=== CAMPOS CUSTOM ===\n');
    
    customFields.forEach(field => {
      console.log(`Nome: ${field.name}`);
      console.log(`   Reference: ${field.referenceName}`);
      console.log(`   Type: ${field.type}`);
      console.log('');
    });
    
    console.log('\n=== CAMPOS COM "DOR" ou "READY" ===\n');
    const dorFields = customFields.filter(f => 
      f.name.toLowerCase().includes('dor') || 
      f.name.toLowerCase().includes('ready') ||
      f.referenceName.toLowerCase().includes('dor') ||
      f.referenceName.toLowerCase().includes('ready')
    );
    
    if (dorFields.length > 0) {
      dorFields.forEach(field => {
        console.log(`✅ ${field.name} → ${field.referenceName}`);
      });
    } else {
      console.log('❌ Nenhum campo com DOR ou READY encontrado');
      console.log('\n💡 Procure pelo nome que você vê na interface (ex: DOR!)');
      console.log('   e me diga qual Reference Name corresponde a ele');
    }
    
  } catch (error) {
    if (error.response) {
      console.error('Erro na API:', error.response.status);
      if (error.response.status === 401 || error.response.status === 203) {
        console.error('\n❌ Problema de autenticação!');
        console.error('Verifique se o AZURE_DEVOPS_PAT no .env está correto');
      }
    } else {
      console.error('Erro:', error.message);
    }
  }
}

listCustomFields();
