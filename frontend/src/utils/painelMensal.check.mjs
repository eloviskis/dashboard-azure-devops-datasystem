// Check do Painel por Time. Sem framework — `node painelMensal.check.mjs`
// (Node 24 executa .ts por type-stripping, igual os outros checks).
import assert from 'node:assert/strict';
import { bugsPorDesenvolvedor, buildPainelMensal, dentroDaFaixa, faixaDoTime, itensDaMetrica, itensDoTime, METAS_PADRAO, metricasDoTime } from './painelMensal.ts';
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
  // Alfa, março: concluídos de vários tipos. O Bug daqui foi aberto em fevereiro: conta no retrabalho de fevereiro
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
  // Delta, março: "Para Desenvolver" conta como fila — 6/(6+2) = 75% (confirmado contra a API da GetNave)
  item('Delta', { timeInStatusDays: { Active: 6, 'Para desenvolver': 2 } }),
  // Epsilon, março: "Testing" conta como ativo e "CodeReview" conta como fila — grafia usada por
  // Boltz/Tático/Estratégico, diferente de "Testando QA"/"Aguardando Code Review" de Sustentação.
  // (4+2) ativo ÷ ((4+2)+2) fila = 75% (confirmado via query no banco de produção, não tinha CSV pra isso)
  item('Epsilon', { timeInStatusDays: { Active: 4, Testing: 2, CodeReview: 2 } }),
  // Sem Time nunca entra
  item('Sem Time', { cycleTimeBusinessDays: 999, cycleTime: 999 }),
];

// Mensal de 2026: 12 colunas; março = índice 2
const meses = getPeriodBuckets(new Date(2026, 0, 1), new Date(2026, 11, 31), 'monthly');
const p = buildPainelMensal(items, meses);
const MAR_IDX = 2;
const FEV_IDX = 1;

assert.equal(p.labels.length, 12, 'uma coluna por mês');
assert.deepEqual(p.times, ['Alfa', 'Beta', 'Delta', 'Epsilon', 'Franquia', 'Gama', 'Sustentacao'], 'sem Sem Time, ordenados');

// Fluxo de Eficiência (conta da aba Kanban)
assert.equal(p.porTime.fluxo.Alfa[MAR_IDX], 75, '6 ativos ÷ (6+2) = 75%');
assert.equal(p.porTime.fluxo.Alfa[0], null, 'sem concluídos em janeiro = null, não zero');
assert.equal(p.porTime.fluxo.Beta[MAR_IDX], null, 'item sem tempo em nenhum estado não entra no fluxo');
assert.equal(p.porTime.fluxo.Franquia[MAR_IDX], 90, 'Franquia: cálculo roda igual pra qualquer time (9 ativos ÷ (9+1))');
assert.equal(p.mediaTodos.fluxo[MAR_IDX], 75, 'mas a Franquia não entra na média: perfil dela não acompanha Fluxo de Eficiência');
assert.equal(p.porTime.fluxo.Delta[MAR_IDX], 75, '"Para Desenvolver" conta como fila: 6 ativos ÷ (6+2) = 75%');
assert.equal(p.porTime.fluxo.Epsilon[MAR_IDX], 75, '"Testing" conta como ativo e "CodeReview" como fila: 6 ativos ÷ (6+2) = 75%');

// Cycle Time em dias úteis, P85: null não entra
assert.equal(p.porTime.cycle.Alfa[MAR_IDX], 20, 'P85 nearest-rank de 10 e 20 = 20');
assert.equal(p.porTime.cycle.Beta[MAR_IDX], 35);
assert.equal(p.porTime.cycle.Gama[MAR_IDX], 500, 'P85 de [5,6,7,500] = 500: fechamento em massa sobe o P85');
assert.equal(p.porTime.cycle.Sustentacao[MAR_IDX], 10, 'Bug de Sustentação (999 d) fora do escopo da GetNaves');

// Bugs Produção: Issue pela data de criação, no período
assert.equal(p.porTime.bugs.Alfa[FEV_IDX], 2, 'duas Issues criadas em fevereiro; Bug e Issue de 2025 ficam de fora');

