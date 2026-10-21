// Exporta o Painel por Time no layout da aba "Validado" da planilha de gestão: uma aba só, blocos por time
// (dois lado a lado), médias e resumos como fórmulas, e fonte verde/vermelha conforme a meta.
import type { CellValue, Workbook, Worksheet } from 'exceljs';
import type { MetasPainel, MetricKey, PainelMensal } from './painelMensal.ts';
import { dentroDaFaixa, faixaDoTime, normalizarTime, textoFaixa } from './painelMensal.ts';

// Ordem e nomes da planilha. Times fora dela entram depois, em ordem alfabética.
const ORDEM: [string, string][] = [
  ['sustentacao', 'Sustentação'], ['boltz', 'Boltz'], ['estrategico', 'Estratégico'], ['tatico', 'Tático'], ['wakanda', 'Wakanda'],
];
const posicaoTime = (t: string) => {
  const i = ORDEM.findIndex(([k]) => k === normalizarTime(t));
  return i < 0 ? ORDEM.length : i;
};
const ordenarTimes = (times: string[]) =>
  [...times].sort((a, b) => posicaoTime(a) - posicaoTime(b) || a.localeCompare(b, 'pt-BR'));
const nomeTime = (t: string) => ORDEM.find(([k]) => k === normalizarTime(t))?.[1] ?? t;

const FONTE = 'Aptos Narrow';
const VERDE = 'FF008000';
const VERMELHO = 'FFC00000';
const BRANCO = 'FFFFFFFF';
const PRETO = 'FF000000';
const AZUL_CLARO = 'FFD9E1F2';
const AZUL_ESCURO = 'FF1F4E78';
const BORDA = {
  top: { style: 'thin' as const }, left: { style: 'thin' as const },
  bottom: { style: 'thin' as const }, right: { style: 'thin' as const },
};
const letra = (n: number) => {
  let s = '';
  for (let m = n; m > 0; m = Math.floor((m - 1) / 26)) s = String.fromCharCode(65 + ((m - 1) % 26)) + s;
  return s;
};
const media = (valores: (number | null | undefined)[]) => {
  const nums = valores.filter((v): v is number => typeof v === 'number');
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
};
const corDaFaixa = (valor: number | null, faixa: { min: number | null; max: number | null }) => {
  const ok = dentroDaFaixa(valor, faixa);
  return ok === null ? undefined : ok ? VERDE : VERMELHO;
};
// Fórmula de média de um intervalo, ou vazio se a lista não tem células
const formulaMedia = (refs: string[], result: number | null) =>
  refs.length === 0 ? '' : { formula: `IFERROR(AVERAGE(${refs.join(',')}),"")`, result: result ?? '' };

interface Opcoes {
  negrito?: boolean;
  tamanho?: number;
  cor?: string;
  fundo?: string;
  formato?: string;
  alinhar?: 'left' | 'center';
}

function celula(ws: Worksheet, r: number, c: number, valor: unknown, o: Opcoes = {}) {
  const cell = ws.getCell(r, c);
  cell.value = valor as CellValue;
  cell.font = { name: FONTE, size: o.tamanho ?? 11, bold: o.negrito, color: { argb: o.cor ?? PRETO } };
  cell.border = BORDA;
  cell.alignment = { horizontal: o.alinhar ?? 'center', vertical: 'middle' };
  if (o.fundo) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fundo } };
  if (o.formato) cell.numFmt = o.formato;
  return cell;
}

const METRICAS_BLOCO: { key: MetricKey; rotulo: string; formato: string; unidade: string }[] = [
  { key: 'fluxo', rotulo: 'Fluxo Eficiência (%)', formato: '0.00', unidade: ' %' },
  { key: 'cycle', rotulo: 'Cycle Time (Dias)', formato: '0', unidade: '' },
  { key: 'bugs', rotulo: 'Bugs Produção', formato: '0', unidade: '' },
  { key: 'qtdP0', rotulo: 'Quantidade de P0', formato: '0', unidade: '' },
];
// Cada par de blocos ocupa: título + cabeçalho + uma linha por métrica + uma de folga
const LINHAS_POR_PAR = METRICAS_BLOCO.length + 3;

