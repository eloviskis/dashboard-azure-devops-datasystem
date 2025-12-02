// Script para mapear todos os campos customizados de um work item do Azure DevOps
require('dotenv').config();
const axios = require('axios');

const ORGANIZATION = process.env.AZURE_ORG;
const PROJECT = process.env.AZURE_PROJECT;
const PAT = process.env.AZURE_PAT;
const WORK_ITEM_ID = '78645'; // Ex: 12345

const url = `https://dev.azure.com/${ORGANIZATION}/${PROJECT}/_apis/wit/workitems/${WORK_ITEM_ID}?api-version=7.1`;

axios.get(url, {
  headers: {
    'Authorization': `Basic ${Buffer.from(':' + PAT).toString('base64')}`
  }
}).then(response => {
  const fields = response.data.fields;
  const customFields = Object.keys(fields).filter(k => k.startsWith('Custom.'));
  console.log('Campos customizados encontrados:');
  customFields.forEach(field => {
    console.log(`${field}:`, fields[field]);
  });
}).catch(err => {
  console.error('Erro ao buscar work item:', err.message);
});
