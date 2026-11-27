#!/usr/bin/env node
// Check das datas reais de Nível 1/2. Sem framework — node codeReviewLevelDates.check.js
const assert = require('assert/strict');
const { findLevelSetDates } = require('./services/codeReviewLevelDates');

const FIELD_LEVEL1 = 'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028';
const FIELD_LEVEL2 = 'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e';
const rev = (n, campo1, campo2, data) => ({
  rev: n,
  fields: {
    'System.ChangedDate': data,
    ...(campo1 ? { [FIELD_LEVEL1]: { displayName: campo1 } } : {}),
    ...(campo2 ? { [FIELD_LEVEL2]: { displayName: campo2 } } : {}),
  },
});

// Amostra real da tarefa 93110: vazio até a revisão 1, os dois preenchidos juntos na revisão 9 (06/10).
const revisoesReais = [
  rev(1, null, null, '2026-10-06T17:21:00.443Z'),
  rev(9, 'Nathalia Cristina Nascimento', 'Nathalia Cristina Nascimento', '2026-10-06T20:38:53.64Z'),
];
const { level1SetAt, level2SetAt } = findLevelSetDates(revisoesReais, 'Nathalia Cristina Nascimento', 'Nathalia Cristina Nascimento');
assert.equal(level1SetAt, '2026-10-06T20:38:53.64Z');
assert.equal(level2SetAt, '2026-10-06T20:38:53.64Z');

// Revisor trocado: Nível 2 era de uma pessoa, depois passou pra outra — vale a data da troca mais recente
const comTroca = [
  rev(1, null, null, '2026-01-01T10:00:00Z'),
  rev(2, 'Carlos Batista', 'Carlos Batista', '2026-01-02T10:00:00Z'),
  rev(3, 'Carlos Batista', 'Henrique Moraca', '2026-01-05T10:00:00Z'), // Nível 2 trocou de pessoa
];
const comTrocaResult = findLevelSetDates(comTroca, 'Carlos Batista', 'Henrique Moraca');
assert.equal(comTrocaResult.level1SetAt, '2026-01-02T10:00:00Z', 'Nível 1 nunca trocou, fica na data original');
assert.equal(comTrocaResult.level2SetAt, '2026-01-05T10:00:00Z', 'Nível 2 vale a data da troca pro valor atual');

// Campo nunca preenchido no histórico (sem revisão com esse valor) — sem data, cai no fallback de quem chamou
const semHistorico = findLevelSetDates([rev(1, null, null, '2026-01-01T10:00:00Z')], 'Alguém', '');
assert.equal(semHistorico.level1SetAt, null);
assert.equal(semHistorico.level2SetAt, null);

// Sem revisões não quebra
assert.deepEqual(findLevelSetDates([], '', ''), { level1SetAt: null, level2SetAt: null });
assert.deepEqual(findLevelSetDates(undefined, '', ''), { level1SetAt: null, level2SetAt: null });

console.log('✅ codeReviewLevelDates: data real da revisão (não a changed_date em lote), troca de revisor OK');
