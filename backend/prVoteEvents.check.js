#!/usr/bin/env node
// Check dos eventos de voto de PR. Sem framework — node prVoteEvents.check.js
const assert = require('assert/strict');
const { extractVoteEvents } = require('./services/prVoteEvents');

// Amostra real da PR 29687 (API de threads, lida ao vivo): comentários de sistema variados, só um é voto.
const threads = [
  { comments: [{ id: 1, commentType: 'system', author: { displayName: 'Henrique Moraca' }, content: 'Policy status has been updated', publishedDate: '2026-10-13T21:26:59.04Z' }] },
  { comments: [{ id: 1, commentType: 'system', author: { displayName: 'Microsoft.VisualStudio.Services.TFS' }, content: 'The reference refs/heads/x was updated.', publishedDate: '2026-10-13T21:30:08Z' }] },
  { comments: [{ id: 1, commentType: 'text', author: { displayName: 'Henrique Moraca' }, content: 'dúvida aqui', publishedDate: '2026-10-13T21:38:19.903Z' }] },
  { comments: [{ id: 1, commentType: 'system', author: { displayName: 'Microsoft.VisualStudio.Services.TFS' }, content: 'Nathalia Tesch joined as a reviewer', publishedDate: '2026-10-14T11:57:23.657Z' }] },
  { comments: [{ id: 1, commentType: 'system', author: { displayName: 'Nathalia Tesch' }, content: 'Nathalia Tesch voted 10', publishedDate: '2026-10-14T11:57:23.667Z' }] },
  // voto negativo e revogação de voto (0) também precisam ser capturados
  { comments: [{ id: 1, commentType: 'system', author: { displayName: 'Carlos Batista' }, content: 'Carlos Batista voted -10', publishedDate: '2026-10-14T09:00:00Z' }] },
  { comments: [{ id: 1, commentType: 'system', author: { displayName: 'Carlos Batista' }, content: 'Carlos Batista voted 0', publishedDate: '2026-10-14T09:05:00Z' }] },
];

const eventos = extractVoteEvents(threads);

assert.equal(eventos.length, 3, 'só os 3 comentários de voto real contam — "joined as reviewer" e texto comum ficam fora');
assert.deepEqual(eventos[0], { reviewerName: 'Nathalia Tesch', vote: 10, votedAt: '2026-10-14T11:57:23.667Z' });
assert.deepEqual(eventos[1], { reviewerName: 'Carlos Batista', vote: -10, votedAt: '2026-10-14T09:00:00Z' });
assert.deepEqual(eventos[2], { reviewerName: 'Carlos Batista', vote: 0, votedAt: '2026-10-14T09:05:00Z' }, 'revogação de voto (0) também vira evento — tem timestamp próprio');

// threads vazia ou sem comentários não quebra
assert.deepEqual(extractVoteEvents([]), []);
assert.deepEqual(extractVoteEvents([{ comments: [] }]), []);
assert.deepEqual(extractVoteEvents(undefined), []);

console.log('✅ prVoteEvents: só comentário de voto real vira evento, com pessoa/voto/data certos');
