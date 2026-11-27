// Check da agregação de top gargalos por time. Sem framework — `node bottleneckTop.check.mjs`
// (Node 24 executa .ts direto por type-stripping, igual flowEfficiency.check.mjs).
import assert from 'node:assert/strict';
import { computeTopBottlenecksByTeam } from './bottleneckTop.ts';

const item = (team, timeInStatusDays, state = 'Closed') => ({
  workItemId: Math.random(), title: 't', type: 'Bug', state, team, timeInStatusDays,
});

// Time Alfa: 3 itens concluídos. Finished/Closed (pós-entrega) não podem aparecer no top, mesmo com muitos dias.
const alfa = [
  item('Alfa', { New: 6, Active: 2, Finished: 90, Closed: 0 }),
  item('Alfa', { New: 3, Active: 4, Finished: 80, Closed: 0 }),
  item('Alfa', { New: 0, Active: 1, Finished: 70, Closed: 0 }),
];
const [a] = computeTopBottlenecksByTeam(alfa);
assert.equal(a.team, 'Alfa');
assert.equal(a.count, 3);
assert.ok(!a.top.some(t => t.status === 'Finished' || t.status === 'Closed'), 'pós-entrega fora do top');
assert.equal(a.top[0].status, 'New', 'New tem a maior média (9/3 = 3,0)');
assert.equal(a.top[0].avgDays, 3);
assert.equal(a.top[1].status, 'Active', 'Active: 7/3 = 2,3');
assert.equal(a.top[1].avgDays, 2.3);

// Denominador é o total de concluídos do time: item que não passou pelo status puxa a média pra baixo.
const denom = [
  item('Beta', { 'Aguardando QA': 6 }),
  item('Beta', {}),
  item('Beta', {}),
];
const [b] = computeTopBottlenecksByTeam(denom);
assert.equal(b.top[0].avgDays, 2, '6 dias ÷ 3 itens concluídos = 2, não 6');

// Time com menos de 3 concluídos some.
const pequeno = [item('Gama', { New: 5 }), item('Gama', { New: 5 })];
assert.equal(computeTopBottlenecksByTeam(pequeno).length, 0, 'time com 2 itens fica de fora');

// Sem Time, item sem histórico e item não concluído são ignorados.
const ruido = [
  item('Sem Time', { New: 9 }), item('Sem Time', { New: 9 }), item('Sem Time', { New: 9 }),
  item('Delta', undefined), item('Delta', undefined), item('Delta', undefined),
  item('Epsilon', { New: 9 }, 'Active'), item('Epsilon', { New: 9 }, 'Active'), item('Epsilon', { New: 9 }, 'Active'),
];
assert.equal(computeTopBottlenecksByTeam(ruido).length, 0, 'nada válido nesse conjunto');

// Limite de topN e ordem decrescente.
const muitos = [
  item('Zeta', { S1: 1, S2: 5, S3: 3, S4: 9, S5: 7 }),
  item('Zeta', { S1: 1, S2: 5, S3: 3, S4: 9, S5: 7 }),
  item('Zeta', { S1: 1, S2: 5, S3: 3, S4: 9, S5: 7 }),
];
const [z] = computeTopBottlenecksByTeam(muitos, 3);
assert.deepEqual(z.top.map(t => t.status), ['S4', 'S5', 'S2'], 'top 3 em ordem decrescente');

console.log('✅ bottleneckTop: top N por time, pós-entrega fora, denominador e mínimo OK');
