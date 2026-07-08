// backend/seed_qa_tracker.js
// Popula qa_test_records para os work items que ja tem delivered_version, alimentando
// o quadro do QA Tracker. Cria a tabela se ainda nao existir (mesmo schema de
// ensureQATrackerTable() em server.js). Uso: node seed_qa_tracker.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const QA_PEOPLE = ['Marina Duarte', 'Vanessa Castro', 'Aline Ferraz', 'Beatriz Lopes'];
// Pesos: maioria testada, alguns pendentes, poucos bloqueados
const STATUS_WEIGHTS = ['done', 'done', 'done', 'done', 'done', 'done', 'pending', 'pending', 'pending', 'blocked'];
const OBS_DONE = ['Testado em homolog, sem apontamentos.', 'OK, validado com o cenário do cliente.', 'Regressão passou, aprovado.'];
const OBS_BLOCKED = ['Aguardando ambiente de homolog.', 'Bloqueado por dependência não entregue.', 'Erro reproduzido, devolvido para dev.'];

async function main() {
  const client = await pool.connect();
  try {
    console.log('🌱 Garantindo tabela qa_test_records...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_records (
        id SERIAL PRIMARY KEY,
        work_item_id INTEGER NOT NULL,
        version TEXT NOT NULL,
        qa_person TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        obs TEXT,
        cts JSONB DEFAULT '[]',
        attachments JSONB DEFAULT '[]',
        override_desc TEXT,
        override_client TEXT,
        override_tipo TEXT,
        override_area TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(work_item_id, version)
      )
    `);

    const items = await client.query(`
      SELECT work_item_id, delivered_version FROM work_items
      WHERE delivered_version IS NOT NULL AND delivered_version <> ''
    `);
    console.log(`🌱 Inserindo registros de QA para ${items.rows.length} itens...`);

    let inserted = 0;
    for (const { work_item_id, delivered_version } of items.rows) {
      const status = rand(STATUS_WEIGHTS);
      const obs = status === 'done' ? rand(OBS_DONE) : status === 'blocked' ? rand(OBS_BLOCKED) : null;
      await client.query(`
        INSERT INTO qa_test_records (work_item_id, version, qa_person, status, obs)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (work_item_id, version) DO NOTHING
      `, [work_item_id, delivered_version, rand(QA_PEOPLE), status, obs]);
      inserted++;
    }
    console.log(`   ${inserted} registros de QA inseridos.`);
    console.log('\n✅ Seed de QA Tracker concluído.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
