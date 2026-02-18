require('dotenv').config();
const https = require('https');

const AZURE_ORG = process.env.AZURE_ORG;
const AZURE_PROJECT = process.env.AZURE_PROJECT;
const AZURE_PAT = process.env.AZURE_PAT;

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function listFields() {
  try {
    console.log('Listando campos do projeto...\n');
    
    const url = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/fields?api-version=7.1`;
    const auth = 'Basic ' + Buffer.from(':' + AZURE_PAT).toString('base64');
    
    const res = await httpsRequest(url, {
      method: 'GET',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      }
    });
    
    if (res.value) {
      console.log(`Total de campos: ${res.value.length}\n`);
      
      // Filtrar campos que contenham "ready", "dor", "done", "date" no nome ou referência
      const relevantFields = res.value.filter(f => {
        const name = (f.name || '').toLowerCase();
        const refName = (f.referenceName || '').toLowerCase();
        return name.includes('ready') || name.includes('dor') || name.includes('done') || 
               refName.includes('ready') || refName.includes('dor') || refName.includes('done') ||
               (name.includes('date') && refName.includes('custom'));
      });
      
      console.log('Campos relevantes (com ready, dor, done, ou custom date):');
      console.log('='.repeat(80));
      relevantFields.forEach(f => {
        console.log(`Nome: ${f.name}`);
        console.log(`ReferenceName: ${f.referenceName}`);
        console.log(`Tipo: ${f.type}`);
        console.log('-'.repeat(80));
      });
      
      console.log(`\nTotal de campos relevantes: ${relevantFields.length}`);
    } else {
      console.log('Resposta inesperada:', res);
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

listFields();
