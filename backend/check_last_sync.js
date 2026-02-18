require('dotenv').config();
const { Client } = require('pg');

async function checkLastSync() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');

    // Verifica última sincronização
    const syncResult = await client.query(`
      SELECT 
        MAX(changed_date) as last_sync,
        COUNT(*) FILTER (WHERE ready_date IS NOT NULL AND ready_date != '') as items_with_dor,
        COUNT(*) FILTER (WHERE done_date IS NOT NULL AND done_date != '') as items_with_dod,
        COUNT(*) as total_items
      FROM work_items
    `);

    const { last_sync, items_with_dor, items_with_dod, total_items } = syncResult.rows[0];
    
    console.log('📊 Status do Banco:');
    console.log(`   Última sincronização: ${last_sync || 'N/A'}`);
    console.log(`   Total de itens: ${total_items}`);
    console.log(`   Itens com DOR: ${items_with_dor} (${((items_with_dor/total_items)*100).toFixed(2)}%)`);
    console.log(`   Itens com DOD: ${items_with_dod} (${((items_with_dod/total_items)*100).toFixed(2)}%)`);
    
    // Verifica alguns exemplos de itens com DOR
    console.log('\n📋 Exemplos de itens com DOR:');
    const examples = await client.query(`
      SELECT work_item_id, title, ready_date, done_date
      FROM work_items
      WHERE ready_date IS NOT NULL AND ready_date != ''
      ORDER BY changed_date DESC
      LIMIT 5
    `);
    
    examples.rows.forEach(row => {
      console.log(`   #${row.work_item_id}: ${row.title.substring(0, 50)}...`);
      console.log(`     DOR: ${row.ready_date}`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkLastSync();
