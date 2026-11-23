// Check do importador da Retrô. Sem framework — `node src/utils/retroParser.check.mjs` (Node 24+ roda .ts direto).
// Fixtures: exportações reais do EasyRetro em docs/retro/fixtures. Os números abaixo foram conferidos célula a
// célula nas planilhas (e batem com o que o protótipo gerou em docs/retro/retro-dados-iniciais.json).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  inferDate, inferTeam, normalizeAiPdf, parseCard, parseCsv, parseRows, pdfHeuristic, readXlsxRows, retroStats, splitMerged,
} from './retroParser.ts';

const fixture = (f) => fileURLToPath(new URL(`../../../docs/retro/fixtures/${f}`, import.meta.url));

// ---- Exportações reais ----
const esperado = {
  'wakanda-1011.xlsx': { title: 'Wakanda  10/11', colunas: 5, cards: 30, votos: 3, comentarios: 3 },
  'ctc-0911.xlsx': { title: 'CTC  09/11', colunas: 5, cards: 20, votos: 1, comentarios: 2 },
  'condado.xlsx': { title: 'Condado', colunas: 4, cards: 9, votos: 2, comentarios: 0 },
  'inovacao-05-11-26.xlsx': { title: 'Inovação 05 11 26', colunas: 5, cards: 8, votos: 0, comentarios: 3 },
};
for (const [f, e] of Object.entries(esperado)) {
  const p = parseRows(await readXlsxRows(await readFile(fixture(f))), f);
  const s = retroStats(p.columns);
  assert.equal(p.title, e.title, `${f}: título`);
  assert.equal(p.columns.length, e.colunas, `${f}: colunas`);
  assert.deepEqual([s.cards, s.votes, s.comments], [e.cards, e.votos, e.comentarios], `${f}: cards/votos/comentários`);
}

const condado = parseRows(await readXlsxRows(await readFile(fixture('condado.xlsx'))));
assert.deepEqual(condado.columns.map(c => c.name), ['Gostei', 'Aprendi', 'Faltou', 'Kudos - Elogios']);
assert.equal(condado.columns[0].description, 'O que eu gostei?');
assert.equal(condado.columns[3].description, '', 'coluna sem Description fica vazia');
assert.ok(condado.columns[0].cards.some(c => c.t.startsWith('Sandrinha ganhando prêmios') && c.v === 1), 'voto removido do texto');

const inov = parseRows(await readXlsxRows(await readFile(fixture('inovacao-05-11-26.xlsx'))));
const pastelaria = inov.columns[2].cards.find(c => c.t.startsWith('Entregas de pastelaria'));
assert.equal(pastelaria.t, 'Entregas de pastelaria, versões que sempre são urgentes', 'comentário sai do texto');
assert.equal(pastelaria.c.length, 1);
assert.ok(pastelaria.c[0].startsWith('vrsão 193 era prioridade'));

const wakanda = parseRows(await readXlsxRows(await readFile(fixture('wakanda-1011.xlsx'))));
const mesclados = wakanda.columns.flatMap(c => c.cards).filter(c => c.t.includes('\n---\n'));
assert.equal(mesclados.length, 2, 'cards mesclados continuam um card só');
assert.ok(mesclados.every(c => splitMerged(c.t).length === 2));

// ---- parseCard (formato de célula) ----
assert.deepEqual(parseCard('Deploy travou (3 votes)'), { t: 'Deploy travou', v: 3, c: [] });
assert.deepEqual(parseCard('Um voto (1 vote)'), { t: 'Um voto', v: 1, c: [] });
assert.deepEqual(parseCard('A   ---   B (2 votes)'), { t: 'A\n---\nB', v: 2, c: [] });
assert.deepEqual(parseCard('Texto\n\n Comments \n  - primeiro\n  - segundo\n'), { t: 'Texto', v: 0, c: ['primeiro', 'segundo'] });

// ---- parseRows sintético: título no nome do arquivo, sem linha de descrição ----
const sint = parseRows([[], ['', ''], ['A', 'B'], ['x (2 votes)', ''], ['', 'y']], 'Board 01-02.xlsx');
assert.equal(sint.title, 'Board 01-02');
assert.deepEqual(sint.columns.map(c => [c.name, c.cards.length]), [['A', 1], ['B', 1]]);

