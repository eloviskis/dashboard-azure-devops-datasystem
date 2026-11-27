// Check da exportação do Painel por Time. Sem framework — `node painelXlsx.check.mjs`.
// Gera o xlsx em memória, lê de volta e confere layout, valores, cores pela meta e fórmulas.
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildPainelMensal, METAS_PADRAO } from './painelMensal.ts';
import { getPeriodBuckets } from './periodGrouping.ts';
import { montarPainelXlsx } from './painelXlsx.ts';

const MAR = (dia) => `2026-03-${String(dia).padStart(2, '0')}T12:00:00Z`;
const item = (team, extra = {}) => ({
  workItemId: Math.random(), title: 't', type: 'Issue', state: 'Closed', team,
  closedDate: MAR(10), createdDate: MAR(1), priority: '2', ...extra,
});
const items = [
  // Sustentação, março: fluxo (6/8 = 75 e 3/6 = 50) → média 62,5 (acima da faixa 50–55 = vermelho); CT P85 de [10, 40] = 40
  item('Sustentacao', { timeInStatusDays: { Active: 6, 'Aguardando code review': 2 }, cicloDias: 10 }),
  item('Sustentacao', { timeInStatusDays: { Active: 3, 'Aguardando QA': 3 }, cicloDias: 40 }),
  // Boltz, março: fluxo 1/4 = 25 (abaixo da faixa 45–50 = vermelho); CT 30 (dentro da faixa 20–34 = verde)
  // (Correção vinda de cliente: conta em Bugs Produção pelo critério da gestão; as da Sustentação acima não)
  item('Boltz', { timeInStatusDays: { Active: 1, 'Aguardando QA': 3 }, cicloDias: 30, baseVersion: '3.71.0.5', customType: 'Correção', tipoCliente: '5 - SLA LIGHT' }),
  // Bugs internos de março (Índice Retrabalho): 1 da Boltz, 2 da Sustentação. Fora do escopo de Fluxo/CT.
  item('Boltz', { type: 'Bug', createdDate: MAR(5) }),
  item('Sustentacao', { type: 'Bug', createdDate: MAR(6) }), item('Sustentacao', { type: 'Bug', createdDate: MAR(7) }),
];
const meses = getPeriodBuckets(new Date(2026, 0, 1), new Date(2026, 2, 31), 'monthly');
const p = buildPainelMensal(items, meses);
const MAR_IDX = 2;
const P = meses.length;

const wb = await montarPainelXlsx(p, METAS_PADRAO);
const buf = await wb.xlsx.writeBuffer();
const lido = new ExcelJS.Workbook();
await lido.xlsx.load(buf);
const ws = lido.worksheets[0];

// Layout: uma aba só, chamada Validado
assert.equal(lido.worksheets.length, 1, 'uma aba só');
assert.equal(ws.name, 'Validado');

const achar = (texto, col = 4) => {
  let achado = null;
  ws.eachRow((row, n) => { if (achado === null && row.getCell(col).value === texto) achado = n; });
  assert.notEqual(achado, null, `célula "${texto}" não encontrada na coluna ${col}`);
  return achado;
};
const cor = (r, c) => ws.getCell(r, c).font.color.argb;

// Blocos por time: Sustentação na primeira coluna, Boltz na segunda (2 colunas de folga após o bloco)
const LARGURA = P + 3;
const topSust = achar('SUSTENTAÇÃO');
const xSust = 4;
const topBoltz = achar('BOLTZ', 4 + LARGURA + 2);
assert.equal(topBoltz, topSust, 'Boltz na mesma faixa de linhas, à direita');
const xBoltz = 4 + LARGURA + 2;

// Valores: a célula do período de março é o valor do Painel
assert.equal(ws.getCell(topSust + 2, xSust + 1 + MAR_IDX).value, p.porTime.fluxo.Sustentacao[MAR_IDX], 'fluxo Sustentação março');
assert.equal(ws.getCell(topBoltz + 2, xBoltz + 1 + MAR_IDX).value, p.porTime.fluxo.Boltz[MAR_IDX], 'fluxo Boltz março');
assert.equal(ws.getCell(topBoltz + 3, xBoltz + 1 + MAR_IDX).value, 30, 'CT Boltz março');

