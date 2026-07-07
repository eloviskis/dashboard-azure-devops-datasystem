const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard' });

async function main() {
  // Total de registros por status
  const r1 = await pool.query(`SELECT status, COUNT(*) n FROM qa_test_records GROUP BY status ORDER BY 2 DESC`);
  console.log('=== qa_test_records por status ===');
  r1.rows.forEach(r => console.log(' ', r.status, '->', r.n));

  // Registros 'done' onde o item NÃO tem os dois campos de versão
  const r2 = await pool.query(`
    SELECT COUNT(*) AS total
    FROM qa_test_records q
    JOIN work_items wi ON wi.work_item_id = q.work_item_id
    WHERE q.status = 'done'
      AND NOT (
        wi.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
        AND wi.tags ~ '\\[\\d+\\.\\d+\\.\\d+\\.\\d+\\]'
      )
  `);
  console.log('\nDone sem os DOIS campos de versão (precisam correção):', r2.rows[0].total);

  // Registros 'done' onde o item TEM os dois campos de versão (corretos)
  const r3 = await pool.query(`
    SELECT COUNT(*) AS total
    FROM qa_test_records q
    JOIN work_items wi ON wi.work_item_id = q.work_item_id
    WHERE q.status = 'done'
      AND wi.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
      AND wi.tags ~ '\\[\\d+\\.\\d+\\.\\d+\\.\\d+\\]'
  `);
  console.log('Done COM os dois campos (corretos):', r3.rows[0].total);

  // Exemplos de done incorretos
  const r4 = await pool.query(`
    SELECT wi.work_item_id, wi.state, wi.delivered_version,
           SUBSTRING(wi.tags, 1, 60) AS tags_sample
    FROM qa_test_records q
    JOIN work_items wi ON wi.work_item_id = q.work_item_id
    WHERE q.status = 'done'
      AND NOT (
        wi.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
        AND wi.tags ~ '\\[\\d+\\.\\d+\\.\\d+\\.\\d+\\]'
      )
    LIMIT 5
  `);
  console.log('\nExemplos incorretos:');
  r4.rows.forEach(r => console.log(' ', r.work_item_id, r.state, '| dv:', r.delivered_version, '| tags:', r.tags_sample));

  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
