require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    const result = await pool.query(
      'SELECT id, title, ready_date, created_date FROM work_items WHERE id BETWEEN 80880 AND 80890 ORDER BY id'
    );
    
    console.log('\nItens entre 80880 e 80890:\n');
    if (result.rows.length === 0) {
      console.log('❌ Nenhum item encontrado nesta faixa');
    } else {
      result.rows.forEach(i => {
        console.log(`ID: ${i.id}`);
        console.log(`   Title: ${i.title}`);
        console.log(`   Created: ${i.created_date}`);
        console.log(`   Ready Date: ${i.ready_date || '❌ NULL'}`);
        console.log('');
      });
    }
    
    await pool.end();
  } catch (error) {
    console.error('Erro:', error.message);
    await pool.end();
  }
})();