// Bugs Produção com versão: linha logo abaixo de Bugs Produção (fluxo, cycle, bugs, com versão)
assert.equal(ws.getCell(topBoltz + 5, xBoltz).value, 'Bugs Produção com versão', 'rótulo da linha nova');
assert.equal(ws.getCell(topBoltz + 5, xBoltz + 1 + MAR_IDX).value, 1, 'a Issue da Boltz com Base Version');
// Índice Retrabalho: logo abaixo de "com versão" (Boltz) e logo abaixo de Cycle Time na Sustentação (sem Bugs Produção)
assert.equal(ws.getCell(topBoltz + 6, xBoltz).value, 'Índice Retrabalho');
assert.equal(ws.getCell(topBoltz + 6, xBoltz + 1 + MAR_IDX).value, 1, 'o Bug da Boltz de março');
assert.equal(ws.getCell(topBoltz + 6, xBoltz + P + 2).value, 'sem meta');
assert.equal(ws.getCell(topSust + 4, xSust).value, 'Índice Retrabalho');
assert.equal(ws.getCell(topSust + 4, xSust + 1 + MAR_IDX).value, 2, 'os 2 Bugs da Sustentação de março');
assert.equal(ws.getCell(topBoltz + 7, xBoltz).value, 'Quantidade de P0', 'P0 desce mais uma linha');

// Cores pela meta: fora = vermelho, dentro = verde
assert.equal(cor(topSust + 2, xSust + 1 + MAR_IDX), 'FFC00000', 'fluxo 62,5 está acima da faixa 50–55: vermelho');
assert.equal(cor(topBoltz + 2, xBoltz + 1 + MAR_IDX), 'FFC00000', 'fluxo 25 está abaixo da faixa 45–50: vermelho');
assert.equal(cor(topBoltz + 3, xBoltz + 1 + MAR_IDX), 'FF008000', 'CT 30 está dentro da faixa 20–34: verde');

// Médias são fórmulas com resultado já calculado
const mediaSust = ws.getCell(topSust + 2, xSust + P + 1).value;
assert.ok(mediaSust.formula.startsWith('IFERROR(AVERAGE('), 'média é fórmula');
assert.equal(mediaSust.result, p.porTime.fluxo.Sustentacao[MAR_IDX], 'média de um único mês = o próprio valor');

// Resumo "MÉDIA SEM SUSTENTAÇÃO" (CT): só Boltz entra → 30
const linhaSemSust = achar('MÉDIA SEM SUSTENTAÇÃO');
assert.equal(ws.getCell(linhaSemSust, 4 + 1 + MAR_IDX).value.result, p.mediaSemSustentacao.cycle[MAR_IDX], 'média sem Sustentação = Boltz');
assert.equal(p.mediaSemSustentacao.cycle[MAR_IDX], 30);

// "MÉDIA GERAL" (CT): média dos times = (40 + 30) / 2 = 35
const linhaGeral = achar('MÉDIA GERAL');
assert.equal(ws.getCell(linhaGeral, 4 + 1 + MAR_IDX).value.result, 35, 'média geral de CT em março');

// Cabeçalho com os períodos e a coluna META
const linhaCab = topSust + 1;
assert.equal(ws.getCell(linhaCab, 4 + 1 + MAR_IDX).value, p.labels[MAR_IDX], 'cabeçalho com o rótulo do período');
assert.equal(ws.getCell(linhaCab, 4 + P + 2).value, 'META', 'coluna META');
assert.equal(ws.getCell(topSust + 2, 4 + P + 2).value, 'entre 50 e 55 %', 'meta da Sustentação vem da faixa do time');

