// Ranking diário de quem mais revisou PRs — conta voto real dentro do período (pr_vote_events), não mais o
// estado atual da PR (pull_requests.reviewers só guarda o voto ATUAL e a data de criação/fechamento da PR
// inteira, sem dizer quando cada pessoa votou). Isso resolvia mal dois casos, achados investigando reclamação
// de alguém "de férias" aparecendo no ranking:
//   1. Revisor adicionado automaticamente pelo Azure DevOps, sem nunca votar, contava como se tivesse
//      revisado (15 de 38 entradas de um dia real eram assim — 6 das 13 pessoas do ranking tinham a
//      contagem inteira composta só por isso).
//   2. Quem vota numa PR que demora a fechar (aguardando outras aprovações, aguardando merge) nunca
//      aparecia em ranking nenhum, de dia nenhum — o voto existe, só não tem como saber o dia certo sem
//      olhar o histórico de verdade.
// A API de threads da PR tem a resposta: todo voto gera um comentário de sistema "{pessoa} voted {voto}",
// com timestamp (ver services/prVoteEvents.js). Com isso, "fez code review no dia X" vira literal: tem um
// voto datado de X — sem precisar aproximar pela PR inteira, e sem precisar distinguir revisor obrigatório
// de opcional (só existe linha em pr_vote_events pra quem realmente votou).
//
// voteEventRows: linhas de pr_vote_events já filtradas pelo período (voted_at no intervalo), com
// pull_request_id, reviewer_name, vote. Mesmos filtros de sempre: restringe a nomes já vistos como dev.
function getDailyReviewRanking(voteEventRows, knownDevNames) {
  const devSet = new Set((knownDevNames || []).map(n => n.toLowerCase().trim()));

  // Mesma pessoa pode votar mais de uma vez na mesma PR dentro do período (mudou de ideia) — conta a PR
  // uma vez só, com o voto mais recente dela nessa janela.
  const porPessoaPr = new Map();
  for (const row of voteEventRows) {
    const name = row.reviewer_name;
    if (!name || !devSet.has(name.toLowerCase().trim())) continue;
    const chave = `${name}|${row.pull_request_id}`;
    const atual = porPessoaPr.get(chave);
    if (!atual || row.voted_at > atual.votedAt) {
      porPessoaPr.set(chave, { name, vote: row.vote, votedAt: row.voted_at });
    }
  }

  const byName = new Map();
  for (const { name, vote } of porPessoaPr.values()) {
    if (!byName.has(name)) byName.set(name, { name, total: 0, approved: 0, rejected: 0, noVote: 0 });
    const entry = byName.get(name);
    entry.total += 1;
    if (vote === 10 || vote === 5) entry.approved += 1;
    else if (vote === -10 || vote === -5) entry.rejected += 1;
    else entry.noVote += 1; // voto revogado (0) — ainda assim uma interação real, datada
  }
  return [...byName.values()].sort((a, b) => b.total - a.total || b.approved - a.approved);
}

module.exports = { getDailyReviewRanking };
