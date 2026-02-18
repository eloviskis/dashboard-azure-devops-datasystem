require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDorCount() {
  try {
    console.log('Verificando estatísticas de DOR...\n');
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE ready_date IS NOT NULL) as com_dor,
        COUNT(*) FILTER (WHERE ready_date IS NULL) as sem_dor,
        COUNT(*) as total
      FROM work_items
    `);
    
    const { com_dor, sem_dor, total } = result.rows[0];
    const percentComDor = ((com_dor / total) * 100).toFixed(2);
    
    console.log('=' + '='.repeat(70));
    console.log('ESTATÍSTICAS DE DOR');
    console.log('=' + '='.repeat(70));
    console.log(`Total de itens: ${total}`);
    console.log(`Com DOR: ${com_dor} (${percentComDor}%)`);
    console.log(`Sem DOR: ${sem_dor}`);
    console.log('=' + '='.repeat(70));
    
    if (parseInt(com_dor) > 0) {
      console.log('\n✅ Há itens com DOR no banco!');
      
      // Mostrar alguns exemplos
      const examples = await pool.query(`
        SELECT work_item_id, title, ready_date
        FROM work_items
        WHERE ready_date IS NOT NULL
        ORDER BY ready_date DESC
        LIMIT 5
      `);
      
      console.log('\nExemplos de itens com DOR:');
      console.log('-'.repeat(70));
      examples.rows.forEach(row => {
        console.log(`ID: ${row.work_item_id} | DOR: ${row.ready_date}`);
        console.log(`   ${row.title.substring(0, 60)}`);
      });
    } else {
      console.log('\n❌ Nenhum item com DOR encontrado no banco');
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await pool.end();
  }
}

checkDorCount();