// Bugs Produção com versão: das Issues do período, só as com número de versão em algum campo ou tag
const issue = (extra) => item('Zeta', { type: 'Issue', state: 'Active', closedDate: null, createdDate: MAR(5), ...extra });
const comVersao = [
  issue({ baseVersion: '3.71.0.5' }),
  issue({ deliveredVersion: '3.71.0.7' }),
  issue({ rootCauseVersion: '3.69.1' }),
  issue({ tags: '[INTERNO]; 3.70.4.9' }),
  issue({ tags: ['[DINNI]', '3.71.0.7'] }),
  issue({ deliveredVersion: 'ANALISE', tags: '[ANÁLISE]' }), // texto não é versão
  issue({}),
  item('Zeta', { type: 'Bug', createdDate: MAR(5), baseVersion: '3.71.0.5' }), // Bug não é Bug Produção
  issue({ baseVersion: '3.70.0.1', createdDate: FEV(5) }),                    // fora do período
];
const pv = buildPainelMensal(comVersao, meses);
assert.equal(pv.porTime.bugs.Zeta[MAR_IDX], 7, 'Bugs Produção: as 7 Issues de março');
assert.equal(pv.porTime.bugsVersao.Zeta[MAR_IDX], 5, 'com versão: 5 (base, delivered, root cause, tag texto, tag lista)');
assert.equal(itensDaMetrica(comVersao, meses[MAR_IDX], 'bugsVersao').length, 5, 'lista do gráfico = número da tabela');
// Filtro "sem versão": o resto das Issues do período (a sem nada e a com texto no lugar da versão)
assert.equal(pv.porTime.bugsSemVersao.Zeta[MAR_IDX], 2, 'sem versão: 7 − 5');
assert.equal(pv.mediaTodos.bugsSemVersao[MAR_IDX], 2, 'média usa os mesmos times de "com versão"');
assert.equal(itensDaMetrica(comVersao, meses[MAR_IDX], 'bugsSemVersao').length, 2, 'lista do gráfico = número da tabela');

// Índice de Retrabalho: bugs internos (tipo Bug) abertos no período. Alfa tem 2 Bugs abertos em fevereiro
assert.equal(p.porTime.retrabalho.Alfa[FEV_IDX], 2, 'os 2 Bugs de fevereiro; Issue não conta');
assert.equal(p.porTime.retrabalho.Alfa[MAR_IDX], 0, 'concluir em março não conta: vale o mês em que o QA abriu o Bug');
assert.equal(p.porTime.retrabalho.Sustentacao[FEV_IDX], 1, 'Bug conta mesmo no time cujo escopo da GetNaves tira Bug');

