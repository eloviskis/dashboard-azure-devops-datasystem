require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let ultimaChecagem = {
  comDor: 0,
  comDod: 0,
  ultimoSync: null
};

async function monitorarDados() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE ready_date IS NOT NULL) as com_dor,
        COUNT(*) FILTER (WHERE done_date IS NOT NULL) as com_dod,
        COUNT(*) as total,
        MAX(last_sync) as ultimo_sync
      FROM work_items
    `);
    
    const { com_dor, com_dod, total, ultimo_sync } = result.rows[0];
    const percentDor = ((com_dor / total) * 100).toFixed(2);
    const percentDod = ((com_dod / total) * 100).toFixed(2);
    
    const agora = new Date().toLocaleTimeString('pt-BR');
    const syncTime = ultimo_sync ? new Date(ultimo_sync).toLocaleTimeString('pt-BR') : 'N/A';
    
    console.clear();
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(20) + '📊 MONITOR DE SINCRONIZAÇÃO' + ' '.repeat(30) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');
    console.log();
    console.log(`🕒 Última verificação: ${agora}`);
    console.log(`🔄 Último sync: ${syncTime}`);
    console.log('─'.repeat(80));
    
    // Exibir estatísticas
    console.log('\n📈 ESTATÍSTICAS ATUAIS:');
    console.log('─'.repeat(80));
    console.log(`Total de itens: ${parseInt(total).toLocaleString('pt-BR')}`);
    console.log();
    console.log(`DOR (Definition of Ready):`);
    console.log(`   ├─ Com DOR: ${parseInt(com_dor).toLocaleString('pt-BR')} (${percentDor}%)`);
    console.log(`   └─ Sem DOR: ${parseInt(total - com_dor).toLocaleString('pt-BR')}`);
    console.log();
    console.log(`DOD (Definition of Done):`);
    console.log(`   ├─ Com DOD: ${parseInt(com_dod).toLocaleString('pt-BR')} (${percentDod}%)`);
    console.log(`   └─ Sem DOD: ${parseInt(total - com_dod).toLocaleString('pt-BR')}`);
    
    // Detectar mudanças
    const mudancaDor = parseInt(com_dor) - ultimaChecagem.comDor;
    const mudancaDod = parseInt(com_dod) - ultimaChecagem.comDod;
    const syncMudou = ultimo_sync !== ultimaChecagem.ultimoSync;
    
    if (syncMudou || mudancaDor !== 0 || mudancaDod !== 0) {
      console.log('\n─'.repeat(80));
      console.log('🔔 MUDANÇAS DETECTADAS:');
      console.log('─'.repeat(80));
      
      if (syncMudou) {
        console.log('✅ Sincronização executada!');
      }
      
      if (mudancaDor !== 0) {
        const sinal = mudancaDor > 0 ? '+' : '';
        const emoji = mudancaDor > 0 ? '⬆️' : '⬇️';
        console.log(`${emoji} DOR: ${sinal}${mudancaDor.toLocaleString('pt-BR')} itens`);
      }
      
      if (mudancaDod !== 0) {
        const sinal = mudancaDod > 0 ? '+' : '';
        const emoji = mudancaDod > 0 ? '⬆️' : '⬇️';
        console.log(`${emoji} DOD: ${sinal}${mudancaDod.toLocaleString('pt-BR')} itens`);
      }
      
      // Atualizar estado
      ultimaChecagem.comDor = parseInt(com_dor);
      ultimaChecagem.comDod = parseInt(com_dod);
      ultimaChecagem.ultimoSync = ultimo_sync;
    }
    
    // Mostrar exemplos recentes
    if (parseInt(com_dor) > 0) {
      const exemplos = await pool.query(`
        SELECT work_item_id, title, ready_date
        FROM work_items
        WHERE ready_date IS NOT NULL
        ORDER BY ready_date DESC
        LIMIT 3
      `);
      
      if (exemplos.rows.length > 0) {
        console.log('\n─'.repeat(80));
        console.log('📋 ÚLTIMOS ITENS COM DOR:');
        console.log('─'.repeat(80));
        exemplos.rows.forEach((row, i) => {
          const data = new Date(row.ready_date).toLocaleDateString('pt-BR');
          console.log(`${i + 1}. #${row.work_item_id} - DOR: ${data}`);
          console.log(`   ${row.title.substring(0, 70)}${row.title.length > 70 ? '...' : ''}`);
        });
      }
    }
    
    console.log('\n─'.repeat(80));
    console.log('💡 Pressione Ctrl+C para parar o monitoramento');
    console.log('🔄 Próxima verificação em 30 segundos...');
    console.log('─'.repeat(80));
    
  } catch (error) {
    console.error('❌ Erro ao monitorar:', error.message);
  }
}

// Iniciar monitoramento
console.log('🚀 Iniciando monitoramento...\n');

// Primeira checagem imediata
monitorarDados();

// Verificar a cada 30 segundos
const intervalo = setInterval(monitorarDados, 30000);

// Cleanup ao sair
process.on('SIGINT', async () => {
  console.log('\n\n👋 Encerrando monitoramento...');
  clearInterval(intervalo);
  await pool.end();
  process.exit(0);
});
