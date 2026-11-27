#!/usr/bin/env node
// Check de dias úteis. Sem framework — node businessDays.check.js
const assert = require('assert/strict');
const { calcularDiasUteis, diaBRT } = require('./businessDays');

// seg -> sex da mesma semana = 5 úteis
assert.equal(calcularDiasUteis('2026-03-02T12:00:00', '2026-03-06T12:00:00'), 5);
// sábado -> domingo = 0 úteis
assert.equal(calcularDiasUteis('2026-03-07T12:00:00', '2026-03-08T12:00:00'), 0);
// sexta -> segunda: sexta + segunda = 2 úteis (sábado e domingo não contam)
assert.equal(calcularDiasUteis('2026-03-06T12:00:00', '2026-03-09T12:00:00'), 2);
// mesmo dia útil = 1
assert.equal(calcularDiasUteis('2026-03-04T12:00:00', '2026-03-04T18:00:00'), 1);
// datas inválidas ou fim antes do início não devolvem número
assert.equal(calcularDiasUteis(undefined, '2026-03-04'), null);
assert.equal(calcularDiasUteis(null, '2026-03-04'), null, 'null nao vira 1970');
assert.equal(calcularDiasUteis('2026-03-04', null), null);
assert.equal(calcularDiasUteis('2026-03-10', '2026-03-04'), null);

// 02:30 UTC de 06/03 ainda é 05/03 em Brasília (sábado): o dia do fim é o de Brasília
assert.equal(diaBRT('2026-03-06T02:30:00Z'), '2026-03-05');
assert.equal(diaBRT('2026-03-06T15:00:00Z'), '2026-03-06');

console.log('✅ businessDays: fim de semana fora, início/fim incluídos, entrada inválida = null, dia em Brasília');