// Índice do Departamento: Issues de março = 2 da Sustentação + 1 da Boltz (os Bugs não entram); total é SUM das linhas
const linhaDepto = achar('DEPARTAMENTO DE ENGENHARIA');
const totalDepto = ws.getCell(linhaDepto, 4 + 1 + MAR_IDX).value;
assert.match(totalDepto.formula, /^SUM\(/, 'total do departamento é fórmula SUM');
assert.equal(totalDepto.result, 3, '2 Issues da Sustentação + 1 da Boltz em março');
assert.equal(totalDepto.result, p.departamento.total[MAR_IDX]);
// Logo abaixo do total, o critério da gestão: só a Issue de Correção vinda de cliente (a da Boltz)
assert.equal(ws.getCell(linhaDepto + 1, 4).value, 'BUGS — CRITÉRIO DA GESTÃO');
assert.equal(ws.getCell(linhaDepto + 1, 4 + 1 + MAR_IDX).value, 1, 'só a Correção de cliente da Boltz');
// 5 linhas de time acima do total, na ordem de TIMES_PADRAO_PAINEL (Sustentação primeiro)
assert.equal(ws.getCell(linhaDepto - 5, 4).value, 'Sustentação');
assert.equal(ws.getCell(linhaDepto - 5, 4 + 1 + MAR_IDX).value, 2, 'linha da Sustentação no índice do departamento');

// Times do departamento escolhidos na tela: só a Boltz → uma linha de time e total 1 (a soma segue a escolha)
const lerAba = async (w) => { const l = new ExcelJS.Workbook(); await l.xlsx.load(await w.xlsx.writeBuffer()); return l.worksheets[0]; };
const ws2 = await lerAba(await montarPainelXlsx(p, METAS_PADRAO, ['Boltz']));
let linha2 = null;
ws2.eachRow((row, n) => { if (row.getCell(4).value === 'DEPARTAMENTO DE ENGENHARIA') linha2 = n; });
assert.equal(ws2.getCell(linha2 - 1, 4).value, 'Boltz', 'só a linha da Boltz acima do total');
assert.equal(ws2.getCell(linha2, 4 + 1 + MAR_IDX).value.result, 1, 'total = só a Issue da Boltz');
// Nenhum time escolhido: total 0, sem fórmula de intervalo vazio
const ws3 = await lerAba(await montarPainelXlsx(p, METAS_PADRAO, []));
let linha3 = null;
ws3.eachRow((row, n) => { if (row.getCell(4).value === 'DEPARTAMENTO DE ENGENHARIA') linha3 = n; });
assert.equal(ws3.getCell(linha3, 4 + 1 + MAR_IDX).value, 0);
assert.equal(ws3.getCell(linha3 + 1, 4 + 1 + MAR_IDX).value, 0, 'critério da gestão também segue a escolha de times');

// Meta do departamento: padrão "sem meta" e fonte preta; com meta, verde/vermelho e o texto na coluna META
assert.equal(ws.getCell(linhaDepto, 4 + P + 2).value, 'sem meta');
assert.equal(ws.getCell(linhaDepto + 1, 4 + P + 2).value, '≤ 100', 'meta padrão do critério da gestão');
assert.equal(cor(linhaDepto + 1, 4 + 1 + MAR_IDX), 'FF008000', '1 bug, até 100: verde');
assert.equal(cor(linhaDepto, 4 + 1 + MAR_IDX), 'FF000000', 'sem meta não pinta de verde');
const metasDepto = { ...METAS_PADRAO, departamento: { ...METAS_PADRAO.departamento, max: 2 }, departamentoGestao: { ...METAS_PADRAO.departamentoGestao, min: null, max: 5 } };
const ws4 = await lerAba(await montarPainelXlsx(p, metasDepto));
let linha4 = null;
ws4.eachRow((row, n) => { if (row.getCell(4).value === 'DEPARTAMENTO DE ENGENHARIA') linha4 = n; });
assert.equal(ws4.getCell(linha4, 4 + 1 + MAR_IDX).font.color.argb, 'FFC00000', 'total 3 acima do máximo 2: vermelho');
assert.equal(ws4.getCell(linha4 + 1, 4 + 1 + MAR_IDX).font.color.argb, 'FF008000', 'critério da gestão 1 até 5: verde');
assert.equal(ws4.getCell(linha4, 4 + P + 2).value, '≤ 2');
assert.equal(ws4.getCell(linha4 - 6, 4 + P + 2).value, 'META', 'cabeçalho META no bloco do departamento');

console.log('✅ painelXlsx: aba única Validado, blocos por time, valores, cores pela meta, fórmulas e índice do departamento (com escolha de times e meta) OK');
