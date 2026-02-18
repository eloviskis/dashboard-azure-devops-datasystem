require('dotenv').config();
const { Client } = require('pg');

async function analyzeReincidenciaLogic() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');

    // Verificar Issues com reincidência por time
    console.log('📊 ANÁLISE DE REINCIDÊNCIA POR TIME:\n');
    const teamResult = await client.query(`
      SELECT 
        team,
        COUNT(*) FILTER (WHERE type = 'Issue') as total_issues,
        COUNT(*) FILTER (WHERE type = 'Issue' AND reincidencia IS NOT NULL AND reincidencia != '') as issues_com_reincidencia,
        COUNT(*) FILTER (WHERE type = 'Issue' AND reincidencia ~ '^[0-9]+$' AND reincidencia::int > 0) as issues_reincidencia_maior_zero,
        SUM(CASE WHEN type = 'Issue' AND reincidencia ~ '^[0-9]+$' THEN reincidencia::int ELSE 0 END) as soma_reincidencia
      FROM work_items
      WHERE team IS NOT NULL AND team != ''
      GROUP BY team
      HAVING COUNT(*) FILTER (WHERE type = 'Issue' AND reincidencia IS NOT NULL AND reincidencia != '') > 0
      ORDER BY soma_reincidencia DESC
      LIMIT 10
    `);

    teamResult.rows.forEach(row => {
      console.log(`${row.team}:`);
      console.log(`  Total Issues: ${row.total_issues}`);
      console.log(`  Issues com campo preenchido: ${row.issues_com_reincidencia}`);
      console.log(`  Issues com reincidência > 0: ${row.issues_reincidencia_maior_zero}`);
      console.log(`  Soma total reincidências: ${row.soma_reincidencia}`);
      console.log('');
    });

    // Verificar valores específicos do campo reincidência
    console.log('\n📋 EXEMPLOS DE VALORES NO CAMPO REINCIDÊNCIA:\n');
    const examplesResult = await client.query(`
      SELECT 
        work_item_id,
        title,
        type,
        team,
        assigned_to,
        reincidencia,
        state
      FROM work_items
      WHERE type = 'Issue' 
        AND reincidencia IS NOT NULL 
        AND reincidencia != ''
      ORDER BY 
        CASE WHEN reincidencia ~ '^[0-9]+$' THEN reincidencia::int ELSE 0 END DESC,
        changed_date DESC
      LIMIT 20
    `);

    examplesResult.rows.forEach(row => {
      console.log(`#${row.work_item_id} [${row.state}]`);
      console.log(`  Título: ${row.title.substring(0, 60)}...`);
      console.log(`  Time: ${row.team || 'N/A'}`);
      console.log(`  Pessoa: ${row.assigned_to || 'N/A'}`);
      console.log(`  Reincidência: "${row.reincidencia}"`);
      console.log('');
    });

    // Verificar distribuição de valores
    console.log('\n📊 DISTRIBUIÇÃO DE VALORES DE REINCIDÊNCIA:\n');
    const distributionResult = await client.query(`
      SELECT 
        reincidencia as valor,
        COUNT(*) as quantidade
      FROM work_items
      WHERE type = 'Issue' 
        AND reincidencia IS NOT NULL 
        AND reincidencia != ''
      GROUP BY reincidencia
      ORDER BY quantidade DESC
      LIMIT 15
    `);

    distributionResult.rows.forEach(row => {
      console.log(`  Valor "${row.valor}": ${row.quantidade} issues`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

analyzeReincidenciaLogic();
