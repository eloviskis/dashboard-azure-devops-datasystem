const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard' });

async function main() {
  // Colunas de work_items
  const r1 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='work_items' ORDER BY ordinal_position`);
  console.log('=== work_items colunas ===');
  r1.rows.forEach(c => console.log(' ', c.column_name, ':', c.data_type));

  // Colunas de qa_test_records
  const r2 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='qa_test_records' ORDER BY ordinal_position`);
  console.log('\n=== qa_test_records colunas ===');
  r2.rows.forEach(c => console.log(' ', c.column_name, ':', c.data_type));

  // 1 linha de exemplo de work_items
  const r3 = await pool.query(`SELECT * FROM work_items LIMIT 1`);
  console.log('\n=== 1 linha work_items ===');
  console.log(Object.keys(r3.rows[0]));

  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
