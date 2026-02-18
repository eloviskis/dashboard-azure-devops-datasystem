require('dotenv').config();
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'https://backend-hazel-three-14.vercel.app';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function triggerSync() {
  try {
    console.log('🔐 Fazendo login...');
    
    // 1. Login para obter token
    const loginResponse = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login realizado com sucesso\n');
    
    // 2. Acionar sincronização
    console.log('🔄 Acionando sincronização manual...');
    const syncStart = Date.now();
    
    const syncResponse = await axios.post(`${BACKEND_URL}/api/sync`, {}, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 300000 // 5 minutos
    });
    
    const syncDuration = ((Date.now() - syncStart) / 1000).toFixed(2);
    
    console.log(`✅ Sincronização concluída em ${syncDuration}s\n`);
    console.log('📊 Resultado:');
    console.log(JSON.stringify(syncResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
    process.exit(1);
  }
}

triggerSync();
