// Importador de retrospectivas exportadas do EasyRetro (aba Retrô). Port do protótipo
// docs/retro/referencia-retro-em-acao.html (parseRows/parseCard/inferDate/inferTeam/pdfHeuristic).
// Funções puras — o check (retroParser.check.mjs) roda em Node contra as exportações reais em docs/retro/fixtures.
import type { Workbook } from 'exceljs';

export interface RetroCard { t: string; v: number; c: string[]; img?: string[] }
export interface RetroColumn { name: string; description: string; cards: RetroCard[] }
export interface ParsedRetro { title: string; columns: RetroColumn[]; via?: 'planilha' | 'ia' | 'estimado'; truncated?: boolean }
export const PDF_AI_MAX_CHARS = 30000; // o backend corta o texto do PDF nesse tamanho antes de mandar pra IA
export interface RetroTeamOption { key: string; label: string; aliases?: string[] }

export const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const todayStr = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Um card do EasyRetro numa célula: "texto (N votes)   Comments    - c1   - c2". Cards mesclados vêm com " --- ".
export function parseCard(raw: unknown): RetroCard {
  let text = String(raw ?? '').replace(/\r/g, '');
  let comments: string[] = [];
  let votes = 0;
  const ci = text.search(/\s+Comments\s+-\s/);
  if (ci >= 0) {
    const ctext = text.slice(ci).replace(/^\s+Comments\s+/, '');
    text = text.slice(0, ci);
    comments = ctext.split(/(?:^|\s{2,})-\s+/).map(s => s.trim()).filter(Boolean);
  }
  const vm = text.match(/\s*\((\d+) votes?\)\s*$/i);
  if (vm) { votes = +vm[1]; text = text.slice(0, vm.index); }
  text = text.replace(/\s+---\s+/g, '\n---\n').trim();
  return { t: text, v: votes, c: comments };
}

// Linha 1 = título; primeira linha seguinte com 2+ células = nomes das colunas; linha opcional "Description:";
// daí pra baixo cada célula não vazia é um card da coluna correspondente.
export function parseRows(input: unknown[][], filename = ''): ParsedRetro {
  const rows = (input || []).map(r => (Array.isArray(r) ? r : []).map(c => (c == null ? '' : String(c))));
  const title = ((rows[0] || []).find(c => c.trim()) || filename.replace(/\.[^.]+$/, '')).trim();
  let hi = rows.findIndex((r, i) => i > 0 && r.filter(c => c.trim()).length >= 2);
  if (hi < 0) hi = rows.length > 1 ? 1 : 0;
  const headers = rows[hi] || [];
  let start = hi + 1;
  let descs: string[] = [];
  if (rows[start] && rows[start].some(c => /^\s*Description:/i.test(c))) {
    descs = rows[start].map(c => c.replace(/^\s*Description:\s*/i, '').trim());
    start++;
  }
  const width = Math.max(headers.length, ...rows.slice(start).map(r => r.length), 0);
  const cols: RetroColumn[] = Array.from({ length: width }, (_, i) => ({ name: (headers[i] || '').trim(), description: descs[i] || '', cards: [] }));
  for (const r of rows.slice(start)) r.forEach((cell, i) => { if (cell.trim()) cols[i].cards.push(parseCard(cell)); });
  const columns = cols.filter(c => c.name || c.cards.length).map((c, i) => ({ ...c, name: c.name || `Coluna ${i + 1}` }));
  return { title, columns, via: 'planilha' };
}

export function retroStats(columns: RetroColumn[]) {
  const cards = columns.flatMap(c => c.cards);
  return {
    cards: cards.length,
    votes: cards.reduce((s, c) => s + (c.v || 0), 0),
    comments: cards.reduce((s, c) => s + (c.c?.length || 0), 0),
  };
}

// Partes de um card mesclado (exibidas com um divisor entre elas).
export const splitMerged = (t: string) => String(t || '').split(/\n?\s*-{3}\s*\n?/).map(s => s.trim()).filter(Boolean);

// Link colado de um GIF da GIPHY → URL da imagem (Retrô ao vivo). Aceita a página do GIF (giphy.com/gifs/nome-ID,
// /stickers/, /embed/) ou o link direto (media*.giphy.com, i.giphy.com). Qualquer outro site: null.
export function giphyMediaUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (/^(media\d*|i)\.giphy\.com$/.test(u.hostname)) return u.toString();
  if (u.hostname !== 'giphy.com' && u.hostname !== 'www.giphy.com') return null;
  const m = u.pathname.match(/^\/(?:gifs|stickers|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{5,})\/?$/);
  return m ? `https://media.giphy.com/media/${m[1]}/giphy.gif` : null;
}

const DATE_RE = /(?<!\d)(\d{2})[\/\-_. ]?(\d{2})(?:[\/\-_. ](\d{2,4}))?(?!\d)/;

// dd/mm, ddmm, dd-mm-aa, dd mm aa, dd/mm/aaaa. Sem ano = ano atual; se cair no futuro, ano anterior.
export function inferDate(str: unknown, now = new Date()): string {
  const m = String(str ?? '').match(DATE_RE);
  if (!m) return '';
  const d = +m[1], mo = +m[2];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';
  let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!m[3] && iso(y) > todayStr(now)) y--;
  // 30/02, 31/04…: dia que não existe naquele mês não é data (o banco recusaria).
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return iso(y);
}

