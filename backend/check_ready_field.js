const axios = require('axios');
require('dotenv').config();

async function checkReadyField() {
  try {
    const workItemId = 78765;
    const url = `https://dev.azure.com/datasystemsoftwares/USE/_apis/wit/workitems/${workItemId}?api-version=7.1`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + process.env.AZURE_PAT).toString('base64')}`
      }
    });
    
    const fields = response.data.fields;
    
    console.log('\n=== CAMPOS CUSTOM DO WORK ITEM 78765 ===\n');
    Object.keys(fields)
      .filter(k => k.startsWith('Custom.'))
      .sort()
      .forEach(k => {
        const val = fields[k];
        const display = typeof val === 'string' && val.length > 50 
          ? val.substring(0, 50) + '...' 
          : val;
        console.log(`${k}: ${JSON.stringify(display)}`);
      });
      
    console.log('\n=== CAMPOS QUE CONTÊM "START" ===\n');
    Object.keys(fields)
      .filter(k => k.toLowerCase().includes('start'))
      .forEach(k => {
        console.log(`${k}: ${JSON.stringify(fields[k])}`);
      });
    
  } catch (error) {
    console.error('Erro:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

checkReadyField();
