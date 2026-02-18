require('dotenv').config();
const { Client } = require('pg');

async function checkReincidenciaData() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');

    // Verifica se há QUALQUER dado de reincidência
    const total = await client.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE reincidencia IS NOT NULL) as items_com_reincidencia_nao_null,
        COUNT(*) FILTER (WHERE reincidencia IS NOT NULL AND reincidencia != '') as items_com_reincidencia_preenchido,
        COUNT(*) FILTER (WHERE type = 'Bug') as total_bugs,
        COUNT(*) FILTER (WHERE type = 'Bug' AND reincidencia IS NOT NULL AND reincidencia != '') as bugs_com_reincidencia
      FROM work_items
    `);

    console.log('📊 Status Geral de Reincidência:');
    console.log(`   Total de itens: ${total.rows[0].total_items}`);
    console.log(`   Itens com reincidencia NOT NULL: ${total.rows[0].items_com_reincidencia_nao_null}`);
    console.log(`   Itens com reincidencia preenchido: ${total.rows[0].items_com_reincidencia_preenchido}`);
    console.log(`   Total de Bugs: ${total.rows[0].total_bugs}`);
    console.log(`   Bugs com reincidencia: ${total.rows[0].bugs_com_reincidencia}`);
    
    // Busca alguns exemplos
    console.log('\n📋 Exemplos de itens com reincidencia:');
    const examples = await client.query(`
      SELECT work_item_id, title, type, assigned_to, reincidencia
      FROM work_items
      WHERE reincidencia IS NOT NULL AND reincidencia != ''
      LIMIT 10
    `);
    
    if (examples.rows.length === 0) {
      console.log('   ❌ Nenhum item com reincidencia encontrado!');
    } else {
      examples.rows.forEach(row => {
        console.log(`   #${row.work_item_id} [${row.type}] - ${row.title.substring(0, 40)}...`);
        console.log(`     Atribuído: ${row.assigned_to || 'N/A'}`);
        console.log(`     Reincidência: ${row.reincidencia}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkReincidenciaData();
