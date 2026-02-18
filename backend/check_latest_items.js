require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkLatestItems() {
  try {
    console.log('\nVerificando os itens mais recentes no banco...\n');
    
    // Buscar os 10 itens com ID mais alto
    const result = await pool.query(
      `SELECT id, title, type, state, created_date, ready_date, synced_at
       FROM work_items 
       ORDER BY id DESC 
       LIMIT 10`
    );
    
    console.log('✅ 10 itens com ID mais alto no banco:');
    console.log('─'.repeat(80));
    result.rows.forEach(item => {
      console.log(`ID: ${item.id} | Created: ${item.created_date} | Ready: ${item.ready_date || 'NULL'}`);
      console.log(`   Title: ${item.title}`);
      console.log('');
    });
    console.log('─'.repeat(80));
    
    // Verificar última sincronização
    const lastSync = await pool.query(
      `SELECT MAX(synced_at) as last_sync FROM work_items`
    );
    
    console.log(`\n⏰ Última sincronização: ${lastSync.rows[0].last_sync}`);
    
    // Contar total de itens
    const count = await pool.query(`SELECT COUNT(*) as total FROM work_items`);
    console.log(`📊 Total de itens no banco: ${count.rows[0].total}`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await pool.end();
  }
}

checkLatestItems();
