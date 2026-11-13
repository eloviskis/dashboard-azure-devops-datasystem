// Check do port de painelMensal.ts pra CommonJS — `node painelMensal.check.js`. Mesmos casos do
// frontend/src/utils/painelMensal.check.mjs (ver esse arquivo pro original), sem itensDoTime/
// itensDaMetrica (só servem pro modal de drill-down da UI, não portados) e com buckets construídos à
// mão aqui em vez de periodGrouping.ts (não usado pelo digest — ver painelPorTimeDigest.js, que usa
// buildBuckets de 15 dias, não mensal/semanal).
const assert = require('node:assert/strict');
const { buildPainelMensal, dentroDaFaixa, faixaDoTime, METAS_PADRAO, metricasDoTime } = require('./painelMensal.js');

const MAR = (dia) => `2026-03-${String(dia).padStart(2, '0')}T12:00:00Z`;
const FEV = (dia) => `2026-02-${String(dia).padStart(2, '0')}T12:00:00Z`;

const item = (team, extra = {}) => ({
  workItemId: Math.random(), title: 't', type: 'User Story', state: 'Closed', team,
  closedDate: MAR(10), createdDate: FEV(1), priority: '2', ...extra,
});

const items = [
  // Alfa, março: fluxo por item 6/(6+1+1) = 75 (fila = Aguardando CR + Fazendo CR); cycle dias úteis (10, 20, null) → P85 = 20
  item('Alfa', { timeInStatusDays: { Active: 6, 'Aguardando code review': 1, 'Fazendo code review': 1 }, cycleTimeBusinessDays: 10, cycleTime: 12 }),
  item('Alfa', { timeInStatusDays: { Active: 6, 'Aguardando code review': 1, 'Fazendo code review': 1 }, cycleTimeBusinessDays: 20, cycleTime: 25 }),
  item('Alfa', { timeInStatusDays: { Active: 6, 'Aguardando code review': 1, 'Fazendo code review': 1 }, cycleTimeBusinessDays: null, cycleTime: null }),
  // Alfa, março: retrabalho = Bug + Issue concluídos ÷ todos os concluídos (11): 2 de 11 = 18,2%
  item('Alfa', { type: 'User Story' }),
  item('Alfa', { type: 'Bug' }),
  item('Alfa', { type: 'Issue', createdDate: MAR(2) }),
  item('Alfa', { type: 'Eventuality' }),
  item('Alfa', { type: 'Task' }),
  // Alfa: P0 = prioridade vazia ou 0. Dois P0 (5 e 9 dias) → 50% no prazo de 7. Prioridade "1" fica de fora.
  item('Alfa', { priority: null, cycleTime: 5, cycleTimeBusinessDays: null }),
  item('Alfa', { priority: '0', cycleTime: 9, cycleTimeBusinessDays: null }),
  item('Alfa', { priority: '1', cycleTime: 2, cycleTimeBusinessDays: null }),
  // Alfa: Issues criadas em fevereiro contam em bugs de fevereiro; Bug não conta; Issue de 2025 não conta
  item('Alfa', { type: 'Issue', state: 'Active', closedDate: null, createdDate: FEV(5) }),
  item('Alfa', { type: 'Issue', state: 'Active', closedDate: null, createdDate: FEV(9) }),
  item('Alfa', { type: 'Bug', state: 'Active', closedDate: null, createdDate: FEV(9) }),
  item('Alfa', { type: 'Issue', state: 'Active', closedDate: null, createdDate: '2025-02-09T12:00:00Z' }),

  // Beta, março: cycle mediana 35 (uma só)
  item('Beta', { cycleTimeBusinessDays: 35, cycleTime: 40 }),
  // Gama, março: P85 de [5, 6, 7, 500] = 500 — P85 é sensível a fechamento em massa (por isso o aviso no painel)
  item('Gama', { cycleTimeBusinessDays: 5, cycleTime: 5 }),
  item('Gama', { cycleTimeBusinessDays: 6, cycleTime: 6 }),
  item('Gama', { cycleTimeBusinessDays: 7, cycleTime: 7 }),
  item('Gama', { cycleTimeBusinessDays: 500, cycleTime: 500 }),
  // Sustentacao, março: cycle 10 — entra na média de todos, fica fora da média sem Sustentação
  item('Sustentacao', { cycleTimeBusinessDays: 10, cycleTime: 12 }),
  // Sustentação e Boltz: Bug fica fora do escopo da GetNaves (só Issue, User Story e Eventuality entram)
  item('Sustentacao', { type: 'Bug', cycleTimeBusinessDays: 999, cycleTime: 999 }),
  item('Boltz', { type: 'Bug', cycleTimeBusinessDays: 999, cycleTime: 999 }),
  // Franquia, março: tem dado de Fluxo de Eficiência, mas o perfil dela não acompanha essa métrica
  item('Franquia', { timeInStatusDays: { Active: 9, 'Aguardando code review': 1 }, cycleTimeBusinessDays: 15, cycleTime: 15 }),
  // Delta, março: "Para Desenvolver" conta como fila — 6/(6+2) = 75%
  item('Delta', { timeInStatusDays: { Active: 6, 'Para desenvolver': 2 } }),
  // Epsilon, março: "Testing" conta como ativo e "CodeReview" conta como fila — (4+2) ÷ ((4+2)+2) = 75%
  item('Epsilon', { timeInStatusDays: { Active: 4, Testing: 2, CodeReview: 2 } }),
  // Sem Time nunca entra
  item('Sem Time', { cycleTimeBusinessDays: 999, cycleTime: 999 }),
];

