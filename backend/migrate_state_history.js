// Migração: tabela de histórico real de transição de estado + coluna de tempo por status calculado.
// Rodar com o DATABASE_URL apontando pro banco de produção (ver DATABASE_CONNECTION.md).
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Executando migração de histórico de status...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS work_item_state_transitions (
        id SERIAL PRIMARY KEY,
        work_item_id INTEGER NOT NULL,
        state TEXT NOT NULL,
        entered_at TIMESTAMPTZ NOT NULL,
        revision INTEGER
      )
    `);
    console.log('  ✅ Tabela work_item_state_transitions OK');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_state_transitions_work_item_id
      ON work_item_state_transitions(work_item_id)
    `);
    console.log('  ✅ Índice em work_item_id OK');

    await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS time_in_status_days JSONB`);
    console.log('  ✅ Coluna work_items.time_in_status_days OK');

    console.log('✅ Migração concluída!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
