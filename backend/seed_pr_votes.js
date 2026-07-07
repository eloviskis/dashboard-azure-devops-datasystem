require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

const REVIEWERS = [
  'Marina Duarte', 'Rafael Alves', 'Camila Ramos', 'Diego Mendes',
  'Lucas Cardoso', 'Beatriz Lopes', 'Thiago Neves', 'Anderson Pinto',
  'Rodrigo Figueira', 'Juliana Moreira', 'Felipe Barbosa', 'Vanessa Castro',
];

const VOTES = [10, 10, 10, 5, 5, 0, -5, -10]; // pesos: mais aprovacoes

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

async function main() {
  const client = await pool.connect();
  try {
    const prs = await client.query('SELECT pull_request_id, created_by FROM pull_requests ORDER BY pull_request_id');
    console.log(`Atualizando ${prs.rows.length} PRs com votos...`);

    for (const pr of prs.rows) {
      const author = pr.created_by;
      // 1-3 reviewers, nunca o proprio autor
      const available = REVIEWERS.filter(r => r !== author);
      const count = randInt(1, 3);
      const picked = available.sort(() => Math.random() - 0.5).slice(0, count);

      const reviewers = picked.map(name => ({
        displayName: name,
        vote: rand(VOTES),
        uniqueName: name.toLowerCase().replace(/\s+/g, '.') + '@fluxometria.com',
      }));

      // votes: objeto com contagens para compatibilidade
      const votes = JSON.stringify(reviewers.reduce((acc, r) => {
        acc[r.displayName] = r.vote;
        return acc;
      }, {}));

      await client.query(
        'UPDATE pull_requests SET reviewers = $1, votes = $2 WHERE pull_request_id = $3',
        [JSON.stringify(reviewers), votes, pr.pull_request_id]
      );
    }

    // Confirma
    const sample = await client.query(
      'SELECT pull_request_id, LEFT(title,40) as t, reviewers FROM pull_requests LIMIT 2'
    );
    console.log('Amostra:');
    sample.rows.forEach(r => console.log(`  #${r.pull_request_id}: ${r.t}`));
    console.log('  Reviewers:', sample.rows[0].reviewers);
    console.log('Concluido!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