// 12 baldes mensais de 2026 (construídos à mão — buildPainelMensal só precisa de {label, start, end})
const meses = Array.from({ length: 12 }, (_, m) => ({
  label: `${m + 1}/2026`,
  start: new Date(2026, m, 1, 0, 0, 0),
  end: new Date(2026, m + 1, 0, 23, 59, 59, 999),
}));
const p = buildPainelMensal(items, meses);
const MAR_IDX = 2;
const FEV_IDX = 1;

assert.equal(p.labels.length, 12, 'uma coluna por mês');
assert.deepEqual(p.times, ['Alfa', 'Beta', 'Delta', 'Epsilon', 'Franquia', 'Gama', 'Sustentacao'], 'sem Sem Time, ordenados');

// Fluxo de Eficiência
assert.equal(p.porTime.fluxo.Alfa[MAR_IDX], 75, '6 ativos ÷ (6+2) = 75%');
assert.equal(p.porTime.fluxo.Alfa[0], null, 'sem concluídos em janeiro = null, não zero');
assert.equal(p.porTime.fluxo.Beta[MAR_IDX], null, 'item sem tempo em nenhum estado não entra no fluxo');
assert.equal(p.porTime.fluxo.Franquia[MAR_IDX], 90, 'Franquia: cálculo roda igual pra qualquer time (9 ativos ÷ (9+1))');
assert.equal(p.mediaTodos.fluxo[MAR_IDX], 75, 'mas a Franquia não entra na média: perfil dela não acompanha Fluxo de Eficiência');
assert.equal(p.porTime.fluxo.Delta[MAR_IDX], 75, '"Para Desenvolver" conta como fila');
assert.equal(p.porTime.fluxo.Epsilon[MAR_IDX], 75, '"Testing" conta como ativo e "CodeReview" como fila');

// Cycle Time em dias úteis, P85: null não entra
assert.equal(p.porTime.cycle.Alfa[MAR_IDX], 20, 'P85 nearest-rank de 10 e 20 = 20');
assert.equal(p.porTime.cycle.Beta[MAR_IDX], 35);
assert.equal(p.porTime.cycle.Gama[MAR_IDX], 500, 'P85 de [5,6,7,500] = 500: fechamento em massa sobe o P85');
assert.equal(p.porTime.cycle.Sustentacao[MAR_IDX], 10, 'Bug de Sustentação (999 d) fora do escopo da GetNaves');

