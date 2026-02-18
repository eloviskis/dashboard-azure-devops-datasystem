require('dotenv').config();
const https = require('https');

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG || 'datasystemsoftwares';
const AZURE_PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'USE';
const AZURE_PAT = process.env.AZURE_DEVOPS_PAT;

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function fetchItem80886() {
  try {
    console.log('\nBuscando item 80886 do Azure DevOps...\n');
    
    const url = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems/80886?api-version=7.1`;
    const auth = 'Basic ' + Buffer.from(':' + AZURE_PAT).toString('base64');
    
    const res = await httpsRequest(url, {
      method: 'GET',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' }
    });
    
    if (res.status !== 200) {
      console.log('Erro:', res.status, res.data);
      return;
    }
    
    const item = res.data;
    const fields = item.fields;
    
    console.log('✅ Item encontrado!');
    console.log(`ID: ${fields['System.Id']}`);
    console.log(`Título: ${fields['System.Title']}`);
    console.log(`Tipo: ${fields['System.WorkItemType']}`);
    console.log();
    
    console.log('=== CAMPOS CUSTOM ===\n');
    
    const customFields = Object.keys(fields)
      .filter(k => k.startsWith('Custom.'))
      .sort();
    
    if (customFields.length === 0) {
      console.log('❌ Nenhum campo Custom encontrado');
    } else {
      customFields.forEach(key => {
        const value = fields[key];
        const display = value === null || value === undefined ? '(vazio)' : 
                       typeof value === 'object' ? JSON.stringify(value) :
                       value.toString();
        console.log(`${key}: ${display}`);
      });
    }
    
    console.log('\n=== CAMPOS COM "DOR" NO NOME ===\n');
    
    const allKeys = Object.keys(fields);
    const dorKeys = allKeys.filter(k => k.toLowerCase().includes('dor') || k.toLowerCase().includes('ready'));
    
    if (dorKeys.length > 0) {
      dorKeys.forEach(key => {
        console.log(`✅ ENCONTRADO: ${key} = ${fields[key] || '(vazio)'}`);
      });
    } else {
      console.log('❌ Nenhum campo com "dor" ou "ready" encontrado');
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

fetchItem80886();
