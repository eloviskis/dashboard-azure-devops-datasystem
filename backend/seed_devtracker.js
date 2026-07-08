// backend/seed_devtracker.js
// Popula dados de demonstração para a aba DevTracker (developers, projects, allocations).
// Roda direto na VPS (conecta no Postgres local). Uso: node seed_devtracker.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function fmtDate(d) { return d.toISOString().slice(0, 10); }

const DEVS = [
  { name: 'Marina Duarte', role: 'Tech Lead' },
  { name: 'Rafael Alves', role: 'Dev Sênior' },
  { name: 'Camila Ramos', role: 'Dev Pleno' },
  { name: 'Diego Mendes', role: 'Dev Sênior' },
  { name: 'Lucas Cardoso', role: 'Dev Pleno' },
  { name: 'Beatriz Lopes', role: 'Dev Sênior' },
  { name: 'Thiago Neves', role: 'Dev Pleno' },
  { name: 'Anderson Pinto', role: 'Dev Júnior' },
  { name: 'Rodrigo Figueira', role: 'Dev Pleno' },
  { name: 'Juliana Moreira', role: 'Dev Sênior' },
  { name: 'Felipe Barbosa', role: 'Dev Júnior' },
  { name: 'Vanessa Castro', role: 'Dev Pleno' },
  { name: 'Leonardo Azevedo', role: 'Dev Júnior' },
  { name: 'Paulo Ribeiro', role: 'Dev Pleno' },
  { name: 'Aline Ferraz', role: 'Dev Sênior' },
];

const CATEGORIES = ['paydev', 'paydev', 'paydev', 'nao-aderencia', 'demandas-internas'];
const CLIENTES = ['Veritas Logistica', 'Apex Distribuidora', 'Nordex Industria', 'Suprema Calcados', 'Horizonte Varejo', null];

const PROJECTS = [
  { name: 'Migração módulo de HR para microsserviços', priority: 'Alta', status: 'Em andamento' },
  { name: 'Portal do cliente — consulta de faturas', priority: 'Alta', status: 'Em andamento' },
  { name: 'Integração com gateway de pagamento', priority: 'Média', status: 'Em andamento' },
  { name: 'Conciliação bancária automática (OFX)', priority: 'Média', status: 'Planejado' },
  { name: 'Dashboard executivo de margem por produto', priority: 'Alta', status: 'Concluído' },
  { name: 'App mobile para aprovações e consultas', priority: 'Média', status: 'Em andamento' },
  { name: 'API pública documentada (OpenAPI 3.0)', priority: 'Baixa', status: 'Planejado' },
  { name: 'Configurador visual de relatórios', priority: 'Baixa', status: 'Concluído' },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('🌱 Inserindo desenvolvedores...');
    const devIds = [];
    for (const d of DEVS) {
      const r = await client.query(`
        INSERT INTO devtracker_developers (name, role, email, category, client, active)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id
      `, [d.name, d.role, d.name.toLowerCase().replace(/\s+/g, '.') + '@fluxometria.com', rand(CATEGORIES), rand(CLIENTES)]);
      devIds.push(r.rows[0].id);
    }
    console.log(`   ${devIds.length} desenvolvedores inseridos.`);

    console.log('🌱 Inserindo projetos...');
    const projectIds = [];
    for (const p of PROJECTS) {
      const start = addDays(new Date(), -randInt(30, 150));
      const deadline = p.status === 'Concluído' ? addDays(start, randInt(20, 60)) : addDays(new Date(), randInt(10, 60));
      const r = await client.query(`
        INSERT INTO devtracker_projects (name, client, priority, status, start_date, deadline)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [p.name, rand(CLIENTES), p.priority, p.status, fmtDate(start), fmtDate(deadline)]);
      projectIds.push({ id: r.rows[0].id, status: p.status });
    }
    console.log(`   ${projectIds.length} projetos inseridos.`);

    console.log('🌱 Alocando desenvolvedores em projetos...');
    let allocCount = 0;
    for (const proj of projectIds) {
      if (proj.status === 'Planejado') continue; // projetos planejados ainda sem time alocado
      const count = randInt(2, 4);
      const picked = [...devIds].sort(() => Math.random() - 0.5).slice(0, count);
      for (const devId of picked) {
        await client.query(`
          INSERT INTO devtracker_allocations (developer_id, project_id, allocated_date)
          VALUES ($1, $2, $3)
          ON CONFLICT (developer_id, project_id) DO NOTHING
        `, [devId, proj.id, fmtDate(addDays(new Date(), -randInt(5, 90)))]);
        allocCount++;
      }
    }
    console.log(`   ${allocCount} alocações inseridas.`);

    console.log('\n✅ Seed de DevTracker concluído.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
