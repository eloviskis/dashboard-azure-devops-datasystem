#!/usr/bin/env node
// Backfill único: popula work_item_state_transitions + work_items.time_in_status_days pra todos os
// work items já existentes no banco, usando o feed OData de revisões do Azure DevOps Analytics em
// lotes (não uma chamada por item). Resumível via checkpoint — se cair no meio, roda de novo e
// continua de onde parou.
//
// Uso: node backfill_state_history.js
require('dotenv').config();
const { Pool } = require('pg');
const { syncStateHistoryForBatch } = require('./services/stateHistory');

const AZURE_CONFIG = {
  organization: (process.env.AZURE_ORG || '').trim(),
  project: (process.env.AZURE_PROJECT || '').trim(),
  pat: (process.env.AZURE_PAT || '').trim(),
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

const CHECKPOINT_TABLE = 'state_history_backfill_checkpoint';
const BATCH_SIZE = 200;

async function ensureCheckpointTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${CHECKPOINT_TABLE} (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_work_item_id INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`INSERT INTO ${CHECKPOINT_TABLE} (id, last_work_item_id) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`);
}

async function getCheckpoint() {
  const { rows } = await pool.query(`SELECT last_work_item_id FROM ${CHECKPOINT_TABLE} WHERE id = 1`);
  return rows[0]?.last_work_item_id || 0;
}

async function saveCheckpoint(lastWorkItemId) {
  await pool.query(
    `UPDATE ${CHECKPOINT_TABLE} SET last_work_item_id = $1, updated_at = NOW() WHERE id = 1`,
    [lastWorkItemId]
  );
}

async function run() {
  if (!AZURE_CONFIG.pat) {
    console.error('❌ AZURE_PAT não configurado no .env');
    process.exit(1);
  }

  await ensureCheckpointTable();
  const resumeFrom = await getCheckpoint();
  if (resumeFrom > 0) {
    console.log(`▶️  Retomando backfill a partir do work_item_id > ${resumeFrom}`);
  }

  const { rows } = await pool.query(
    'SELECT work_item_id, state FROM work_items WHERE work_item_id > $1 ORDER BY work_item_id ASC',
    [resumeFrom]
  );
  console.log(`📋 ${rows.length} work items pra processar`);

  let processed = 0;
  const startTime = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const workItemStates = new Map(batch.map(r => [r.work_item_id, r.state]));

    try {
      await syncStateHistoryForBatch(pool, AZURE_CONFIG, workItemStates);
      processed += batch.length;
      const lastId = batch[batch.length - 1].work_item_id;
      await saveCheckpoint(lastId);

      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = processed / elapsedSec;
      const remaining = rows.length - processed;
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : '?';
      console.log(`   ✅ ${processed}/${rows.length} (até #${lastId}) — ${rate.toFixed(1)} itens/s, ETA ~${etaMin}min`);
    } catch (error) {
      console.error(`   ⚠️ Lote falhou (work_item_id ${batch[0].work_item_id}-${batch[batch.length - 1].work_item_id}): ${error.message}`);
      console.error('   Rode o script de novo pra retomar a partir do checkpoint salvo.');
      process.exit(1);
    }
  }

  console.log(`\n✅ Backfill concluído! ${processed} itens processados.`);
  await pool.end();
}

run().catch(async (err) => {
  console.error('❌ Erro fatal:', err.message);
  await pool.end();
  process.exit(1);
});
