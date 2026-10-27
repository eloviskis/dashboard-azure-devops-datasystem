// Check do Painel por Time. Sem framework — `node painelMensal.check.mjs`
// (Node 24 executa .ts por type-stripping, igual os outros checks).
import assert from 'node:assert/strict';
import { buildPainelMensal, dentroDaFaixa, faixaDoTime, itensDaMetrica, itensDoTime, METAS_PADRAO, metricasDoTime } from './painelMensal.ts';
import { getPeriodBuckets } from './periodGrouping.ts';

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
  item('Alfa', { type: 'User Story', reincidencia: '2' }),
  item('Alfa', { type: 'Bug', reincidencia: null }),
  item('Alfa', { type: 'Issue', reincidencia: '', createdDate: MAR(2) }),
  item('Alfa', { type: 'Eventuality', reincidencia: 0 }),
  item('Alfa', { type: 'Task', reincidencia: '5' }),
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
  // Sustentação e Boltz: Bug fica fora do escopo da GetNaves (só Issue, User Story e Eventuality entram),
  // confirmado com o CSV real dos dois times
  item('Sustentacao', { type: 'Bug', cycleTimeBusinessDays: 999, cycleTime: 999 }),
  item('Boltz', { type: 'Bug', cycleTimeBusinessDays: 999, cycleTime: 999 }),
  // Franquia, março: tem dado de Fluxo de Eficiência (o cálculo roda igual pra qualquer time), mas o perfil
  // dela não acompanha essa métrica — prova que mediaTodos/mediaSemSustentacao não contam esse valor mesmo
  // assim, embora o número por time (porTime.fluxo.Franquia) continue calculado normalmente.
  item('Franquia', { timeInStatusDays: { Active: 9, 'Aguardando code review': 1 }, cycleTimeBusinessDays: 15, cycleTime: 15 }),
  // Sem Time nunca entra
  item('Sem Time', { cycleTimeBusinessDays: 999, cycleTime: 999 }),
];

// Mensal de 2026: 12 colunas; março = índice 2
const meses = getPeriodBuckets(new Date(2026, 0, 1), new Date(2026, 11, 31), 'monthly');
const p = buildPainelMensal(items, meses);
const MAR_IDX = 2;
const FEV_IDX = 1;

assert.equal(p.labels.length, 12, 'uma coluna por mês');
assert.deepEqual(p.times, ['Alfa', 'Beta', 'Franquia', 'Gama', 'Sustentacao'], 'sem Sem Time, ordenados');

// Fluxo de Eficiência (conta da aba Kanban)
assert.equal(p.porTime.fluxo.Alfa[MAR_IDX], 75, '6 ativos ÷ (6+2) = 75%');
assert.equal(p.porTime.fluxo.Alfa[0], null, 'sem concluídos em janeiro = null, não zero');
assert.equal(p.porTime.fluxo.Beta[MAR_IDX], null, 'item sem tempo em nenhum estado não entra no fluxo');
assert.equal(p.porTime.fluxo.Franquia[MAR_IDX], 90, 'Franquia: cálculo roda igual pra qualquer time (9 ativos ÷ (9+1))');
assert.equal(p.mediaTodos.fluxo[MAR_IDX], 75, 'mas a Franquia não entra na média: perfil dela não acompanha Fluxo de Eficiência');

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

// Granularidade semanal: o fechamento de 10/03 cai numa só semana, e os 75% aparecem nela
const semanas = getPeriodBuckets(new Date(2026, 2, 1), new Date(2026, 2, 31), 'weekly');
const semanaIdx = semanas.findIndex(b => b.start <= new Date(MAR(10)) && new Date(MAR(10)) <= b.end);
assert.ok(semanaIdx >= 0, 'achou a semana de 10/03');
const pSem = buildPainelMensal(items, semanas, ['Alfa']);
assert.equal(pSem.porTime.fluxo.Alfa[semanaIdx], 75, 'semanal: mesma conta na semana do fechamento');

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

// Perfil por time: quais métricas cada um acompanha, igual aos blocos da planilha de gestão
assert.deepEqual(metricasDoTime('Sustentacao'), ['fluxo', 'cycle', 'slaP0', 'retrabalho', 'qtdP0'], 'Sustentação não tem Bugs Produção');
assert.deepEqual(metricasDoTime('Franquia'), ['bugs', 'retrabalho', 'qtdP0'], 'Franquia/CTC não tem Fluxo nem Cycle Time');
assert.deepEqual(metricasDoTime('Alfa'), ['fluxo', 'cycle', 'bugs', 'retrabalho', 'qtdP0'], 'time genérico cai no perfil padrão, sem SLA P0');

// itensDaMetrica: a lista por trás do gráfico de barras nunca diverge do número da tabela
const alfaMar = itensDoTime(items, 'Alfa');
const bucketMar = meses[MAR_IDX];
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'fluxo').length, 3, 'fluxo: os 3 itens com tempo de status em março');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'cycle').length, 2, 'cycle: só os 2 itens com cycleTimeBusinessDays numérico (o 3º é null)');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'retrabalho').length, 2, 'retrabalho: só Bug e Issue, não Task/Eventuality');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'qtdP0').length, 2, 'qtdP0: os 2 P0 concluídos, dentro ou fora do prazo');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'slaP0').length, 1, 'slaP0: só o P0 concluído em até 7 dias (o de 9 dias fica fora)');
assert.equal(itensDaMetrica(alfaMar, meses[FEV_IDX], 'bugs').length, 2, 'bugs: Issues criadas em fevereiro');

console.log('✅ painelMensal: fluxo, cycle (P85), bugs, retrabalho, P0, semanal, consolidado, faixas, perfil por time e itensDaMetrica OK');