// Time citado no título (pelo nome de exibição, pela chave ou por um apelido). Sem match: título sem a data.
export function inferTeam(title: unknown, teams: RetroTeamOption[]): { key: string | null; label: string } {
  const t = norm(title);
  for (const team of teams) {
    const names = [team.label, team.key, ...(team.aliases || [])].map(norm).filter(n => n.length >= 3);
    if (names.some(n => new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t))) {
      return { key: team.key, label: team.label };
    }
  }
  const s = String(title ?? '').replace(DATE_RE, '').replace(/easyretro/i, '')
    .replace(/[\s\-_–|:]+$/, '').replace(/^[\s\-_–|:]+/, '').trim();
  return { key: null, label: s || 'Sem time' };
}

// ---- Leitura de arquivos ----

// Planilha → linhas de texto (equivalente ao sheet_to_json(header:1, raw:false, blankrows:true) do SheetJS).
export async function readXlsxRows(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const mod = await import('exceljs');
  const ExcelJS = (mod.default ?? mod) as unknown as typeof import('exceljs');
  const wb: Workbook = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const out: string[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) out.push(row.getCell(c).text ?? '');
    while (out.length && !out[out.length - 1]) out.pop();
    rows.push(out);
  }
  return rows;
}

// CSV simples (aspas duplas com escape ""), separador , ou ; detectado na primeira linha.
export function parseCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---- PDF ----
export interface PdfLine { t: string; h: number }

// Agrupa os itens de texto do pdf.js em linhas (mesmo y ±2), com a altura de fonte da linha.
export function pdfItemsToLines(items: { str: string; transform: number[]; width?: number }[]): PdfLine[] {
  const rows: { y: number; items: { x: number; s: string; w: number; h: number }[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]);
    let row = rows.find(r => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, s: it.str, w: it.width || 0, h });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.items.sort((a, b) => a.x - b.x);
    let t = '', end = -Infinity;
    for (const it of r.items) {
      if (t && it.x - end > 1 && !t.endsWith(' ') && !it.s.startsWith(' ')) t += ' ';
      t += it.s; end = it.x + it.w;
    }
    return { t: t.trim(), h: Math.round(Math.max(...r.items.map(i => i.h)) * 10) / 10 };
  }).filter(l => l.t);
}

// Sem IA: linha com fonte maior = nome de coluna, a seguinte = descrição; número solto = votos do card anterior.
// ponytail: não junta cards de várias linhas nem detecta comentários — por isso o resultado é marcado "estimado".
export function pdfHeuristic(lines: PdfLine[], filename = ''): ParsedRetro {
  const L = lines.filter(l => !/^Gerado\s/i.test(l.t) && !/^Easy\s?Retro$/i.test(l.t));
  const title = (L[0] && L[0].t) || filename;
  const ci = L.findIndex(l => l.t === 'Cards');
  const body = L.slice(ci >= 0 ? ci + 1 : 1);
  const hs = body.map(l => l.h).sort((a, b) => a - b);
  const med = hs[Math.floor(hs.length / 2)] || 10;
  const cols: RetroColumn[] = [];
  let cur: RetroColumn | null = null, expectDesc = false;
  for (const l of body) {
    if (l.h > med * 1.18 && l.t.length < 70) {
      cur = { name: l.t.replace(/^[^\p{L}\p{N}]+/u, '').trim(), description: '', cards: [] };
      cols.push(cur); expectDesc = true; continue;
    }
    if (!cur) { cur = { name: 'Cards', description: '', cards: [] }; cols.push(cur); }
    if (/^\d{1,3}$/.test(l.t)) { const last = cur.cards[cur.cards.length - 1]; if (last) last.v = Math.max(last.v, +l.t); continue; }
    if (expectDesc) { cur.description = l.t; expectDesc = false; continue; }
    cur.cards.push({ t: l.t, v: 0, c: [] });
  }
  return { title, columns: cols.filter(c => c.cards.length || c.name), via: 'estimado' };
}

// Normaliza a resposta da IA ao prompt A.1 (estruturar PDF). Lança se não houver colunas.
export function normalizeAiPdf(res: unknown, filename = ''): ParsedRetro {
  const r = (res && typeof res === 'object' ? res : {}) as { title?: unknown; columns?: unknown };
  if (!Array.isArray(r.columns) || !r.columns.length) throw new Error('A IA não encontrou colunas no PDF');
  const columns = (r.columns as Record<string, unknown>[]).map((c, i) => ({
    name: String(c?.name || '').trim() || `Coluna ${i + 1}`,
    description: String(c?.description || '').trim(),
    cards: (Array.isArray(c?.cards) ? c.cards as Record<string, unknown>[] : [])
      .map(k => ({ t: String(k?.t || '').trim(), v: Math.max(0, parseInt(String(k?.v)) || 0), c: (Array.isArray(k?.c) ? k.c : []).map(String).map(s => s.trim()).filter(Boolean) }))
      .filter(k => k.t),
  }));
  return { title: String(r.title || '').trim() || filename.replace(/\.[^.]+$/, ''), columns, via: 'ia' };
}
