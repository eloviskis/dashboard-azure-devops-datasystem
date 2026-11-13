// Arquivos alterados por pull request, via API de iterations/changes do Azure DevOps Git.
// O total daqui é o mesmo número que a tela da PR mostra em "changed files".
const axios = require('axios');

// A API pagina; sem seguir o nextSkip, uma PR grande seria truncada em silêncio.
const PAGE_SIZE = 1000;

function getAuthHeader(pat) {
  return { Authorization: 'Basic ' + Buffer.from(`:${pat}`).toString('base64') };
}

// Puro: entradas cruas da API -> lista de arquivos + contagem por tipo de mudança.
// Pasta entra como changeEntry quando a mudança é de diretório inteiro, e não conta como arquivo.
// Cuidado: essa resposta NÃO traz gitObjectType (testado ao vivo) — filtrar por ele zeraria tudo.
function summarizeChangeEntries(entries) {
  const byPath = new Map();
  const byType = {};

  for (const entry of entries || []) {
    const path = entry?.item?.path;
    if (!path || entry.item.isFolder === true) continue;
    if (byPath.has(path)) continue; // mesmo arquivo em iterations diferentes é um arquivo só

    const changeType = entry.changeType || 'edit';
    byPath.set(path, changeType);
    byType[changeType] = (byType[changeType] || 0) + 1;
  }

  return { files: [...byPath].map(([path, changeType]) => ({ path, changeType })), byType };
}

async function fetchPrFiles({ organization, pat }, repositoryId, pullRequestId) {
  const base = `https://dev.azure.com/${organization}/_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`;
  const headers = getAuthHeader(pat);

  const iterations = await axios.get(`${base}/iterations?api-version=7.0`, { headers });
  const list = iterations.data.value || [];
  if (list.length === 0) return { files: [], byType: {} };

  // A última iteration é o estado atual da PR — é o que o Azure mostra na aba Files.
  const lastIterationId = list[list.length - 1].id;

  const entries = [];
  let skip = 0;
  for (;;) {
    const res = await axios.get(
      `${base}/iterations/${lastIterationId}/changes?api-version=7.0&$top=${PAGE_SIZE}&$skip=${skip}`,
      { headers }
    );
    entries.push(...(res.data.changeEntries || []));
    if (res.data.nextSkip === undefined || res.data.nextSkip === null || res.data.nextSkip <= skip) break;
    skip = res.data.nextSkip;
  }

  return summarizeChangeEntries(entries);
}

// Busca e grava os arquivos de uma PR. DELETE + INSERT (mesma estratégia do saveStateTransitions):
// PR ativa que recebeu commits novos não pode acumular arquivo que saiu do diff.
async function syncPrFiles(pool, azure, { pullRequestId, repositoryId }) {
  const { files } = await fetchPrFiles(azure, repositoryId, pullRequestId);

  await pool.query('DELETE FROM pull_request_files WHERE pull_request_id = $1', [pullRequestId]);

  if (files.length > 0) {
    const values = [];
    const placeholders = files.map((f, i) => {
      values.push(pullRequestId, f.path, f.changeType);
      const base = i * 3;
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });
    await pool.query(
      `INSERT INTO pull_request_files (pull_request_id, path, change_type) VALUES ${placeholders.join(', ')}
       ON CONFLICT (pull_request_id, path) DO UPDATE SET change_type = EXCLUDED.change_type`,
      values
    );
  }

  await pool.query('UPDATE pull_requests SET changed_files_count = $1 WHERE pull_request_id = $2', [
    files.length,
    pullRequestId,
  ]);

  return files.length;
}

module.exports = { summarizeChangeEntries, fetchPrFiles, syncPrFiles };
