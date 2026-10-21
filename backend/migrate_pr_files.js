#!/usr/bin/env node
// Cria a estrutura de arquivos alterados por PR.
// Uso: node migrate_pr_files.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pull_request_files (
        pull_request_id INTEGER NOT NULL,
        path TEXT NOT NULL,
        change_type TEXT,
        PRIMARY KEY (pull_request_id, path)
      )
    `);
    console.log('  ✅ Tabela pull_request_files OK');

    await client.query('CREATE INDEX IF NOT EXISTS idx_pr_files_pr ON pull_request_files(pull_request_id)');
    console.log('  ✅ Índice idx_pr_files_pr OK');

    // NULL = nunca sincronizado; 0 = sincronizado e sem arquivo. É essa diferença que diz ao
    // sync incremental e ao backfill o que ainda falta buscar.
    await client.query('ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS changed_files_count INTEGER');
    console.log('  ✅ Coluna pull_requests.changed_files_count OK');

    const { rows } = await client.query('SELECT count(*) AS pendentes FROM pull_requests WHERE changed_files_count IS NULL');
    console.log(`\n📋 ${rows[0].pendentes} PRs ainda sem contagem — rode: node backfill_pr_files.js`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(async (err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