// ---- CSV ----
assert.deepEqual(parseCsv('a;b\n"x; y";"z ""q"""\n'), [['a', 'b'], ['x; y', 'z "q"']]);

// ---- Datas (hoje fixo em 23/11/2026) ----
const hoje = new Date(2026, 10, 23);
assert.equal(inferDate('CTC 09/11', hoje), '2026-11-09');
assert.equal(inferDate('Wakanda 1011', hoje), '2026-11-10');
assert.equal(inferDate('Sustentação 28-10-26', hoje), '2026-10-28');
assert.equal(inferDate('Inovação 05 11 26', hoje), '2026-11-05');
assert.equal(inferDate('Retro 15/03/2025', hoje), '2025-03-15');
assert.equal(inferDate('Retro 20/12', hoje), '2025-12-20', 'sem ano e no futuro → ano anterior');
assert.equal(inferDate('Condado', hoje), '');
assert.equal(inferDate('Sprint 45/13', hoje), '', 'data inválida');
assert.equal(inferDate('Retro 30/02', hoje), '', 'dia que não existe no mês');
assert.equal(inferDate('Retro 31/04/2026', hoje), '');
assert.equal(inferDate('Retro 29/02/2024', hoje), '2024-02-29', 'bissexto vale');

// ---- Times ----
const TIMES = [
  { key: 'Sustentacao', label: 'Sustentação' }, { key: 'Franquia', label: 'CTC', aliases: ['Franquia/CTC'] },
  { key: 'Inovacao_novo', label: 'Inovação', aliases: ['Inovacao'] }, { key: 'Wakanda', label: 'Wakanda' },
  { key: 'Tatico', label: 'Condado', aliases: ['Tático'] },
];
assert.deepEqual(inferTeam('TIAS - SUSTENTAÇÃO 28-10-26', TIMES), { key: 'Sustentacao', label: 'Sustentação' });
assert.deepEqual(inferTeam('CTC  09/11', TIMES), { key: 'Franquia', label: 'CTC' });
assert.deepEqual(inferTeam('Inovação 05 11 26', TIMES), { key: 'Inovacao_novo', label: 'Inovação' });
assert.deepEqual(inferTeam('Condado', TIMES), { key: 'Tatico', label: 'Condado' });
assert.deepEqual(inferTeam('EasyRetro - Boltz 12/11', TIMES), { key: null, label: 'Boltz' }, 'sem match: título sem data');
assert.deepEqual(inferTeam('Doctc review', TIMES), { key: null, label: 'Doctc review' }, 'não casa pedaço de palavra');

// ---- PDF: heurística e normalização da resposta da IA ----
const linhas = [
  { t: 'Retro X', h: 20 }, { t: 'Gerado 10/11', h: 10 }, { t: 'Cards', h: 10 },
  { t: 'O que foi bem', h: 14 }, { t: 'descrição da coluna', h: 10 }, { t: 'card um', h: 10 }, { t: '2', h: 10 },
  { t: 'Melhorar', h: 14 }, { t: 'desc 2', h: 10 }, { t: 'card dois', h: 10 },
];
const h = pdfHeuristic(linhas, 'x.pdf');
assert.equal(h.via, 'estimado');
assert.deepEqual(h.columns.map(c => [c.name, c.description, c.cards.map(k => [k.t, k.v])]),
  [['O que foi bem', 'descrição da coluna', [['card um', 2]]], ['Melhorar', 'desc 2', [['card dois', 0]]]]);
const ia = normalizeAiPdf({ title: 'T', columns: [{ name: '', cards: [{ t: ' a ', v: '3', c: ['x', ''] }, { t: '' }] }] });
assert.deepEqual(ia, { title: 'T', columns: [{ name: 'Coluna 1', description: '', cards: [{ t: 'a', v: 3, c: ['x'] }] }], via: 'ia' });
assert.throws(() => normalizeAiPdf({ columns: [] }));

console.log('retroParser: ok');
