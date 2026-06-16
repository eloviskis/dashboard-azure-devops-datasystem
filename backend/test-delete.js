const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

(async () => {
  // Pegar um ID real
  const select = await p.query('SELECT id, team, ritual_type, scheduled_date, status FROM ceremony_records LIMIT 3');
  console.log('Registros:', JSON.stringify(select.rows, null, 2));
  
  // Testar o delete com o primeiro ID
  if (select.rows.length > 0) {
    const id = select.rows[0].id;
    console.log('\nTestando DELETE com id =', id);
    try {
      const del = await p.query('DELETE FROM ceremony_records WHERE id = $1 RETURNING id', [id]);
      console.log('Delete result:', del.rows);
      console.log('rowCount:', del.rowCount);
    } catch (e) {
      console.error('ERRO DELETE:', e.message);
    }
  }
  await p.end();
})();
