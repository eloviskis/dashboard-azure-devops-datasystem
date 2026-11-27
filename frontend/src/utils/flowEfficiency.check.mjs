// Check da matemática do Flow Efficiency. Sem framework — `node flowEfficiency.check.mjs`
// (Node >= 23.6 executa .ts direto por type-stripping nativo; em Node 22.6-23.5 use
// `node --experimental-strip-types`).
import assert from 'node:assert/strict';
import { classifyStatus, computeFlowEfficiency, splitItemTime } from './flowEfficiency.ts';

// ── classificação de status (nomes reais vistos na base de produção)
const cases = [
  ['Active', 'active'],
  ['Ativo', 'active'],
  ['Fazendo code review', 'active'],
  ['Testando QA', 'active'],
  ['Design', 'active'],
  ['Testing', 'active'],
  ['CodeReview', 'active'],
  ['desenvolvendo', 'active'],
  ['UX/UI', 'active'],
  ['New', 'wait'],
  ['Para desenvolver', 'wait'],
  ['Aguardando QA', 'wait'],
  ['Impedido', 'wait'],
  ['Disapproved', 'wait'],
  ['Finished', 'excluded'],
  ['Closed', 'excluded'],
  ['Resolved', 'excluded'],
  ['Removed', 'excluded'],
  // os dois traiçoeiros: substring casaria errado se a regra não fosse exata/ordenada
  ['Pronto para Desenvolvimento', 'wait'],   // não é entrega, é fila de backlog
  ['Aguardando code review', 'wait'],        // esperando review não é fazer review
];
for (const [status, expected] of cases) {
  assert.equal(classifyStatus(status), expected, `classifyStatus('${status}')`);
}

// ── agregação
const item = (team, timeInStatusDays) => ({
  workItemId: Math.random(), title: 't', type: 'Bug', state: 'Closed', team, timeInStatusDays,
});

// ── quebra de um item só (alimenta a lista que abre ao clicar em cada parte da barra)
const split = splitItemTime(item('Alfa', { Active: 3, 'Testando QA': 1, New: 10, 'Aguardando QA': 6, Closed: 90 }));
assert.equal(split.activeDays, 4, 'Active + Testando QA são trabalho');
assert.equal(split.waitDays, 16, 'New + Aguardando QA são espera; Closed fica fora');
assert.equal(split.efficiency, 20, '4 / 20 = 20%');
assert.equal(split.topWaitStatus, 'New', 'maior fila do item');
assert.equal(split.topWaitDays, 10);
assert.deepEqual(split.waitByStatus, { New: 10, 'Aguardando QA': 6 }, 'só os status de espera');

const semHistorico = splitItemTime(item('Alfa', undefined));
assert.equal(semHistorico.activeDays, 0);
assert.equal(semHistorico.topWaitStatus, null, 'item sem histórico não inventa fila');

const { teams, global } = computeFlowEfficiency([
  // Alfa: 3 itens iguais — 6d ativo, 2d espera (New) e 90d em Closed que NÃO pode contar
  item('Alfa', { Active: 6, New: 2, Closed: 90 }),
  item('Alfa', { Active: 6, New: 2, Closed: 90 }),
  item('Alfa', { Active: 6, New: 2, Closed: 90 }),
  // Beta: só 2 itens — abaixo do mínimo, some do ranking
  item('Beta', { Active: 1, New: 9 }),
  item('Beta', { Active: 1, New: 9 }),
], 3);

assert.deepEqual(teams.map(t => t.team), ['Alfa'], 'time com menos de 3 itens sai do ranking');

const alfa = teams[0];
assert.equal(alfa.efficiency, 75, '6d ativo / 8d totais = 75% (Closed fora da conta)');
assert.equal(alfa.efficiency + alfa.waitPct, 100, 'a barra empilhada tem que fechar 100%');
assert.ok(alfa.efficiency <= 100, 'eficiência não pode estourar 100%');
assert.equal(alfa.activeDays, 6, 'média de dias ativos por item');
assert.equal(alfa.waitDays, 2, 'média de dias em espera por item');
assert.equal(alfa.topWaitStatus, 'New', 'maior fila do time');
assert.equal(alfa.count, 3);

// global inclui os itens do Beta mesmo ele não aparecendo no ranking
assert.equal(global.count, 5, 'global conta todos os itens concluídos');
assert.equal(global.efficiency, 45, 'ativo 18+2=20 / total 20+(6+18)=44 = 45%');

// item sem histórico de status é ignorado por completo
assert.equal(computeFlowEfficiency([item('Alfa', undefined)], 1).teams.length, 0);

console.log(`✅ flowEfficiency: ${cases.length} classificações + agregação OK`);
