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
  item('Sustentacao', { timeInStatusDays: { Active: 6, 'Aguardando code review': 2 }, cycleTimeBusinessDays: 10 }),
  item('Sustentacao', { timeInStatusDays: { Active: 3, 'Aguardando QA': 3 }, cycleTimeBusinessDays: 40 }),
  // Boltz, março: fluxo 1/4 = 25 (abaixo da faixa 45–50 = vermelho); CT 30 (dentro da faixa 20–34 = verde)
  item('Boltz', { timeInStatusDays: { Active: 1, 'Aguardando QA': 3 }, cycleTimeBusinessDays: 30 }),
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

console.log('✅ painelXlsx: aba única Validado, blocos por time, valores, cores pela meta e fórmulas OK');
