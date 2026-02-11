// Script de migração para adicionar novos campos de Root Cause
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://devops_dash:6BYHS3gSL%2FzBNnoEW%2Bt9mev84%2FJwv5ke%2BJdfOzM7jXQ%3D@31.97.64.250:5433/devops_dashboard',
  ssl: false
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Executando migração...');
    
    const columns = [
      'root_cause_task',
      'root_cause_team',
      'root_cause_version',
      'dev',
      'platform',
      'application',
      'branch_base',
      'delivered_version',
      'base_version'
    ];
    
    for (const col of columns) {
      await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS ${col} TEXT`);
      console.log(`  ✅ Coluna ${col} OK`);
    }
    
    console.log('✅ Migração concluída!');
    
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'work_items' 
      AND column_name IN ('root_cause_task', 'root_cause_team', 'root_cause_version', 'dev', 'platform', 'application', 'branch_base', 'delivered_version', 'base_version')
    `);
    console.log('📋 Novas colunas verificadas:', result.rows.map(r => r.column_name).join(', '));
    
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
