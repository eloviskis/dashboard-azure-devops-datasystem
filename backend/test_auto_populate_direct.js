const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard' });

const DONE_STATES = ['Closed', 'Finished', 'Resolved', 'Completed', 'Pronto', 'Done'];
const VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;
const TAG_PATTERN = /\[\d+\.\d+\.\d+\.\d+\]/;

async function main() {
  console.log('Buscando todos os pares versão/item...');

  const allPairs = await pool.query(`
    SELECT
      v.version,
      wi.work_item_id,
      wi.state,
      wi.bloqueio,
      wi.impedimento,
      wi.delivered_version,
      wi.tags,
      qtr.status AS current_status
    FROM (
      SELECT DISTINCT matches[1] AS version, work_item_id
      FROM work_items, regexp_matches(tags, '\\[(\\d+\\.\\d+\\.\\d+\\.\\d+)\\]', 'g') AS matches
      WHERE tags LIKE '%[%'
      UNION
      SELECT DISTINCT delivered_version AS version, work_item_id
      FROM work_items
      WHERE delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
        AND delivered_version IS NOT NULL AND delivered_version != ''
    ) v
    JOIN work_items wi ON wi.work_item_id = v.work_item_id
    LEFT JOIN qa_test_records qtr
      ON qtr.work_item_id = v.work_item_id AND qtr.version = v.version
  `);

  console.log('Total pares encontrados:', allPairs.rows.length);

  const toInsert = [];
  const toUpdate = [];

  for (const pair of allPairs.rows) {
    if (pair.current_status === 'done' || pair.current_status === 'blocked') continue;

    const hasDeliveredVersion = pair.delivered_version && VERSION_PATTERN.test(pair.delivered_version);
    const hasTagVersion = pair.tags && TAG_PATTERN.test(pair.tags);
    const hasBothVersionFields = hasDeliveredVersion && hasTagVersion;

    let newStatus;
    if (pair.bloqueio === true && pair.impedimento === true) {
      newStatus = 'blocked';
    } else if (DONE_STATES.includes(pair.state) && hasBothVersionFields) {
      newStatus = 'done';
    } else {
      newStatus = 'pending';
    }

    if (pair.current_status === null) {
      toInsert.push({ work_item_id: pair.work_item_id, version: pair.version, status: newStatus });
    } else if (pair.current_status === 'pending' && newStatus !== 'pending') {
      toUpdate.push({ work_item_id: pair.work_item_id, version: pair.version, status: newStatus });
    }
  }

  console.log('Para inserir:', toInsert.length);
  console.log('Para atualizar:', toUpdate.length);
  console.log('Status breakdown (toInsert):', toInsert.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {}));

  // Executa os inserts (apenas 10 para teste)
  const sample = toInsert.slice(0, 10);
  if (sample.length > 0) {
    const placeholders = sample.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(',');
    const flatValues = sample.flatMap(r => [r.work_item_id, r.version, r.status]);
    const res = await pool.query(
      `INSERT INTO qa_test_records (work_item_id, version, status) VALUES ${placeholders}
       ON CONFLICT (work_item_id, version) DO NOTHING`,
      flatValues
    );
    console.log('INSERT (amostra 10) rowCount:', res.rowCount);

    // Reverte para não poluir dados
    await pool.query(`DELETE FROM qa_test_records WHERE id > (SELECT MAX(id) - 10 FROM qa_test_records)`);
    console.log('Amostra revertida OK');
  }

  await pool.end();
}

main().catch(e => { console.error('ERRO:', e.message, e.stack); process.exit(1); });
