require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    // Buscar 10 itens QUE TEM ready_date preenchido
    const result = await pool.query(`
      SELECT id, title, type, state, ready_date, created_date 
      FROM work_items 
      WHERE ready_date IS NOT NULL
      ORDER BY id DESC
      LIMIT 10
    `);
    
    console.log('\n✅ 10 itens mais recentes COM ready_date preenchido:\n');
    if (result.rows.length === 0) {
      console.log('❌ Nenhum item com ready_date encontrado');
    } else {
      result.rows.forEach(i => {
        console.log(`ID: ${i.id}`);
        console.log(`   Title: ${i.title}`);
        console.log(`   Type: ${i.type}`);
        console.log(`   State: ${i.state}`);
        console.log(`   Created: ${i.created_date}`);
        console.log(`   Ready Date: ${i.ready_date}`);
        console.log('');
      });
    }
    
    await pool.end();
  } catch (error) {
    console.error('Erro:', error.message);
    await pool.end();
  }
})();
