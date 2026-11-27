#!/usr/bin/env node
// Backfill único: popula pull_request_files + pull_requests.changed_files_count pras PRs que ainda
// não têm contagem. Retomável sem tabela de checkpoint — o próprio changed_files_count IS NULL diz
// o que falta, então cair no meio e rodar de novo só continua o que sobrou.
//
// Uso: node backfill_pr_files.js
require('dotenv').config();
const { Pool } = require('pg');
const { syncPrFiles } = require('./services/prFiles');

const AZURE_CONFIG = {
  organization: (process.env.AZURE_ORG || '').trim(),
  pat: (process.env.AZURE_PAT || '').trim(),
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('localhost') ? false : { rejectUnauthorized: false }
});

async function run() {
  if (!AZURE_CONFIG.pat) {
    console.error('❌ AZURE_PAT não configurado no .env');
    process.exit(1);
  }

  const { rows } = await pool.query(`
    SELECT pull_request_id, repository_id, repository_name
    FROM pull_requests
    WHERE changed_files_count IS NULL AND repository_id IS NOT NULL
    ORDER BY pull_request_id DESC
  `);
  console.log(`📋 ${rows.length} PRs pra processar`);
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  let processed = 0;
  let failed = 0;
  let totalFiles = 0;
  const startTime = Date.now();

  for (const row of rows) {
    try {
      const count = await syncPrFiles(pool, AZURE_CONFIG, {
        pullRequestId: row.pull_request_id,
        repositoryId: row.repository_id,
      });
      totalFiles += count;
      processed++;
    } catch (error) {
      // PR de repositório removido / sem permissão não pode travar o backfill inteiro.
      failed++;
      console.log(`   ⚠️ PR ${row.pull_request_id} (${row.repository_name}): ${error.response?.status || ''} ${error.message}`);
    }

    if ((processed + failed) % 100 === 0) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = (processed + failed) / elapsedSec;
      const remaining = rows.length - processed - failed;
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : '?';
      console.log(`   ✅ ${processed + failed}/${rows.length} — ${rate.toFixed(1)} PRs/s, ETA ~${etaMin}min`);
    }
  }

  console.log(`\n✅ Backfill concluído! ${processed} PRs, ${totalFiles} arquivos${failed ? `, ${failed} falharam` : ''}.`);
  if (failed) console.log('   As que falharam continuam com changed_files_count NULL — rode de novo pra tentar só elas.');
  await pool.end();
}

run().catch(async (err) => {
  console.error('❌ Erro fatal:', err.message);
  await pool.end();
  process.exit(1);
});