export async function montarPainelXlsx(painel: PainelMensal, metas: MetasPainel): Promise<Workbook> {
  // mod.default funciona no Node (CJS); no navegador o Vite já expõe Workbook direto no módulo
  const mod = await import('exceljs');
  const ExcelJS = (mod.default ?? mod) as unknown as typeof import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DS Metrics';
  wb.created = new Date();
  const ws = wb.addWorksheet('Validado');

  const P = painel.labels.length;
  const times = ordenarTimes(painel.times);
  const COL_ROTULO = 4;                    // D, como na planilha
  const COL_MEDIA_RESUMO = COL_ROTULO + P + 1;
  const LARGURA = P + 3;                   // rótulo + períodos + MÉDIA + META
  const X0 = COL_ROTULO;
  const X1 = X0 + LARGURA + 2;             // duas colunas de folga entre os blocos
  const cabecalho = (r: number, x: number, comMeta: boolean) => {
    celula(ws, r, x, comMeta ? 'Métrica' : 'Time', { negrito: true, fundo: AZUL_CLARO, alinhar: 'left' });
    painel.labels.forEach((lab, i) => celula(ws, r, x + 1 + i, lab, { negrito: true, fundo: AZUL_CLARO }));
    celula(ws, r, x + P + 1, 'MÉDIA', { negrito: true, fundo: AZUL_CLARO });
    if (comMeta) celula(ws, r, x + P + 2, 'META', { negrito: true, fundo: AZUL_CLARO });
  };

  // Resumos do topo: FLUXO EFICIÊNCIA e CYCLE TIME, uma linha por time
  let r = 2;
  const tabelaResumo = (titulo: string, key: 'fluxo' | 'cycle', formato: string) => {
    ws.mergeCells(r, COL_ROTULO, r, COL_MEDIA_RESUMO);
    celula(ws, r, COL_ROTULO, titulo, { negrito: true, tamanho: 14 });
    r += 2;
    cabecalho(r, COL_ROTULO, false);
    r++;
    for (const t of times) {
      const vals = painel.porTime[key][t];
      celula(ws, r, COL_ROTULO, nomeTime(t), { alinhar: 'left' });
      vals.forEach((v, i) => celula(ws, r, COL_ROTULO + 1 + i, v, { formato }));
      const ref = `${letra(COL_ROTULO + 1)}${r}:${letra(COL_ROTULO + P)}${r}`;
      celula(ws, r, COL_MEDIA_RESUMO, formulaMedia([ref], media(vals)), { formato: '0.0' });
      r++;
    }
    r++;
  };
  tabelaResumo('FLUXO EFICIENCIA', 'fluxo', '0.00');
  tabelaResumo('CYCLE TIME', 'cycle', '0');

  // Blocos por time: dois por linha, Sustentação e Boltz na primeira, Estratégico e Tático na segunda, etc.
  const topoGrade = r;
  const posicoes: Record<string, { x: number; top: number }> = {};
  times.forEach((t, i) => {
    const x = i % 2 === 0 ? X0 : X1;
    const top = topoGrade + Math.floor(i / 2) * LINHAS_POR_PAR;
    posicoes[t] = { x, top };
    ws.mergeCells(top, x, top, x + LARGURA - 1);
    celula(ws, top, x, nomeTime(t).toUpperCase(), { negrito: true, tamanho: 14 });
    cabecalho(top + 1, x, true);
    METRICAS_BLOCO.forEach((m, j) => {
      const row = top + 2 + j;
      const faixa = faixaDoTime(metas[m.key], t);
      const vals = painel.porTime[m.key][t];
      celula(ws, row, x, m.rotulo, { alinhar: 'left' });
      vals.forEach((v, k) => celula(ws, row, x + 1 + k, v, { formato: m.formato, cor: corDaFaixa(v, faixa) }));
      const ref = `${letra(x + 1)}${row}:${letra(x + P)}${row}`;
      celula(ws, row, x + P + 1, formulaMedia([ref], media(vals)), { formato: '0.0' });
      celula(ws, row, x + P + 2, textoFaixa(faixa, m.unidade));
    });
  });
  r = topoGrade + Math.ceil(times.length / 2) * LINHAS_POR_PAR;

  // Resumos finais, como na planilha: CT de todos os times, Fluxo sem Sustentação e o resumo dos dois
  const titulo = (texto: string) => {
    ws.mergeCells(r, X0, r, X0 + LARGURA - 1);
    celula(ws, r, X0, texto, { negrito: true, tamanho: 12, cor: BRANCO, fundo: AZUL_ESCURO });
    r++;
    cabecalho(r, X0, false);
    r++;
  };
  const naoSust = times.filter(t => normalizarTime(t) !== 'sustentacao');
  const ehSust = (t: string) => normalizarTime(t) === 'sustentacao';

  // 1) CYCLE TIME — MÉDIA MENSAL (TODOS OS TIMES): cada linha aponta para a célula do bloco do time
  titulo('CYCLE TIME — MÉDIA MENSAL (TODOS OS TIMES)');
  const linhaCTTime: Record<string, number> = {};
  for (const t of times) {
    const { x, top } = posicoes[t];
    linhaCTTime[t] = r;
    celula(ws, r, X0, nomeTime(t), { alinhar: 'left' });
    painel.porTime.cycle[t].forEach((v, i) => {
      celula(ws, r, X0 + 1 + i, { formula: `${letra(x + 1 + i)}${top + 3}`, result: v ?? '' }, { formato: '0' });
    });
    celula(ws, r, X0 + P + 1, formulaMedia([`${letra(X0 + 1)}${r}:${letra(X0 + P)}${r}`], media(painel.porTime.cycle[t])), { formato: '0.0' });
    r++;
  }
  const ctTimes = times.map(t => linhaCTTime[t]);
  celula(ws, r, X0, 'MÉDIA GERAL', { alinhar: 'left', negrito: true });
  painel.mediaTodos.cycle.forEach((v, i) => {
    const col = letra(X0 + 1 + i);
    celula(ws, r, X0 + 1 + i, { formula: `IFERROR(AVERAGE(${ctTimes.map(l => `${col}${l}`).join(',')}),"")`, result: v ?? '' }, { formato: '0.0' });
  });
  celula(ws, r, X0 + P + 1, formulaMedia([`${letra(X0 + 1)}${r}:${letra(X0 + P)}${r}`], media(painel.mediaTodos.cycle)), { formato: '0.0' });
  r++;
  const ctSemSust = r;
  celula(ws, r, X0, 'MÉDIA SEM SUSTENTAÇÃO', { alinhar: 'left', negrito: true });
  const ctNaoSust = times.filter(t => !ehSust(t)).map(t => linhaCTTime[t]);
  painel.mediaSemSustentacao.cycle.forEach((v, i) => {
    const col = letra(X0 + 1 + i);
    celula(ws, r, X0 + 1 + i, ctNaoSust.length
      ? { formula: `IFERROR(AVERAGE(${ctNaoSust.map(l => `${col}${l}`).join(',')}),"")`, result: v ?? '' }
      : '', { formato: '0.0' });
  });
  celula(ws, r, X0 + P + 1, formulaMedia([`${letra(X0 + 1)}${r}:${letra(X0 + P)}${r}`], media(painel.mediaSemSustentacao.cycle)), { formato: '0.0' });
  r += 2;

  // 2) FLUXO EFICIÊNCIA — MÉDIA MENSAL (TIMES, SEM SUSTENTAÇÃO): referências às métricas de Fluxo dos blocos
  titulo('FLUXO EFICIÊNCIA — MÉDIA MENSAL (TIMES, SEM SUSTENTAÇÃO)');
  const linhaFluxoTime: Record<string, number> = {};
  for (const t of naoSust) {
    const { x, top } = posicoes[t];
    linhaFluxoTime[t] = r;
    celula(ws, r, X0, nomeTime(t), { alinhar: 'left' });
    painel.porTime.fluxo[t].forEach((_, i) => {
      celula(ws, r, X0 + 1 + i, { formula: `${letra(x + 1 + i)}${top + 2}`, result: painel.porTime.fluxo[t][i] ?? '' }, { formato: '0.00' });
    });
    celula(ws, r, X0 + P + 1, formulaMedia([`${letra(X0 + 1)}${r}:${letra(X0 + P)}${r}`], media(painel.porTime.fluxo[t])), { formato: '0.0' });
    r++;
  }
  const fluxoSemSust = r;
  const fluxoNaoSust = naoSust.map(t => linhaFluxoTime[t]);
  celula(ws, r, X0, 'MÉDIA SEM SUSTENTAÇÃO', { alinhar: 'left', negrito: true });
  painel.mediaSemSustentacao.fluxo.forEach((v, i) => {
    const col = letra(X0 + 1 + i);
    celula(ws, r, X0 + 1 + i, fluxoNaoSust.length
      ? { formula: `IFERROR(AVERAGE(${fluxoNaoSust.map(l => `${col}${l}`).join(',')}),"")`, result: v ?? '' }
      : '', { formato: '0.00' });
  });
  celula(ws, r, X0 + P + 1, formulaMedia([`${letra(X0 + 1)}${r}:${letra(X0 + P)}${r}`], media(painel.mediaSemSustentacao.fluxo)), { formato: '0.0' });
  r += 2;

  // 3) RESUMO — MÉDIA MENSAL DOS TIMES (SEM SUSTENTAÇÃO): CT e Fluxo das linhas de média acima
  titulo('RESUMO — MÉDIA MENSAL DOS TIMES (SEM SUSTENTAÇÃO)');
  celula(ws, r, X0, 'Cycle Time (Dias)', { alinhar: 'left' });
  painel.mediaSemSustentacao.cycle.forEach((v, i) => {
    const col = letra(X0 + 1 + i);
    celula(ws, r, X0 + 1 + i, ctNaoSust.length ? { formula: `${col}${ctSemSust}`, result: v ?? '' } : '', { formato: '0' });
  });
  r++;
  celula(ws, r, X0, 'Fluxo Eficiência (%)', { alinhar: 'left' });
  painel.mediaSemSustentacao.fluxo.forEach((v, i) => {
    const col = letra(X0 + 1 + i);
    celula(ws, r, X0 + 1 + i, fluxoNaoSust.length ? { formula: `${col}${fluxoSemSust}`, result: v ?? '' } : '', { formato: '0.00' });
  });
  r++;

  // Larguras: rótulos largos, períodos estreitos, META com espaço para o texto da faixa
  for (let c = 1; c <= X1 + LARGURA; c++) ws.getColumn(c).width = 11;
  [X0, X1].forEach(c => { ws.getColumn(c).width = 26; });
  [X0 + P + 2, X1 + P + 2].forEach(c => { ws.getColumn(c).width = 22; });
  return wb;
}

// Baixa o workbook pelo mesmo caminho de exportSheetsXlsx (Blob + link temporário)
export async function baixarXlsx(wb: Workbook, filename: string): Promise<void> {
  if (typeof (globalThis as Record<string, unknown>).Buffer === 'undefined') {
    const { Buffer: Buf } = await import('buffer');
    (globalThis as Record<string, unknown>).Buffer = Buf;
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
