// Histórico real de transição de estado por work item, via feed OData de revisões do Azure DevOps
// Analytics (WorkItemRevisions). Substitui a estimativa por pesos fixos que existia no frontend —
// aqui o tempo em cada status vem de timestamp real de mudança de estado, não de chute.
const axios = require('axios');

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
// Entre estes, o fim real é o PRIMEIRO que acontecer — não necessariamente Closed. Fechamento em lote, bem
// depois do item já estar pronto, é comum nesta base: medido no banco, quase metade dos itens concluídos tem
// mais de 2 dias de atraso entre a entrada em Finished/Resolved e o Closed (média de 17 dias quando há atraso).
const ESTADOS_CONCLUSAO = ['Finished', 'Resolved', 'Closed'];
// O feed de Analytics devolve 404 (não 414) quando a URL do $filter fica grande demais — testado ao
// vivo: 100 IDs já quebra, 75 funciona. 60 dá margem confortável (o lote de 200 usado pra REST não
// se aplica aqui, é uma API diferente com limite de URL, não de itens por chamada).
const BATCH_SIZE = 60;

function getAuthHeader(pat) {
  const credentials = Buffer.from(`:${pat}`).toString('base64');
  return { 'Authorization': `Basic ${credentials}` };
}

// Busca todas as revisões (WorkItemId, State, ChangedDate, Revision) de um lote de IDs, seguindo
// paginação via @odata.nextLink quando o lote tiver revisões demais pra uma página só.
async function fetchRevisionsBatch({ organization, project, pat }, workItemIds) {
  const filter = workItemIds.map(id => `WorkItemId eq ${id}`).join(' or ');
  let url = `https://analytics.dev.azure.com/${organization}/${project}/_odata/v3.0-preview/WorkItemRevisions` +
    `?$select=WorkItemId,State,ChangedDate,Revision&$filter=${encodeURIComponent(filter)}&$orderby=WorkItemId,Revision&$top=10000`;

  const allRows = [];
  while (url) {
    const res = await axios.get(url, { headers: { ...getAuthHeader(pat), Accept: 'application/json' } });
    allRows.push(...(res.data.value || []));
    url = res.data['@odata.nextLink'] || null;
  }
  return allRows;
}

// Agrupa as revisões por item e colapsa transições consecutivas com o mesmo State — sobra só o
// primeiro ChangedDate de cada estado novo (= quando o item realmente entrou naquele estado).
function collapseTransitionsByItem(rows) {
  const byItem = new Map();
  for (const row of rows) {
    if (!byItem.has(row.WorkItemId)) byItem.set(row.WorkItemId, []);
    byItem.get(row.WorkItemId).push(row);
  }

  const result = new Map();
  for (const [workItemId, itemRows] of byItem) {
    itemRows.sort((a, b) => a.Revision - b.Revision);
    const transitions = [];
    for (const r of itemRows) {
      const last = transitions[transitions.length - 1];
      if (!last || last.state !== r.State) {
        transitions.push({ state: r.State, enteredAt: r.ChangedDate });
      }
    }
    result.set(workItemId, transitions);
  }
  return result;
}

// Duração real por status, em dias. Pro estado atual de um item ainda aberto, a duração vai até
// agora; pro estado terminal de um item já concluído, não conta nada além do próprio fechamento
// (a última transição É o fechamento, não sobra tempo "depois" dele pra atribuir a nenhum status).
function computeTimeInStatusDays(transitions, isCompleted) {
  if (!transitions || transitions.length === 0) return null;
  const now = Date.now();
  const durations = {};

  for (let i = 0; i < transitions.length; i++) {
    const cur = transitions[i];
    const next = transitions[i + 1];
    const startMs = new Date(cur.enteredAt).getTime();
    const endMs = next ? new Date(next.enteredAt).getTime() : (isCompleted ? startMs : now);
    const days = Math.max(0, (endMs - startMs) / (1000 * 60 * 60 * 24));
    durations[cur.state] = (durations[cur.state] || 0) + days;
  }

  for (const state of Object.keys(durations)) {
    durations[state] = Math.round(durations[state] * 10) / 10;
  }
  return durations;
}

// Data de conclusão efetiva, pra fins de cycle time/lead time: a primeira vez que o item (já concluído
// hoje) chegou a Finished, Resolved ou Closed — o que vier primeiro. Não é a última transição: essa seria
// o Closed quando ele existe, e o Closed muitas vezes vem bem depois do Pronto real (fechamento em lote).
function computeEffectiveClosedDate(transitions, isCompleted) {
  if (!isCompleted || !transitions || transitions.length === 0) return null;
  const concluidos = transitions.filter(t => ESTADOS_CONCLUSAO.includes(t.state));
  if (concluidos.length === 0) return null;
  return concluidos.reduce((min, t) => (new Date(t.enteredAt) < new Date(min) ? t.enteredAt : min), concluidos[0].enteredAt);
}

async function saveStateTransitions(pool, workItemId, transitions) {
  await pool.query('DELETE FROM work_item_state_transitions WHERE work_item_id = $1', [workItemId]);
  if (transitions.length === 0) return;

  const values = [];
  const placeholders = transitions.map((t, i) => {
    values.push(workItemId, t.state, t.enteredAt);
    const base = i * 3;
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });
  await pool.query(
    `INSERT INTO work_item_state_transitions (work_item_id, state, entered_at) VALUES ${placeholders.join(', ')}`,
    values
  );
}

// Busca, salva e precalcula o time_in_status_days real de um lote de work items. Recebe os states
// atuais (Map workItemId -> state) pra saber se cada item está concluído ou ainda em aberto.
async function syncStateHistoryForBatch(pool, azureConfig, workItemStates) {
  const workItemIds = Array.from(workItemStates.keys());
  if (workItemIds.length === 0) return;

  for (let i = 0; i < workItemIds.length; i += BATCH_SIZE) {
    const batch = workItemIds.slice(i, i + BATCH_SIZE);
    const rows = await fetchRevisionsBatch(azureConfig, batch);
    const transitionsByItem = collapseTransitionsByItem(rows);

    for (const workItemId of batch) {
      const transitions = transitionsByItem.get(workItemId) || [];
      const state = workItemStates.get(workItemId);
      const isCompleted = COMPLETED_STATES.includes(state);

      await saveStateTransitions(pool, workItemId, transitions);
      const timeInStatusDays = computeTimeInStatusDays(transitions, isCompleted);
      const effectiveClosedDate = computeEffectiveClosedDate(transitions, isCompleted);
      await pool.query('UPDATE work_items SET time_in_status_days = $1, effective_closed_date = $2 WHERE work_item_id = $3', [
        timeInStatusDays ? JSON.stringify(timeInStatusDays) : null,
        effectiveClosedDate,
        workItemId
      ]);
    }
  }
}

module.exports = {
  fetchRevisionsBatch,
  collapseTransitionsByItem,
  computeTimeInStatusDays,
  computeEffectiveClosedDate,
  saveStateTransitions,
  syncStateHistoryForBatch,
};
