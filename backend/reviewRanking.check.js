#!/usr/bin/env node
// Check do ranking de code review. Sem framework — node reviewRanking.check.js
const assert = require('assert/strict');
const { getDailyReviewRanking } = require('./services/reviewRanking');

const devs = ['Henrique Moraca', 'Ademilson de Almeida', 'Nathalia Tesch', 'Alguém de Fora'];
const evento = (name, prId, vote, votedAt) => ({ reviewer_name: name, pull_request_id: prId, vote, voted_at: votedAt });

const voteEventRows = [
  // Henrique: votou aprovado em duas PRs, e rejeitou uma terceira — 3 revisões, 2 aprovadas
  evento('Henrique Moraca', 1, 10, '2026-10-14T09:00:00Z'),
  evento('Henrique Moraca', 2, 5, '2026-10-14T10:00:00Z'),
  evento('Henrique Moraca', 3, -10, '2026-10-14T11:00:00Z'),
  // Ademilson: votou duas vezes na MESMA PR (mudou de ideia) — conta uma vez, com o voto mais recente
  evento('Ademilson de Almeida', 4, -10, '2026-10-14T08:00:00Z'),
  evento('Ademilson de Almeida', 4, 10, '2026-10-14T08:30:00Z'),
  // Nathalia: votou numa PR que nunca fecha — é exatamente o caso que motivou a mudança
  evento('Nathalia Tesch', 5, 10, '2026-10-14T11:57:23Z'),
  // Fora da lista de devs conhecidos não entra, mesmo com voto de verdade
  evento('Pessoa Desconhecida', 6, 10, '2026-10-14T12:00:00Z'),
];

const ranking = getDailyReviewRanking(voteEventRows, devs);
const porNome = Object.fromEntries(ranking.map(r => [r.name, r]));

assert.equal(porNome['Henrique Moraca'].total, 3);
assert.equal(porNome['Henrique Moraca'].approved, 2);
assert.equal(porNome['Henrique Moraca'].rejected, 1);
assert.equal(porNome['Ademilson de Almeida'].total, 1, 'dois votos na mesma PR contam uma vez só');
assert.equal(porNome['Ademilson de Almeida'].approved, 1, 'fica valendo o voto mais recente (aprovado)');
assert.ok(porNome['Nathalia Tesch'], 'revisão em PR que nunca fecha entra, porque o voto tem data própria');
assert.equal(porNome['Nathalia Tesch'].total, 1);
assert.equal(porNome['Pessoa Desconhecida'], undefined, 'fora da lista de devs conhecidos não entra');
assert.equal(ranking[0].name, 'Henrique Moraca', 'ordenado por total, depois por aprovados');

// Revogação de voto (0) ainda conta como interação real, datada
const revogado = getDailyReviewRanking([evento('Henrique Moraca', 7, 0, '2026-10-14T13:00:00Z')], devs);
assert.equal(revogado[0].total, 1);
assert.equal(revogado[0].noVote, 1);

console.log('✅ reviewRanking: conta voto por data real, dedupe por PR+pessoa, PR aberta entra certo');
