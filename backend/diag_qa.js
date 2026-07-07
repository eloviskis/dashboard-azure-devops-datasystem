const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard' });

async function q(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function main() {
  // 1. Itens fechados com versão no delivered_version
  const r1 = await q(`SELECT COUNT(*) AS total FROM work_items
    WHERE state IN ('Closed','Finished','Resolved','Completed','Pronto','Done')
      AND delivered_version IS NOT NULL AND delivered_version != ''
      AND delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'`);
  console.log('Fechados com delivered_version valido:', r1[0].total);

  // 2. Itens fechados com versão na tag
  const r2 = await q(`SELECT COUNT(*) AS total FROM work_items
    WHERE state IN ('Closed','Finished','Resolved','Completed','Pronto','Done')
      AND tags LIKE '%[%'
      AND tags ~ '\\[\\d+\\.\\d+\\.\\d+\\.\\d+\\]'`);
  console.log('Fechados com versao em tags:', r2[0].total);

  // 3. QA records existentes por status
  const r3 = await q(`SELECT status, COUNT(*) AS total FROM qa_test_records GROUP BY status ORDER BY 2 DESC`);
  console.log('\nQA records por status:');
  r3.forEach(r => console.log(' ', r.status, '->', r.total));

  // 4. Itens fechados com delivered_version SEM registro QA
  const r4 = await q(`SELECT COUNT(*) AS total FROM work_items w
    WHERE w.state IN ('Closed','Finished','Resolved','Completed','Pronto','Done')
      AND w.delivered_version IS NOT NULL AND w.delivered_version != ''
      AND w.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
      AND NOT EXISTS (
        SELECT 1 FROM qa_test_records q WHERE q.work_item_id = w.id AND q.version = w.delivered_version
      )`);
  console.log('\nFechados c/ delivered_version SEM registro QA:', r4[0].total);

  // 5. Itens com registro QA pending que deveriam ser done
  const r5 = await q(`SELECT COUNT(*) AS total FROM qa_test_records q
    JOIN work_items w ON w.id = q.work_item_id
    WHERE q.status = 'pending'
      AND w.state IN ('Closed','Finished','Resolved','Completed','Pronto','Done')`);
  console.log('Pendentes no QA que deveriam ser done:', r5[0].total);

  // 6. Exemplos de itens fechados SEM registro QA
  const r6 = await q(`SELECT w.id, w.title, w.state, w.delivered_version FROM work_items w
    WHERE w.state IN ('Closed','Finished','Resolved','Completed','Pronto','Done')
      AND w.delivered_version IS NOT NULL AND w.delivered_version != ''
      AND w.delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'
      AND NOT EXISTS (SELECT 1 FROM qa_test_records q WHERE q.work_item_id = w.id)
    LIMIT 5`);
  console.log('\nExemplos sem registro QA:');
  r6.forEach(r => console.log(' ', r.id, r.state, r.delivered_version, '-', String(r.title).slice(0,60)));

  // 7. Total de versoes distintas com itens fechados
  const r7 = await q(`SELECT COUNT(DISTINCT delivered_version) AS total FROM work_items
    WHERE state IN ('Closed','Finished','Resolved','Completed','Pronto','Done')
      AND delivered_version ~ '^\\d+\\.\\d+\\.\\d+\\.\\d+$'`);
  console.log('\nVersions distintas com itens fechados:', r7[0].total);

  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
