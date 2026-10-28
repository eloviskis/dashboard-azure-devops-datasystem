// Check de painelPorTimeDigest.js — `node painelPorTimeDigest.check.js`. Só a lógica pura (sem banco):
// o gate de 15 dias e a construção dos 2 baldes de período.
const assert = require('node:assert/strict');
const { deveEnviar, buildBuckets } = require('./painelPorTimeDigest');

const DIA_MS = 24 * 60 * 60 * 1000;
const agora = new Date('2026-10-28T08:15:00-03:00');

// Gate de 15 dias
assert.equal(deveEnviar(null, agora), true, 'nunca enviado -> manda');
assert.equal(deveEnviar(new Date(agora.getTime() - 14 * DIA_MS), agora), false, '14 dias -> ainda não');
assert.equal(deveEnviar(new Date(agora.getTime() - 15 * DIA_MS), agora), true, 'exatos 15 dias -> manda');
assert.equal(deveEnviar(new Date(agora.getTime() - 20 * DIA_MS), agora), true, '20 dias (cron atrasado/caiu) -> manda');
assert.equal(deveEnviar(new Date(agora.getTime() - 1 * DIA_MS), agora), false, '1 dia -> não');

// Buckets: 2 janelas de 15 dias, consecutivas, sem gap nem overlap
const [anterior, atual] = buildBuckets(agora);
assert.equal(atual.end.getTime(), agora.getTime(), 'período atual termina agora');
assert.equal(atual.start.getTime(), agora.getTime() - 15 * DIA_MS, 'período atual começa 15 dias atrás');
assert.equal(anterior.end.getTime(), atual.start.getTime(), 'período anterior termina exatamente onde o atual começa (sem gap/overlap)');
assert.equal(anterior.start.getTime(), atual.start.getTime() - 15 * DIA_MS, 'período anterior tem 15 dias de largura');
assert.ok(anterior.label && atual.label && anterior.label !== atual.label, 'labels distintos e preenchidos');

console.log('✅ painelPorTimeDigest: gate de 15 dias e buckets OK');