// Bugs internos por desenvolvedor: regra da query BUGS_DEV_2026_AVD, uma cláusula por caso
const bug = (assignedTo, extra = {}) => item('Qualquer', { type: 'Bug', state: 'Closed', assignedTo, areaPath: 'USE\\Tatico', createdDate: MAR(3), ...extra });
const porDev = [
  bug('Ana'), bug('Ana'), bug('Ana', { createdDate: FEV(3), areaPath: 'USE' }),         // raiz da USE entra
  bug('Beto'), bug('Beto', { areaPath: 'USE\\Marketing\\DSMedia' }),                    // subárea entra
  bug('Beto', { tags: '[ANALISE PO]' }),                                                // outra tag: entra
  bug('Ana', { state: 'Active' }), bug('Ana', { state: 'Resolved' }),                   // só Closed
  bug(''), bug(null),                                                                   // sem responsável
  bug('Ana', { areaPath: 'USE\\Diretoria' }), bug('Ana', { areaPath: 'USE\\UX - UI' }), // áreas de fora
  bug('Ana', { areaPath: 'OUTRA\\Area' }),                                              // fora da USE
  bug('Ana', { tags: '[ANALISE]; cliente' }), bug('Ana', { tags: ['Analise'] }),        // tag de análise (sem caixa)
  bug('Ana', { title: 'Erro na Análise fiscal' }), bug('Ana', { title: 'ANALISE do log' }), // "análise" no título
  item('Qualquer', { type: 'Issue', state: 'Closed', assignedTo: 'Ana', areaPath: 'USE\\Tatico', createdDate: MAR(3) }), // Issue não
];
const devs = bugsPorDesenvolvedor(porDev, meses);
assert.deepEqual(devs.map(d => [d.dev, d.total]), [['Ana', 3], ['Beto', 3]], 'só os que passam em todas as cláusulas; empate pelo nome');
assert.deepEqual(devs[0].porPeriodo.slice(0, 3).map(l => l.length), [0, 1, 2], 'Ana: 1 em fevereiro e 2 em março, pela data de abertura');

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
assert.equal(dentroDaFaixa(null, { min: 45, max: 50 }), null, 'sem dado não é verde nem vermelho');
assert.deepEqual(faixaDoTime(METAS_PADRAO.fluxo, 'Sustentação'), { min: 50, max: 55 }, 'override da Sustentação');
assert.deepEqual(faixaDoTime(METAS_PADRAO.fluxo, 'Alfa'), { min: 45, max: 50 });
assert.deepEqual(faixaDoTime(METAS_PADRAO.slaP0, 'Sustentação'), { min: 60, max: 70 }, 'SLA P0 só tem meta própria de Sustentação');
assert.deepEqual(faixaDoTime(METAS_PADRAO.bugs, 'Franquia'), { min: 80, max: 100 }, 'override da Franquia/CTC');
assert.deepEqual(faixaDoTime(METAS_PADRAO.retrabalho, 'Franquia'), { min: null, max: null }, 'retrabalho virou contagem: sem meta até a gestão definir');

// Perfil por time: quais métricas cada um acompanha, igual aos blocos da planilha de gestão
assert.deepEqual(metricasDoTime('Sustentacao'), ['fluxo', 'cycle', 'slaP0', 'retrabalho', 'qtdP0'], 'Sustentação não tem Bugs Produção');
assert.deepEqual(metricasDoTime('Franquia'), ['bugs', 'bugsVersao', 'retrabalho', 'qtdP0'], 'Franquia/CTC não tem Fluxo nem Cycle Time');
assert.deepEqual(metricasDoTime('Alfa'), ['fluxo', 'cycle', 'bugs', 'bugsVersao', 'retrabalho', 'qtdP0'], 'time genérico cai no perfil padrão, sem SLA P0');

// itensDaMetrica: a lista por trás do gráfico de barras nunca diverge do número da tabela
const alfaMar = itensDoTime(items, 'Alfa');
const bucketMar = meses[MAR_IDX];
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'fluxo').length, 3, 'fluxo: os 3 itens com tempo de status em março');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'cycle').length, 2, 'cycle: só os 2 itens com cycleTimeBusinessDays numérico (o 3º é null)');
assert.equal(itensDaMetrica(alfaMar, meses[FEV_IDX], 'retrabalho').length, 2, 'retrabalho: os 2 Bugs abertos em fevereiro');
const sust = itensDoTime(items, 'Sustentacao');
assert.equal(itensDaMetrica(sust, meses[FEV_IDX], 'retrabalho').length, 1, 'retrabalho: Bug da Sustentação entra na lista');
assert.equal(itensDaMetrica(sust, bucketMar, 'cycle').length, 1, 'mas o Bug de 999 d continua fora do cycle: o escopo da GetNaves vale nas outras métricas');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'qtdP0').length, 2, 'qtdP0: os 2 P0 concluídos, dentro ou fora do prazo');
assert.equal(itensDaMetrica(alfaMar, bucketMar, 'slaP0').length, 1, 'slaP0: só o P0 concluído em até 7 dias (o de 9 dias fica fora)');
assert.equal(itensDaMetrica(alfaMar, meses[FEV_IDX], 'bugs').length, 2, 'bugs: Issues criadas em fevereiro');

console.log('✅ painelMensal: fluxo, cycle (P85), bugs, retrabalho, P0, semanal, consolidado, faixas, perfil por time e itensDaMetrica OK');
