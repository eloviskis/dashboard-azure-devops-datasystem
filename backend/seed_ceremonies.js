// backend/seed_ceremonies.js
// Popula historico de ocorrencias (ceremony_records) para a aba Ritos & Cerimonias,
// usando os times/rituais ja configurados em ceremony_config. Uso: node seed_ceremonies.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function fmtDate(d) { return d.toISOString().slice(0, 10); }

const DEVS = ['Marina Duarte', 'Rafael Alves', 'Camila Ramos', 'Diego Mendes', 'Lucas Cardoso', 'Beatriz Lopes'];

// Pesos de status: maioria realizada, com alguma variação realista
const STATUS_WEIGHTS = ['done', 'done', 'done', 'done', 'done', 'done', 'rescheduled', 'rescheduled', 'cancelled', 'pending'];

// Quantas ocorrências gerar por tipo de ritual, contando pra tras a partir de hoje
const OCCURRENCES = {
  Daily: { everyDays: 1, weekdaysOnly: true, count: 20 },       // ~4 semanas uteis
  Refinamento: { everyDays: 7, weekdaysOnly: false, count: 10 }, // 10 semanas
  Review: { everyDays: 7, weekdaysOnly: false, count: 10 },
  Retrospectiva: { everyDays: 14, weekdaysOnly: false, count: 6 }, // ~3 meses
  Planning: { everyDays: 14, weekdaysOnly: false, count: 6 },
};

function isWeekday(d) { const w = d.getDay(); return w !== 0 && w !== 6; }

async function main() {
  const client = await pool.connect();
  try {
    const cfg = await client.query('SELECT team, ritual_type FROM ceremony_config WHERE active = true');
    console.log(`🌱 Gerando ocorrências para ${cfg.rows.length} combinações time/ritual...`);

    let inserted = 0;
    for (const { team, ritual_type } of cfg.rows) {
      const spec = OCCURRENCES[ritual_type] || OCCURRENCES.Refinamento;
      let cursor = new Date();
      let generated = 0;
      let daysBack = 0;
      while (generated < spec.count && daysBack < 400) {
        daysBack += 1;
        const candidate = addDays(cursor, -daysBack);
        if (spec.weekdaysOnly && !isWeekday(candidate)) continue;
        if (!spec.weekdaysOnly && daysBack % spec.everyDays !== 0) continue;

        const status = rand(STATUS_WEIGHTS);
        const reason = status === 'rescheduled' ? rand(['Conflito de agenda', 'Feriado', 'Indisponibilidade do time'])
          : status === 'cancelled' ? rand(['Sem pauta', 'Time reduzido no dia'])
          : null;

        await client.query(`
          INSERT INTO ceremony_records (team, ritual_type, scheduled_date, status, reason, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [team, ritual_type, fmtDate(candidate), status, reason, rand(DEVS)]);
        inserted++;
        generated++;
      }
    }
    console.log(`   ${inserted} registros de cerimônias inseridos.`);
    console.log('\n✅ Seed de Ritos & Cerimônias concluído.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
