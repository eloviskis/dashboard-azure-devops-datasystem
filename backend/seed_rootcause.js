require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

const CAUSA_RAIZ = [
  'Falta de validacao de entrada',
  'Erro de logica de negocio',
  'Ausencia de tratamento de excecao',
  'Problema de concorrencia',
  'Falha de integracao com API externa',
  'Dados incorretos no banco',
  'Configuracao de ambiente incorreta',
  'Regra de negocio nao documentada',
  'Dependencia nao versionada',
  'Cobertura de testes insuficiente',
];

const SQUADS = ['Core', 'Integracao', 'Reports', 'Plataforma', 'Mobile'];
const PLATFORMS = ['Web', 'Mobile', 'API', 'Desktop'];
const COMPLEXITIES = ['Baixa', 'Media', 'Alta'];
const CUSTOM_TYPES = ['Correcao', 'Correcao', 'Correcao', 'Alteracao']; // 75% Correcao
const IDENTIFICACOES = ['Cliente', 'QA', 'Desenvolvimento', 'Monitoramento', 'Suporte'];
const FALHAS = ['Desenvolvimento', 'Code Review', 'QA', 'Deploy', 'Requisitos'];
const DEVS = ['Rafael Alves', 'Camila Ramos', 'Diego Mendes', 'Lucas Cardoso', 'Beatriz Lopes'];
const RC_TEAMS = ['Time Norte', 'Time Sul', 'Time Central', 'Time Leste', 'Time Frente'];

const ISSUE_TITLES = [
  'Falha no calculo de total do pedido em producao',
  'Erro de autenticacao ao renovar sessao expirada',
  'Dados duplicados no relatorio financeiro mensal',
  'Timeout na integracao com gateway de pagamento',
  'Campo obrigatorio permite valor nulo no cadastro',
  'Inconsistencia no estoque apos cancelamento de venda',
  'Numero de nota fiscal incorreto no XML enviado',
  'Quebra de layout no modo impressao do relatorio',
  'Erro 500 ao exportar mais de 500 registros em CSV',
  'Permissao incorreta para usuario perfil supervisor',
  'Data de vencimento calculada com fuso horario errado',
  'Filtro de data nao considera dia final da busca',
  'Valor de desconto nao persiste apos salvar pedido',
  'Notificacao enviada duas vezes para o mesmo email',
  'Item do menu some apos atualizar configuracao do perfil',
  'Calculo de comissao com erro para vendas parceladas',
  'Relatorio de margem exibe valores negativos incorretos',
  'API retorna 403 para usuario com permissao valida',
  'Sincronizacao de estoque falha em horario de pico',
  'Campo de pesquisa nao retorna resultado com acento',
];

async function main() {
  const client = await pool.connect();
  try {
    // 1. Atualizar Issues existentes com dados de root cause
    const existing = await client.query("SELECT id, priority FROM work_items WHERE type='Issue'");
    console.log(`Atualizando ${existing.rows.length} Issues existentes...`);

    for (const row of existing.rows) {
      const prio = parseInt(row.priority) || randInt(1, 3);
      const reincidencia = Math.random() < 0.2 ? String(randInt(1, 3)) : null;

      await client.query(`
        UPDATE work_items SET
          custom_type     = $1,
          causa_raiz      = $2,
          complexity      = $3,
          squad           = $4,
          platform        = $5,
          dev             = $6,
          reincidencia    = $7,
          root_cause_team = $8,
          identificacao   = $9,
          falha_do_processo = $10
        WHERE id = $11
      `, [
        rand(CUSTOM_TYPES),
        Math.random() < 0.85 ? rand(CAUSA_RAIZ) : null, // 85% com causa raiz preenchida
        rand(COMPLEXITIES),
        rand(SQUADS),
        rand(PLATFORMS),
        rand(DEVS),
        reincidencia,
        rand(RC_TEAMS),
        rand(IDENTIFICACOES),
        rand(FALHAS),
        row.id,
      ]);
    }

    // 2. Adicionar 20 Issues novas fechadas com dados completos
    console.log('Inserindo 20 novas Issues fechadas...');
    const maxId = (await client.query('SELECT MAX(work_item_id) m FROM work_items')).rows[0].m || 70000;

    for (let i = 0; i < 20; i++) {
      const daysC = randInt(5, 150);
      const cycleD = randInt(1, 20);
      const createdDate = daysAgo(daysC + cycleD);
      const closedDate  = daysAgo(daysC);
      const firstActivationDate = daysAgo(daysC + cycleD - 1);
      const prio = String(rand([0, 1, 1, 2, 2, 2, 3]));

      await client.query(`
        INSERT INTO work_items (
          work_item_id, title, state, type, assigned_to, team,
          area_path, iteration_path, created_date, changed_date, closed_date,
          first_activation_date, tags, tipo_cliente, priority, qa, reincidencia,
          custom_type, causa_raiz, complexity, squad, platform, dev,
          root_cause_team, identificacao, falha_do_processo, synced_at, url
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                  $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      `, [
        maxId + i + 1,
        rand(ISSUE_TITLES) + ' #' + randInt(1000,9999),
        rand(['Closed','Resolved','Finished']),
        'Issue',
        rand(DEVS),
        rand(['Time Norte','Time Sul','Time Central','Time Leste','Time Base']),
        'FLEX\\' + rand(['Financeiro','Vendas','Integracao','Relatorios','Cadastros']),
        'FLEX\\Sprint ' + randInt(1, 24),
        createdDate, closedDate, closedDate,
        firstActivationDate,
        null,
        rand(['Veritas Logistica','Apex Distribuidora','Nordex Industria',null]),
        prio,
        rand(['Marina Duarte','Beatriz Lopes','Aline Ferraz']),
        Math.random() < 0.2 ? String(randInt(1,3)) : null,
        rand(CUSTOM_TYPES),
        Math.random() < 0.85 ? rand(CAUSA_RAIZ) : null,
        rand(COMPLEXITIES),
        rand(SQUADS),
        rand(PLATFORMS),
        rand(DEVS),
        rand(RC_TEAMS),
        rand(IDENTIFICACOES),
        rand(FALHAS),
        new Date().toISOString(),
        'https://dev.azure.com/fluxometria-demo/FLEX/_workitems/edit/' + (maxId + i + 1),
      ]);
    }

    const stats = await client.query(`
      SELECT
        COUNT(*) total_issues,
        COUNT(causa_raiz) com_causa_raiz,
        COUNT(squad) com_squad,
        COUNT(platform) com_platform
      FROM work_items WHERE type='Issue' AND closed_date IS NOT NULL
    `);
    console.log('Issues fechadas:', stats.rows[0]);
    console.log('Concluido!');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
