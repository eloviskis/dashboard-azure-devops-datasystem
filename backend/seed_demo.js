require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://fluxometria_user:Flux2026DbStr0ng@127.0.0.1:5433/fluxometria',
  ssl: false,
});

// ─── Listas de dados ficticios ─────────────────────────────────────────────────
const TEAMS = ['Time Frente', 'Time Norte', 'Time Central', 'Time Leste', 'Time Oeste', 'Time Sul', 'Time Base'];

const DEVS = [
  'Marina Duarte', 'Rafael Alves', 'Camila Ramos', 'Diego Mendes', 'Lucas Cardoso',
  'Beatriz Lopes', 'Thiago Neves', 'Anderson Pinto', 'Rodrigo Figueira', 'Juliana Moreira',
  'Felipe Barbosa', 'Vanessa Castro', 'Leonardo Azevedo', 'Paulo Ribeiro', 'Aline Ferraz',
];

const QA_PEOPLE = ['Marina Duarte', 'Vanessa Castro', 'Aline Ferraz', 'Beatriz Lopes'];

const TYPES = ['User Story', 'Bug', 'User Story', 'User Story', 'Feature', 'Melhoria', 'Bug', 'Task', 'Issue', 'User Story'];

const STATES_CLOSED   = ['Closed', 'Resolved', 'Finished', 'Pronto'];
const STATES_OPEN     = ['Active', 'In Progress', 'New', 'Para Desenvolver', 'Aguardando QA', 'Aguardando Code Review'];

const CLIENTES = ['Veritas Logistica', 'Apex Distribuidora', 'Nordex Industria', 'Suprema Calcados', 'Horizonte Varejo', 'Central Operacoes', 'Diretoria Corp', null];

const AREAS = [
  'FLEX\\Contas a Receber', 'FLEX\\Contas a Pagar', 'FLEX\\Financeiro',
  'FLEX\\Vendas', 'FLEX\\Estoque', 'FLEX\\Compras', 'FLEX\\Fiscal', 'FLEX\\Integracao',
  'FLEX\\Relatorios', 'FLEX\\Cadastros', 'FLEX\\Autenticacao', 'FLEX\\Dashboard',
];

const BUG_TITLES = [
  'Cálculo incorreto no fechamento de caixa',
  'Erro ao gerar NF-e para cliente PJ',
  'Tela de login não redireciona após expiração de sessão',
  'Falha na exportação de relatório em PDF',
  'Campo de CEP não valida endereços do RS',
  'Duplicidade de lançamento no contas a pagar',
  'Botão de cancelar pedido não funciona em produção',
  'API de integração retornando 500 em horário de pico',
  'Filtro de data não considera fuso horário do cliente',
  'Relatório de estoque exibe valores negativos',
  'Erro ao processar remessa bancária do Bradesco',
  'Quebra de layout no modo impressão',
];

const STORY_TITLES = [
  'Implementar aprovação multinível de requisições de compra',
  'Módulo de gestão de contratos recorrentes',
  'Dashboard executivo com indicadores de margem por produto',
  'Integração com gateway de pagamento para e-commerce',
  'Refatorar engine de cálculo de impostos ICMS-ST',
  'Implementar conciliação bancária automática via OFX',
  'Tela de acompanhamento de entregas em tempo real',
  'Geração automática de SPED FISCAL mensal',
  'Portal do cliente para consulta de faturas e boletos',
  'Análise preditiva de ruptura de estoque por curva ABC',
  'Workflow de aprovação de crédito com regras configuráveis',
  'Migração do módulo de HR para nova arquitetura de microsserviços',
  'Implementar assinatura digital de documentos via DocuSign',
  'Central de notificações push para eventos críticos',
  'Cadastro unificado de fornecedores com validação CNPJ',
  'Relatório de comissões por representante comercial',
  'Módulo de gestão de projetos com Gantt interativo',
  'Implementar 2FA para usuários administradores',
  'Exportação de dados em formato TOTVS para ERP',
  'Melhorar performance do carregamento do grid principal',
  'Configurador visual de relatórios sem necessidade de dev',
  'Integração com Correios para rastreamento de encomendas',
  'Implementar modo offline com sincronização automática',
  'Tela de auditoria de ações sensíveis do sistema',
];

