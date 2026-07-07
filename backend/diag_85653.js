const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard' });

async function main() {
  const r = await pool.query(`SELECT work_item_id, delivered_version, tags FROM work_items WHERE work_item_id = 85653`);
  const row = r.rows[0];
  console.log('work_item_id:', row.work_item_id);
  console.log('delivered_version:', JSON.stringify(row.delivered_version));
  console.log('tags:', JSON.stringify(row.tags));
  console.log('');
  // Testa os patterns
  const VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;
  const TAG_PATTERN = /\[\d+\.\d+\.\d+\.\d+\]/;
  console.log('hasDeliveredVersion:', VERSION_PATTERN.test(row.delivered_version ?? ''));
  console.log('hasTagVersion:', TAG_PATTERN.test(row.tags ?? ''));
  console.log('');
  // Mostra cada char das tags para ver se tem colchete
  if (row.tags) {
    console.log('Tags char codes (primeiros 40):');
    for (let i = 0; i < Math.min(row.tags.length, 40); i++) {
      process.stdout.write(`[${row.tags.charCodeAt(i)}='${row.tags[i]}'] `);
    }
    console.log('');
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
