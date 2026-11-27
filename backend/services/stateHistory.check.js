#!/usr/bin/env node
// Check de computeEffectiveClosedDate. Sem framework — node stateHistory.check.js
const assert = require('assert/strict');
const { computeEffectiveClosedDate } = require('./stateHistory');

// Fechamento em lote: Finished vem antes do Closed — o fim real é o Finished, não o Closed tardio
const comFechamentoTardio = [
  { state: 'New', enteredAt: '2026-01-01T12:00:00Z' },
  { state: 'Active', enteredAt: '2026-01-05T12:00:00Z' },
  { state: 'Finished', enteredAt: '2026-01-20T12:00:00Z' },
  { state: 'Closed', enteredAt: '2026-02-15T12:00:00Z' },
];
assert.equal(computeEffectiveClosedDate(comFechamentoTardio, true), '2026-01-20T12:00:00Z', 'fim = Finished, não o Closed tardio');

// Sem Finished/Resolved, vai direto pra Closed: o Closed é o próprio fim
const semPronto = [
  { state: 'New', enteredAt: '2026-01-01T12:00:00Z' },
  { state: 'Active', enteredAt: '2026-01-05T12:00:00Z' },
  { state: 'Closed', enteredAt: '2026-01-10T12:00:00Z' },
];
assert.equal(computeEffectiveClosedDate(semPronto, true), '2026-01-10T12:00:00Z');

// Reaberto depois de concluído (estado atual não é mais um estado concluído): não vaza data de conclusão antiga
assert.equal(computeEffectiveClosedDate(comFechamentoTardio, false), null, 'item reaberto não tem data de conclusão');

// Sem transições, ou nenhuma delas é estado de conclusão
assert.equal(computeEffectiveClosedDate([], true), null);
assert.equal(computeEffectiveClosedDate([{ state: 'New', enteredAt: '2026-01-01T12:00:00Z' }], true), null, 'nenhuma transição é Finished/Resolved/Closed');

console.log('✅ stateHistory: fim = primeiro Finished/Resolved/Closed, não o último, item reaberto não vaza data');
