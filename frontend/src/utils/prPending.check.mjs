// Check da lógica de PRs pendentes por pessoa. Sem framework — `node prPending.check.mjs`
// (Node >= 23.6 executa .ts direto por type-stripping nativo).
import assert from 'node:assert/strict';
import { prPendingInfo, splitPendingByPerson } from './prPending.ts';

// 1h a menos que n dias cheios: prPendingInfo usa Math.ceil, e "exatamente n dias" vira n+1 por causa
// dos milissegundos entre montar o fixture e ler o relógio. Assim o arredondamento é determinístico.
const diasAtras = n => new Date(Date.now() - (n * 86400000 - 3600000)).toISOString();

const pr = (id, status, createdBy, reviewers, dias = 10) => ({
  pullRequestId: id, title: `PR ${id}`, status, createdBy,
  createdDate: diasAtras(dias), reviewers, votes: [], hasValidaCRLabel: false,
  lifetimeDays: null, url: '', repositoryName: 'USE',
});

// ── números de um PR
const info = prPendingInfo(pr(1, 'active', 'Ana', [
  { name: 'Bruno', vote: 10 },
  { name: 'Carla', vote: 0 },
  { name: 'Diego', vote: -5 },
  // grupo do Azure: aparece como reviewer mas não é gente
  { name: '[datasystemsoftwares]\\QA Review', vote: 0, isContainer: true },
], 12));
assert.equal(info.reviewers, 3, 'grupo (isContainer) não conta como revisor');
assert.equal(info.approvals, 1);
assert.deepEqual(info.noVote, ['Carla'], 'grupo não entra em "falta votar"');
assert.deepEqual(info.rejected, ['Diego'], 'voto negativo = rejeitado/aguardando autor');
assert.equal(info.daysOpen, 12, 'dias em aberto');

assert.equal(prPendingInfo(pr(2, 'active', 'Ana', [])).reviewers, 0, 'PR sem reviewer não quebra');
assert.equal(prPendingInfo({ ...pr(3, 'active', 'Ana', []), reviewers: undefined }).noVote.length, 0);

// ── quebra por pessoa
const base = [
  pr(10, 'active', 'Ana', [{ name: 'Bruno', vote: 0 }], 30),
  pr(11, 'active', 'Ana', [{ name: 'Bruno', vote: 10 }], 5),
  pr(12, 'completed', 'Ana', [{ name: 'Bruno', vote: 0 }], 40),   // fechado: fora
  pr(13, 'abandoned', 'Ana', [{ name: 'Bruno', vote: 0 }], 40),   // abandonado: fora
  pr(14, 'active', 'Carla', [{ name: 'Ana', vote: 0 }], 20),      // Ana revisora, sem voto
  pr(15, 'active', 'Carla', [{ name: 'Ana', vote: 10 }], 20),     // Ana já votou: fora
  pr(16, 'active', 'Carla', [{ name: 'Ana', vote: 0, isContainer: true }], 20), // "Ana" grupo: fora
];

const ana = splitPendingByPerson(base, 'Ana');
assert.deepEqual(ana.asAuthor.map(p => p.pullRequestId), [10, 11], 'só PR aberto que ela criou, mais antigo primeiro');
assert.deepEqual(ana.asReviewer.map(p => p.pullRequestId), [14], 'só onde ela é revisora sem voto');

const bruno = splitPendingByPerson(base, 'Bruno');
assert.deepEqual(bruno.asAuthor.map(p => p.pullRequestId), [], 'Bruno não abriu PR');
assert.deepEqual(bruno.asReviewer.map(p => p.pullRequestId), [10], 'PR 11 ele já aprovou');

// autora e revisora do mesmo PR não pode duplicar
const propria = [pr(20, 'active', 'Ana', [{ name: 'Ana', vote: 0 }], 3)];
const dela = splitPendingByPerson(propria, 'Ana');
assert.equal(dela.asAuthor.length, 1);
assert.equal(dela.asReviewer.length, 0, 'PR próprio não entra na lista de revisão pendente');

assert.deepEqual(splitPendingByPerson(base, ''), { asAuthor: [], asReviewer: [] }, 'sem pessoa escolhida');

console.log('✅ prPending: números por PR + quebra autor/revisor OK');
