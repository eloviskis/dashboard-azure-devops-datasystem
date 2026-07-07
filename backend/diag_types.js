const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard' });
async function main() {
  const r = await pool.query(`SELECT DISTINCT type FROM work_items ORDER BY type`);
  r.rows.forEach(x => console.log(JSON.stringify(x.type)));
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
