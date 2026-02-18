require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG || 'datasystemsoftwares';
const AZURE_PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'USE';
const AZURE_PAT = process.env.AZURE_DEVOPS_PAT;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function findDORFieldName() {
  try {
    // 1. Pegar um item recente do banco
    const dbResult = await pool.query(
      'SELECT id, title FROM work_items ORDER BY id DESC LIMIT 1'
    );
    
    if (dbResult.rows.length === 0) {
      console.log('Nenhum item no banco');
      return;
    }
    
    const itemId = dbResult.rows[0].id;
    console.log(`\nBuscando item ${itemId} - ${dbResult.rows[0].title}\n`);
    
    // 2. Buscar no Azure DevOps
    const wiql = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.Id] = ${itemId}`
    };
    
    const wiqlResponse = await axios.post(
      `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/wiql?api-version=7.1`,
      wiql,
      {
        auth: { username: '', password: AZURE_PAT },
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    if (!wiqlResponse.data.workItems || wiqlResponse.data.workItems.length === 0) {
      console.log('Item não encontrado no Azure DevOps');
      return;
    }
    
    // 3. Buscar detalhes do item
    const itemUrl = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems/${itemId}?api-version=7.1`;
    const itemResponse = await axios.get(itemUrl, {
      auth: { username: '', password: AZURE_PAT }
    });
    
    const fields = itemResponse.data.fields;
    
    console.log('=== TODOS OS CAMPOS CUSTOM ===\n');
    Object.keys(fields)
      .filter(k => k.startsWith('Custom.'))
      .sort()
      .forEach(key => {
        const val = fields[key];
        const display = val ? (typeof val === 'object' ? JSON.stringify(val) : val) : '(vazio)';
        console.log(`${key}: ${display}`);
      });
    
    console.log('\n=== CAMPOS COM "DOR" ou "READY" ===\n');
    const dorFields = Object.keys(fields).filter(k => 
      k.toLowerCase().includes('dor') || k.toLowerCase().includes('ready')
    );
    
    if (dorFields.length > 0) {
      dorFields.forEach(key => {
        console.log(`✅ ${key}: ${fields[key] || '(vazio)'}`);
      });
    } else {
      console.log('❌ Nenhum campo com DOR ou READY encontrado');
    }
    
  } catch (error) {
    console.error('Erro:', error.response?.data || error.message);
  } finally {
    await pool.end();
  }
}

findDORFieldName();
