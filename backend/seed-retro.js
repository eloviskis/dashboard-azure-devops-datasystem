// Carga inicial da aba Retrô: tipos de ação, retros e sugestões de docs/retro/retro-dados-iniciais.json.
// Uso: node seed-retro.js [caminho-do-json]   (usa o DATABASE_URL do .env)
// Idempotente (upsert por id). Não cria nada no Azure DevOps: as ações entram como sugestões.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { initRetroSchema, seedRetro, DEFAULT_TEAMS } = require('./retro');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido no .env');
  const file = process.argv[2] || path.join(__dirname, '..', 'docs', 'retro', 'retro-dados-iniciais.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = async (strings, ...values) =>
    (await pool.query(strings.reduce((p, c, i) => (i === 0 ? c : `${p}$${i}${c}`)), values)).rows;
  try {
    await initRetroSchema(sql);
    const cfg = (await sql`SELECT value FROM app_settings WHERE key = 'retro_config'`)[0]?.value;
    const teams = (cfg && JSON.parse(cfg).teams) || DEFAULT_TEAMS;
    await seedRetro(sql, data, { teams });
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