const FEATURE_TITLES = [
  'Motor de regras de negócio configurável por cliente',
  'Plataforma multiempresa com isolamento de dados',
  'API pública documentada (OpenAPI 3.0)',
  'App mobile nativo para aprovações e consultas',
  'Sistema de plugins para integrações de terceiros',
];

// ─── Utilitários ──────────────────────────────────────────────────────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max) { return (Math.random() * (max - min) + min).toFixed(1); }

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(n) {
  return addDays(new Date(), -n);
}

function formatDate(d) {
  return d.toISOString();
}

function getTitle(type) {
  if (type === 'Bug' || type === 'Issue') return rand(BUG_TITLES) + ' #' + randInt(1000, 9999);
  if (type === 'Feature') return rand(FEATURE_TITLES);
  return rand(STORY_TITLES);
}

function generateWorkItem(id) {
  const team = rand(TEAMS);
  const type = rand(TYPES);
  const dev = rand(DEVS);
  const priority = String(randInt(1, 4));
  const cliente = rand(CLIENTES);
  const area = rand(AREAS);

  // Datas: item criado entre 180 e 1 dias atrás
  const daysCreated = randInt(1, 180);
  const createdDate = daysAgo(daysCreated);

  // 70% dos itens estão fechados
  const isClosed = Math.random() < 0.70;

  let state, closedDate, firstActivationDate, cycleTimeDays, leadTimeDays;

  if (isClosed) {
    // First activation entre criação e fechamento
    const activationOffset = randInt(1, Math.min(5, daysCreated - 1) || 1);
    firstActivationDate = addDays(createdDate, activationOffset);

    // Cycle time de 1 a 45 dias (P85 ~18 dias)
    cycleTimeDays = Math.round(Math.abs(Math.pow(Math.random(), 1.5) * 40) + 1);
    closedDate = addDays(firstActivationDate, cycleTimeDays);

    // Lead time = desde criação até fechamento
    leadTimeDays = Math.round((closedDate - createdDate) / 86400000);

    state = rand(STATES_CLOSED);
  } else {
    firstActivationDate = Math.random() < 0.8 ? addDays(createdDate, randInt(0, 3)) : null;
    state = rand(STATES_OPEN);
    closedDate = null;
    cycleTimeDays = null;
    leadTimeDays = null;
  }

  // Tags
  let tags = [];
  if (Math.random() < 0.15) tags.push('IMPEDIMENTO');
  if (isClosed && Math.random() < 0.4) {
    const ver = `3.${randInt(64, 68)}.${randInt(0, 5)}.${randInt(0, 20)}`;
    tags.push(`[${ver}]`);
      if (Math.random() < 0.3) tags.push(`[SUPREMA CALCADOS]`);
  const reincidencia = (type === 'Bug' && Math.random() < 0.15) ? 'true' : null;

    // Impedimento booleano - usar tags como indicador

  // Delivered version
  let delivered_version = null;
  const tagVer = tags.find(t => /^\[\d+\.\d+\.\d+\.\d+\]$/.test(t));
  if (tagVer) delivered_version = tagVer.replace(/[\[\]]/g, '');

  return {
    work_item_id: 70000 + id,
    title: getTitle(type),
    state,
    type,
    assigned_to: dev,
    team,
    area_path: area,
    iteration_path: `FLEX\\Sprint ${randInt(1, 24)}`,    created_date: formatDate(createdDate),
    changed_date: formatDate(closedDate || addDays(createdDate, randInt(0, daysCreated))),
    closed_date: closedDate ? formatDate(closedDate) : null,
    first_activation_date: firstActivationDate ? formatDate(firstActivationDate) : null,
    story_points: Math.random() < 0.6 ? parseFloat(rand(['1', '2', '3', '5', '8', '13'])) : null,
    tags: tags.join('; ') || null,
    tipo_cliente: cliente,
    priority,
    qa: Math.random() < 0.5 ? rand(QA_PEOPLE) : null,
    reincidencia,
    bloqueio: Math.random() < 0.05,
    delivered_version,
    synced_at: formatDate(new Date()),
    url: `https://dev.azure.com/fluxometria-demo/FLEX/_workitems/edit/${70000 + id}`,  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    console.log('🧹 Limpando dados existentes...');
    await client.query('DELETE FROM work_items');
    await client.query('DELETE FROM pull_requests');
    await client.query('DELETE FROM commits');
    await client.query('DELETE FROM sync_log WHERE tenant_id = 1');

    console.log('🔧 Gerando 280 work items de demonstração...');
    const items = Array.from({ length: 280 }, (_, i) => generateWorkItem(i + 1));

    // Batch insert
    for (let i = 0; i < items.length; i += 50) {
      const batch = items.slice(i, i + 50);
      for (const item of batch) {
        await client.query(`
          INSERT INTO work_items (
            work_item_id, title, state, type, assigned_to, team, area_path, iteration_path,
            created_date, changed_date, closed_date, first_activation_date,
            story_points, tags, tipo_cliente, priority, qa, reincidencia,
            bloqueio, delivered_version, synced_at, url
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        `, [
          item.work_item_id, item.title, item.state, item.type, item.assigned_to,
          item.team, item.area_path, item.iteration_path,
          item.created_date, item.changed_date, item.closed_date, item.first_activation_date,
          item.story_points, item.tags, item.tipo_cliente, item.priority, item.qa,
          item.reincidencia, item.bloqueio, item.delivered_version,
          item.synced_at, item.url
        ]);
      }
      process.stdout.write(`  ${Math.min(i + 50, items.length)}/280 inseridos\r`);
    }

    // ─── Pull Requests demo ────────────────────────────────────────────────────
    console.log('\n🔀 Gerando 60 pull requests...');
    for (let i = 1; i <= 60; i++) {
      const dev = rand(DEVS);
      const reviewer = rand(DEVS.filter(d => d !== dev));
      const daysCreated = randInt(1, 90);
      const createdAt = daysAgo(daysCreated);
      const closedAt = addDays(createdAt, randInt(1, 7));
      const status = Math.random() < 0.8 ? 'completed' : 'active';
      const repo = rand(['flex-api-core', 'flex-web-app', 'flex-mobile', 'flex-integrations', 'flex-reports']);

      await client.query(`
        INSERT INTO pull_requests (
          pull_request_id, title, status, created_by, created_date, closed_date,
          source_ref_name, target_ref_name, repository_name, reviewers, tenant_id, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
      `, [
        10000 + i,
        `${rand(['feat:', 'fix:', 'refactor:', 'chore:'])} ${rand(STORY_TITLES).substring(0, 50)}`,
        status, dev,
        formatDate(createdAt),
        status === 'completed' ? formatDate(closedAt) : null,
        `feature/item-${70000 + randInt(1, 280)}`,
        'main', repo,
        JSON.stringify([reviewer]),
        1, formatDate(new Date())
      ]);
    }

    // ─── Sync log demo ─────────────────────────────────────────────────────────
    console.log('📋 Registrando sync de demonstração...');
    await client.query(`
      INSERT INTO sync_log (sync_time, items_count, pull_requests_count, status, tenant_id)
      VALUES (NOW(), 280, 60, 'success', 1)
    `);

    // ─── Estatísticas ──────────────────────────────────────────────────────────
    const stats = await client.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN closed_date IS NOT NULL THEN 1 END) closed,
        COUNT(CASE WHEN closed_date IS NULL THEN 1 END) open,
        COUNT(CASE WHEN type = 'Bug' THEN 1 END) bugs,
        COUNT(DISTINCT team) teams
      FROM work_items
    `);
    console.log('\n✅ Dados de demonstração inseridos com sucesso!');
    console.log('📊 Estatísticas:', stats.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