// Bugs Produção: Issue pela data de criação, no período
assert.equal(p.porTime.bugs.Alfa[FEV_IDX], 2, 'duas Issues criadas em fevereiro; Bug e Issue de 2025 ficam de fora');

// Índice de Retrabalho: Bug + Issue ÷ todos concluídos: 2 de 11 = 18,2%
assert.equal(p.porTime.retrabalho.Alfa[MAR_IDX], 18.2, 'Bug e Issue entram no numerador; Task entra só no denominador');

// SLA P0: vazio e 0 são P0; "1" não
assert.equal(p.porTime.slaP0.Alfa[MAR_IDX], 50, 'P0 = vazio ou 0; prioridade "1" não entra');

// Quantidade de P0: contagem dos mesmos itens (os 2 P0 concluídos), não o %
assert.equal(p.porTime.qtdP0.Alfa[MAR_IDX], 2, 'quantidade de P0 = os 2 concluídos com prioridade vazia ou 0');

// Consolidado: média dos VALORES dos times. Cycle março: (20 + 35 + 500 + 10) / 4 = 141,3
assert.equal(p.mediaTodos.cycle[MAR_IDX], 141.3);
// Sem Sustentação: (20 + 35 + 500) / 3 = 185
assert.equal(p.mediaSemSustentacao.cycle[MAR_IDX], 185);

// Filtro de times: só o pedido entra
assert.deepEqual(buildPainelMensal(items, meses, ['Alfa']).times, ['Alfa']);

// Faixas
assert.equal(dentroDaFaixa(47, { min: 45, max: 50 }), true);
assert.equal(dentroDaFaixa(40, { min: 45, max: 50 }), false);
assert.equal(dentroDaFaixa(25, METAS_PADRAO.retrabalho), true, 'retrabalho ≤ 31 é verde');
assert.equal(dentroDaFaixa(35, METAS_PADRAO.retrabalho), false);
assert.equal(dentroDaFaixa(null, { min: 45, max: 50 }), null, 'sem dado não é verde nem vermelho');
assert.deepEqual(faixaDoTime(METAS_PADRAO.fluxo, 'Sustentação'), { min: 50, max: 55 }, 'override da Sustentação');
assert.deepEqual(faixaDoTime(METAS_PADRAO.fluxo, 'Alfa'), { min: 45, max: 50 });
assert.deepEqual(faixaDoTime(METAS_PADRAO.slaP0, 'Sustentação'), { min: 60, max: 70 }, 'SLA P0 só tem meta própria de Sustentação');
assert.deepEqual(faixaDoTime(METAS_PADRAO.bugs, 'Franquia'), { min: 80, max: 100 }, 'override da Franquia/CTC');
assert.deepEqual(faixaDoTime(METAS_PADRAO.retrabalho, 'Franquia'), { min: null, max: 31 }, 'override da Franquia/CTC');

// Perfil por time: quais métricas cada um acompanha
assert.deepEqual(metricasDoTime('Sustentacao'), ['fluxo', 'cycle', 'slaP0', 'retrabalho', 'qtdP0'], 'Sustentação não tem Bugs Produção');
assert.deepEqual(metricasDoTime('Franquia'), ['bugs', 'retrabalho', 'qtdP0'], 'Franquia/CTC não tem Fluxo nem Cycle Time');
assert.deepEqual(metricasDoTime('Alfa'), ['fluxo', 'cycle', 'bugs', 'retrabalho', 'qtdP0'], 'time genérico cai no perfil padrão, sem SLA P0');

console.log('✅ painelMensal.js (port CommonJS): fluxo, cycle (P85), bugs, retrabalho, P0, consolidado, faixas e perfil por time OK — paridade com painelMensal.ts confirmada');
