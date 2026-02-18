require('dotenv').config();
const axios = require('axios');

const AZURE_ORG = process.env.AZURE_DEVOPS_ORG || 'datasystemsoftwares';
const AZURE_PROJECT = process.env.AZURE_DEVOPS_PROJECT || 'USE';
const AZURE_PAT = process.env.AZURE_DEVOPS_PAT;

async function checkItem() {
  try {
    const itemId = 80886;
    const url = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems/${itemId}?api-version=7.1`;
    
    console.log(`\nBuscando item ${itemId}...`);
    console.log(`URL: ${url}\n`);
    
    const response = await axios.get(url, {
      auth: {
        username: '',
        password: AZURE_PAT
      }
    });
    
    const item = response.data;
    
    console.log('Response status:', response.status);
    console.log('Response data type:', typeof item);
    console.log('Response keys:', Object.keys(item));
    
    if (!item.fields) {
      console.log('Erro: item.fields não encontrado');
      console.log('Item completo:', JSON.stringify(item, null, 2));
      return;
    }
    
    const fields = item.fields;
    
    console.log('=== INFORMAÇÕES DO ITEM ===');
    console.log(`ID: ${fields['System.Id']}`);
    console.log(`Title: ${fields['System.Title']}`);
    console.log(`Type: ${fields['System.WorkItemType']}`);
    console.log(`State: ${fields['System.State']}`);
    console.log(`Created By: ${fields['System.CreatedBy']?.displayName}`);
    console.log(`Created Date: ${fields['System.CreatedDate']}`);
    
    console.log('\n=== CAMPOS CUSTOM ===');
    Object.keys(fields)
      .filter(key => key.startsWith('Custom.'))
      .forEach(key => {
        console.log(`${key}: ${fields[key]}`);
      });
    
    console.log('\n=== CAMPOS RELACIONADOS A "READY" ===');
    Object.keys(fields)
      .filter(key => key.toLowerCase().includes('ready'))
      .forEach(key => {
        console.log(`${key}: ${fields[key]}`);
      });
    
    console.log('\n=== CAMPOS RELACIONADOS A "DOR" ===');
    Object.keys(fields)
      .filter(key => key.toLowerCase().includes('dor'))
      .forEach(key => {
        console.log(`${key}: ${fields[key]}`);
      });
    
    console.log('\n=== CAMPO Custom.ReadyDate ESPECIFICAMENTE ===');
    console.log(`Custom.ReadyDate: ${fields['Custom.ReadyDate'] || '(não encontrado)'}`);
    
  } catch (error) {
    console.error('Erro ao buscar item:', error.response?.data || error.message);
  }
}

checkItem();
