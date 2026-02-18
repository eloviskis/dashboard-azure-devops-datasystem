require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verificarDados() {
  try {
    console.log('Consultando banco de dados...\n');
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE ready_date IS NOT NULL) as com_dor,
        COUNT(*) FILTER (WHERE done_date IS NOT NULL) as com_dod,
        COUNT(*) as total
      FROM work_items
    `);
    
    const row = result.rows[0];
    const comDor = parseInt(row.com_dor);
    const comDod = parseInt(row.com_dod);
    const total = parseInt(row.total);
    
    const percentDor = ((comDor / total) * 100).toFixed(2);
    const percentDod = ((comDod / total) * 100).toFixed(2);
    
    console.log('═'.repeat(70));
    console.log('📊 ESTATÍSTICAS DE DOR E DOD');
    console.log('═'.repeat(70));
    console.log();
    console.log(`Total de itens: ${total.toLocaleString('pt-BR')}`);
    console.log();
    console.log('DOR (Definition of Ready):');
    console.log(`  ✅ Com DOR: ${comDor.toLocaleString('pt-BR')} (${percentDor}%)`);
    console.log(`  ⭕ Sem DOR: ${(total - comDor).toLocaleString('pt-BR')}`);
    console.log();
    console.log('DOD (Definition of Done):');
    console.log(`  ✅ Com DOD: ${comDod.toLocaleString('pt-BR')} (${percentDod}%)`);
    console.log(`  ⭕ Sem DOD: ${(total - comDod).toLocaleString('pt-BR')}`);
    console.log();
    console.log('═'.repeat(70));
    
    // Mostrar alguns exemplos
    if (comDor > 0) {
      console.log('\n📋 Últimos 5 itens com DOR:');
      console.log('─'.repeat(70));
      
      const exemplos = await pool.query(`
        SELECT work_item_id, title, ready_date
        FROM work_items
        WHERE ready_date IS NOT NULL
        ORDER BY ready_date DESC
        LIMIT 5
      `);
      
      exemplos.rows.forEach((item, i) => {
        const data = new Date(item.ready_date).toLocaleString('pt-BR');
        console.log(`${i + 1}. #${item.work_item_id} - ${data}`);
        console.log(`   ${item.title.substring(0, 65)}...`);
      });
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

verificarDados();
