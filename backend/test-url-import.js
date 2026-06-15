const axios = require('axios');

const url = 'https://outlook.office365.com/owa/calendar/f4c67593d8e94418ab14e0087ba7cdc0@datasystem.com.br/7e278aaac7b34448954655d0160913fd3606670720141208884/calendar.ics';

// Token JWT do admin (precisa ser válido - pegar do localStorage do browser)
const token = 'SEU_TOKEN_AQUI';

async function testUrlImport() {
  try {
    console.log('🔍 Testando importação via URL...\n');
    
    const response = await axios.post('https://dsmetrics.online/api/ceremonies/calendar-import/url', 
      { url },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    console.log(`✅ Sucesso! Encontrou ${response.data.events.length} eventos de cerimônias\n`);
    
    if (response.data.events.length > 0) {
      console.log('📅 Eventos encontrados:\n');
      response.data.events.forEach((ev, i) => {
        console.log(`${i + 1}. ${ev.title}`);
        console.log(`   Data: ${ev.date} às ${ev.time}`);
        if (ev.description) {
          console.log(`   Descrição: ${ev.description.substring(0, 100)}...`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️ Nenhum evento encontrado com as palavras-chave de cerimônia entre 01/06/2025 e hoje.');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testUrlImport();
