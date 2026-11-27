// Quando os campos de Nível 1 e Nível 2 de code review (work_items.code_review_level1/2, identity fields
// do Azure DevOps) realmente mudaram pro valor atual — não a changed_date da tarefa inteira, que mistura
// qualquer edição, inclusive em lote. Medido ao vivo: 121 tarefas com Nível 2 preenchido compartilhavam a
// mesma changed_date, até o milissegundo — uma edição em lote de outro campo, sem relação com quando a
// revisão de verdade aconteceu (confirmado numa tarefa real: Nível 1/2 preenchidos em 06/10, changed_date
// mostrando 14/10). Mesmo motivo do pr_vote_events, resolvido do mesmo jeito: o histórico de revisões da
// tarefa tem o valor do campo a cada mudança, com data.
//
// ponytail: usa a API REST de revisões (não a Analytics OData, que não aceita esse campo customizado no
// $select) — uma chamada por tarefa, não batchável. Fica só pra quem tem Nível 1/2 preenchido (poucos
// milhares, não os ~57 mil work items). Se a pessoa do campo for trocada depois que já sincronizamos a data,
// não é re-sincronizado sozinho (cai no fallback de changed_date); não vimos indício de troca de revisor nos
// dados reais, mas é a limitação conhecida.
const axios = require('axios');

function getAuthHeader(pat) {
  return { Authorization: 'Basic ' + Buffer.from(`:${pat}`).toString('base64') };
}

const FIELD_LEVEL1 = 'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028';
const FIELD_LEVEL2 = 'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e';

function nomeDoCampo(fields, campo) {
  const v = fields?.[campo];
  return (v && v.displayName) || (typeof v === 'string' ? v : '') || '';
}

// Puro: revisões cruas da API -> data em que level1/level2 passaram a valer o que valem HOJE (currentLevel1/2).
// Anda revisão a revisão; toda vez que o campo muda de valor, se o novo valor bate com o atual, guarda a data
// dessa revisão — fica valendo a transição mais recente pro valor de agora (se a pessoa foi trocada, conta a
// data da troca mais recente, não a primeira que o campo teve algum nome).
function findLevelSetDates(revisions, currentLevel1, currentLevel2) {
  let level1SetAt = null;
  let level2SetAt = null;
  let last1 = '';
  let last2 = '';
  for (const rev of revisions || []) {
    const fields = rev.fields || {};
    const n1 = nomeDoCampo(fields, FIELD_LEVEL1);
    const n2 = nomeDoCampo(fields, FIELD_LEVEL2);
    if (n1 !== last1) {
      if (n1 === currentLevel1) level1SetAt = fields['System.ChangedDate'];
      last1 = n1;
    }
    if (n2 !== last2) {
      if (n2 === currentLevel2) level2SetAt = fields['System.ChangedDate'];
      last2 = n2;
    }
  }
  return { level1SetAt, level2SetAt };
}

async function fetchRevisions({ organization, project, pat }, workItemId) {
  const url = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}/revisions?api-version=7.0`;
  const res = await axios.get(url, { headers: getAuthHeader(pat) });
  return res.data.value || [];
}

// Busca e grava as datas de uma tarefa. Sem valor encontrado no histórico (campo mudou antes do que a API
// guarda, ou alguma divergência de nome) usa changed_date como aproximação — mesma que já era usada antes,
// só que agora é exceção, não a regra.
async function syncCodeReviewLevelDates(pool, azure, workItemId) {
  const { rows } = await pool.query(
    'SELECT code_review_level1, code_review_level2, changed_date FROM work_items WHERE work_item_id = $1',
    [workItemId]
  );
  const row = rows[0];
  if (!row) return null;

  const revisions = await fetchRevisions(azure, workItemId);
  const { level1SetAt, level2SetAt } = findLevelSetDates(revisions, row.code_review_level1 || '', row.code_review_level2 || '');

  await pool.query(
    'UPDATE work_items SET code_review_level1_set_at = $1, code_review_level2_set_at = $2 WHERE work_item_id = $3',
    [
      row.code_review_level1 ? (level1SetAt || row.changed_date) : null,
      row.code_review_level2 ? (level2SetAt || row.changed_date) : null,
      workItemId,
    ]
  );

  return { level1SetAt, level2SetAt };
}

module.exports = { findLevelSetDates, fetchRevisions, syncCodeReviewLevelDates };
