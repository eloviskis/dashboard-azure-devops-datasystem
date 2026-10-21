// Migração: coluna de data de conclusão efetiva, usada como fallback quando closed_date do Azure
// DevOps está vazio (item chegou num estado completo mas nunca foi movido pra Closed).
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Executando migração de effective_closed_date...');

    await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS effective_closed_date TEXT`);
    console.log('  ✅ Coluna work_items.effective_closed_date OK');

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
