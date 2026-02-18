const { Pool } = require('pg');

const pool = new Pool({ 
  connectionString: 'postgresql://devops_dash:6BYHS3gSL%2FzBNnoEW%2Bt9mev84%2FJwv5ke%2BJdfOzM7jXQ%3D@31.97.64.250:5433/devops_dashboard',
  ssl: false 
});

async function checkData() {
  try {
    // Estatísticas
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN identificacao IS NOT NULL AND identificacao != '' THEN 1 END) as com_identificacao,
        COUNT(CASE WHEN falha_do_processo IS NOT NULL AND falha_do_processo != '' THEN 1 END) as com_falha
      FROM work_items
    `);
    
    console.log('\n📊 Estatísticas dos novos campos:');
    console.log(`   Total de work items: ${stats.rows[0].total}`);
    console.log(`   Com identificação: ${stats.rows[0].com_identificacao}`);
    console.log(`   Com falha do processo: ${stats.rows[0].com_falha}\n`);
    
    // Exemplos
    const examples = await pool.query(`
      SELECT id, work_item_id, title, identificacao, falha_do_processo 
      FROM work_items 
      WHERE (identificacao IS NOT NULL AND identificacao != '') 
         OR (falha_do_processo IS NOT NULL AND falha_do_processo != '')
      ORDER BY changed_date DESC 
      LIMIT 5
    `);
    
    if (examples.rows.length > 0) {
      console.log('✅ Exemplos de registros populados:\n');
      examples.rows.forEach(row => {
        console.log(`  [${row.work_item_id}] ${row.title.substring(0, 60)}...`);
        console.log(`    Identificação: ${row.identificacao || 'N/A'}`);
        console.log(`    Falha: ${row.falha_do_processo || 'N/A'}\n`);
      });
    } else {
      console.log('⚠️ Nenhum registro com dados nesses campos ainda.');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();
