require('dotenv').config();
const { Client } = require('pg');

async function checkReincidencia() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');

    // Verifica reincidências
    const result = await client.query(`
      SELECT 
        assigned_to,
        COUNT(*) FILTER (WHERE type = 'Bug' AND reincidencia IS NOT NULL AND reincidencia != '') as bugs_com_reincidencia,
        COUNT(*) FILTER (WHERE type = 'Bug') as total_bugs,
        SUM(CASE WHEN type = 'Bug' AND reincidencia ~ '^[0-9]+$' THEN reincidencia::numeric ELSE 0 END) as soma_reincidencia
      FROM work_items
      WHERE assigned_to IS NOT NULL AND assigned_to != ''
      GROUP BY assigned_to
      HAVING COUNT(*) FILTER (WHERE type = 'Bug' AND reincidencia IS NOT NULL AND reincidencia != '') > 0
      ORDER BY soma_reincidencia DESC
      LIMIT 10
    `);

    console.log('📊 Top 10 - Pessoas com Reincidência:\n');
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.assigned_to}`);
      console.log(`   Bugs: ${row.total_bugs}`);
      console.log(`   Bugs com reincidência: ${row.bugs_com_reincidencia}`);
      console.log(`   Soma reincidência: ${row.soma_reincidencia}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkReincidencia();
