// Histórico real de voto por pull request — quando cada pessoa votou, não só o voto atual.
// O campo `reviewers` de pull_requests (ver server.js) só guarda o voto ATUAL de cada revisor; não diz em
// que dia aconteceu. Pra isso existe a API de "threads" da PR: toda mudança de voto vira um comentário de
// sistema "{pessoa} voted {voto}", com timestamp — testado ao vivo, é exatamente o rastro que faltava pro
// ranking diário de code review bater com a realidade (revisor de PR que demora a fechar não sumia do
// ranking de propósito, só não tínhamos a data certa do voto dele).
const axios = require('axios');

function getAuthHeader(pat) {
  return { Authorization: 'Basic ' + Buffer.from(`:${pat}`).toString('base64') };
}

// "Fulano voted 10" (ou -10, 5, -5, 0) — sempre no fim do texto do comentário de sistema.
const VOTE_PATTERN = /voted (-?\d+)$/;

// Puro: threads cruas da API -> lista de eventos de voto (pessoa, voto, quando).
function extractVoteEvents(threads) {
  const events = [];
  for (const thread of threads || []) {
    for (const comment of thread.comments || []) {
      if (comment.commentType !== 'system') continue;
      const match = VOTE_PATTERN.exec(comment.content || '');
      if (!match || !comment.author?.displayName) continue;
      events.push({ reviewerName: comment.author.displayName, vote: Number(match[1]), votedAt: comment.publishedDate });
    }
  }
  return events;
}

async function fetchPrVoteEvents({ organization, pat }, { pullRequestId, repositoryId }) {
  const url = `https://dev.azure.com/${organization}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.0`;
  const res = await axios.get(url, { headers: getAuthHeader(pat) });
  return extractVoteEvents(res.data.value);
}

// Busca e grava os eventos de voto de uma PR. DELETE + INSERT (mesma estratégia do saveStateTransitions
// e do syncPrFiles): PR ativa que recebeu voto novo não pode acumular evento de uma versão antiga do histórico.
async function syncPrVoteEvents(pool, azure, { pullRequestId, repositoryId }) {
  const events = await fetchPrVoteEvents(azure, { pullRequestId, repositoryId });

  await pool.query('DELETE FROM pr_vote_events WHERE pull_request_id = $1', [pullRequestId]);

  if (events.length > 0) {
    const values = [];
    const placeholders = events.map((e, i) => {
      values.push(pullRequestId, e.reviewerName, e.vote, e.votedAt);
      const base = i * 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await pool.query(
      `INSERT INTO pr_vote_events (pull_request_id, reviewer_name, vote, voted_at) VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  await pool.query('UPDATE pull_requests SET vote_events_synced_at = NOW() WHERE pull_request_id = $1', [pullRequestId]);

  return events.length;
}

module.exports = { extractVoteEvents, fetchPrVoteEvents, syncPrVoteEvents };
