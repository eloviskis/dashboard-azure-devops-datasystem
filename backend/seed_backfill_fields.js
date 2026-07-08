// backend/seed_backfill_fields.js
// Completa campos vazios nos 300 work_items ja existentes, pra alimentar graficos que
// hoje ficam em branco: created_by, po, ready_date/done_date (DOR/DOD), estimativas de
// Scrum (original/remaining/completed), code review levels, e parent_id (vinculo com
// Features). So faz UPDATE em colunas hoje vazias — nao mexe em dado ja preenchido.
// Uso: node seed_backfill_fields.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }

const PO_LIST = ['Marcelo Tanaka', 'Renata Gouveia', 'Bruno Salles', 'Patricia Nogueira'];
const CREATED_BY_LIST = ['Marina Duarte', 'Rafael Alves', 'Camila Ramos', 'Diego Mendes', 'Lucas Cardoso', 'Beatriz Lopes', 'Thiago Neves'];
const REVIEWERS = ['Marina Duarte', 'Rafael Alves', 'Camila Ramos', 'Diego Mendes', 'Lucas Cardoso', 'Beatriz Lopes', 'Thiago Neves', 'Anderson Pinto', 'Rodrigo Figueira', 'Juliana Moreira'];
const CLOSED_STATES = ['Finished', 'Resolved', 'Pronto', 'Closed'];
const NOT_YET_REVIEWED_STATES = ['New', 'Para Desenvolver'];

async function main() {
  const client = await pool.connect();
  try {
    const all = (await client.query(`
      SELECT work_item_id, type, team, state, created_date, closed_date FROM work_items
    `)).rows;

    console.log('🌱 Backfill: created_by...');
    let n1 = 0;
    for (const item of all) {
      const r = await client.query(`
        UPDATE work_items SET created_by = $1
        WHERE work_item_id = $2 AND (created_by IS NULL OR created_by = '')
      `, [rand(CREATED_BY_LIST), item.work_item_id]);
      n1 += r.rowCount;
    }
    console.log(`   ${n1} itens com created_by preenchido.`);

    console.log('🌱 Backfill: po, ready_date, done_date (itens de demanda)...');
    const demand = all.filter(i => ['User Story', 'Feature', 'Melhoria'].includes(i.type));
    let n2 = 0;
    for (const item of demand) {
      const created = new Date(item.created_date);
      const readyDate = addDays(created, -randInt(1, 5));
      const doneDate = item.closed_date ? new Date(item.closed_date) : null;
      const r = await client.query(`
        UPDATE work_items SET po = $1, ready_date = $2, done_date = $3
        WHERE work_item_id = $4 AND (po IS NULL OR po = '')
      `, [rand(PO_LIST), readyDate.toISOString(), doneDate ? doneDate.toISOString() : null, item.work_item_id]);
      n2 += r.rowCount;
    }
    console.log(`   ${n2} itens de demanda com po/DOR/DOD preenchidos.`);

    console.log('🌱 Backfill: estimativas de Scrum (User Story, Bug, Task)...');
    const estimable = all.filter(i => ['User Story', 'Bug', 'Task'].includes(i.type));
    let n3 = 0;
    for (const item of estimable) {
      const original = randInt(2, 40);
      const isClosed = CLOSED_STATES.includes(item.state);
      const completed = isClosed ? original : randInt(0, original);
      const remaining = isClosed ? 0 : original - completed;
      const r = await client.query(`
        UPDATE work_items SET original_estimate = $1, completed_work = $2, remaining_work = $3
        WHERE work_item_id = $4 AND original_estimate IS NULL
      `, [original, completed, remaining, item.work_item_id]);
      n3 += r.rowCount;
    }
    console.log(`   ${n3} itens com estimativas de Scrum preenchidas.`);

    console.log('🌱 Backfill: code review levels...');
    const reviewable = all.filter(i => !NOT_YET_REVIEWED_STATES.includes(i.state));
    let n4 = 0;
    for (const item of reviewable) {
      const level1 = rand(REVIEWERS);
      const others = REVIEWERS.filter(r => r !== level1);
      const level2 = Math.random() < 0.6 ? rand(others) : null;
      const r = await client.query(`
        UPDATE work_items SET code_review_level1 = $1, code_review_level2 = $2
        WHERE work_item_id = $3 AND (code_review_level1 IS NULL OR code_review_level1 = '')
      `, [level1, level2, item.work_item_id]);
      n4 += r.rowCount;
    }
    console.log(`   ${n4} itens com code review preenchido.`);

    console.log('🌱 Backfill: parent_id (vínculo com Features do mesmo time)...');
    const features = (await client.query(`SELECT work_item_id, team FROM work_items WHERE type = 'Feature'`)).rows;
    const featuresByTeam = {};
    for (const f of features) {
      (featuresByTeam[f.team] = featuresByTeam[f.team] || []).push(f.work_item_id);
    }
    const children = all.filter(i => i.type !== 'Feature');
    let n5 = 0;
    for (const item of children) {
      const candidates = featuresByTeam[item.team];
      if (!candidates || candidates.length === 0) continue;
      if (Math.random() > 0.6) continue; // nem todo item tem pai, como na vida real
      const r = await client.query(`
        UPDATE work_items SET parent_id = $1 WHERE work_item_id = $2 AND parent_id IS NULL
      `, [rand(candidates), item.work_item_id]);
      n5 += r.rowCount;
    }
    console.log(`   ${n5} itens vinculados a uma Feature-pai.`);

    console.log('\n✅ Backfill de campos concluído.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
