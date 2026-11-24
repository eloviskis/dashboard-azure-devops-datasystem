// backend/services/retroBoardRules.js
// Regras puras da Retrô ao vivo (quadro conduzido dentro do DSMetrics): modelos, o que cada participante vê
// (cards ocultos e anonimato decididos aqui, nunca só na tela), voto, grupo → formato da retro e imagens.
// Sem I/O — testado em retroBoardRules.check.js.

const TEMPLATES = [
  {
    id: 'tias', name: 'Tias', columns: [
      { name: 'Tia Calma', description: 'Ações e atitudes que nos deram segurança e que nos acalmaram por ver e saber que fizemos tal ação.' },
      { name: 'Tia Legra', description: 'Tia que celebra algo que fizemos tão bem, mas tão bem, que devemos exaltar.' },
      { name: 'Tia Flige', description: 'Coisas que não foram bem na sprint, que nos entristeceram, que não deveríamos repetir.' },
      { name: 'Tia Nima', description: 'Planos de ação a respeito das coisas que a Tia Flige relatou.' },
      { name: 'Tia Fasta', description: 'Coisas tão problemáticas que não devem mais acontecer!' },
    ],
  },
  {
    id: 'quebra-cabeca', name: 'Quebra-cabeça', columns: [
      { name: 'Peças que encaixaram', description: 'O que funcionou muito bem nesse ciclo?' },
      { name: 'Peças que ainda não encontramos', description: 'O que ainda está nos causando dificuldade?' },
      { name: 'Peças que podemos construir', description: 'O que podemos melhorar juntos?' },
      { name: 'Peça surpresa', description: 'Qual foi a maior surpresa deste ciclo?' },
      { name: 'Peças que alguém entregou', description: 'Aqui cada pessoa escreve uma peça que outro colega colocou no quebra-cabeça.' },
    ],
  },
  {
    id: 'classica', name: 'Clássica', columns: [
      { name: 'O que foi bem', description: '' },
      { name: 'O que pode melhorar', description: '' },
      { name: 'Ideias de ação', description: '' },
    ],
  },
];

const s = (v, max) => String(v ?? '').trim().slice(0, max);

function cleanBoardColumns(cols) {
  if (!Array.isArray(cols) || !cols.length) return { error: 'A retro precisa de pelo menos uma coluna' };
  if (cols.length > 10) return { error: 'No máximo 10 colunas' };
  return { columns: cols.map((c, i) => ({ name: s(c?.name, 80) || `Coluna ${i + 1}`, description: s(c?.description, 300) })) };
}

// anonymous e hideUntilReveal só valem na criação: ligar o nome depois exporia quem escreveu achando que era anônimo.
function cleanSettings(input = {}, prev = null) {
  const n = parseInt(input.votesPerPerson, 10);
  const votesPerPerson = Number.isInteger(n) && n >= 0 && n <= 20 ? n : (prev ? prev.votesPerPerson : 3);
  return {
    anonymous: prev ? prev.anonymous : input.anonymous !== false,
    hideUntilReveal: prev ? prev.hideUntilReveal : input.hideUntilReveal !== false,
    votesPerPerson,
    votingOpen: typeof input.votingOpen === 'boolean' ? input.votingOpen : (prev ? prev.votingOpen : true),
  };
}

const isVisible = (card, board, meId) => card.participant_id === meId || !board.settings.hideUntilReveal || board.revealed;

// Grupo = card raiz + os que foram agrupados nele (parent_id aponta sempre pra raiz).
const groupOf = (root, cards) => [root, ...cards.filter(k => k.parent_id === root.id)];

// O que o participante meId recebe. Card oculto vai só com id e coluna; com quadro anônimo, nome nenhum sai.
function viewFor({ board, cards, votes, comments, participants, meId }) {
  const anon = !!board.settings.anonymous;
  const nameOf = (id) => participants.find(p => p.id === id)?.name || 'Anônimo';
  const author = (pid) => (anon ? null : nameOf(pid));
  const out = cards.filter(c => !c.parent_id).map(root => {
    const group = groupOf(root, cards).filter(k => isVisible(k, board, meId));
    if (!isVisible(root, board, meId)) return { id: root.id, col: root.col, hidden: true };
    const ids = group.map(k => k.id);
    const gv = votes.filter(v => ids.includes(v.card_id));
    return {
      id: root.id, col: root.col, hidden: false,
      items: group.map(k => ({ id: k.id, text: k.text, images: k.images || [], author: author(k.participant_id), mine: k.participant_id === meId })),
      votes: gv.length, myVote: gv.some(v => v.participant_id === meId),
      comments: comments.filter(m => ids.includes(m.card_id))
        .map(m => ({ id: m.id, text: m.text, author: author(m.participant_id), mine: m.participant_id === meId })),
    };
  });
  const used = votes.filter(v => v.participant_id === meId).length;
  const limit = board.settings.votesPerPerson || 0;
  return {
    title: board.title, date: board.date, status: board.status, columns: board.columns, settings: board.settings,
    revealed: board.revealed, timerEndsAt: board.timer_ends_at, participants: participants.length,
    me: { id: meId, name: nameOf(meId), votesUsed: used, votesLeft: limit ? Math.max(0, limit - used) : null },
    cards: out,
  };
}

// null = pode votar. used = votos do participante no quadro todo; already = já votou em algum card do grupo.
function voteError({ board, visible, used, already }) {
  if (board.status !== 'aberta') return 'Esta retro já foi encerrada';
  if (!board.settings.votingOpen) return 'A votação está fechada';
  if (!visible) return 'Card não encontrado';
  if (already) return 'Você já votou neste card';
  const limit = board.settings.votesPerPerson || 0;
  if (limit && used >= limit) return `Você já usou seus ${limit} votos`;
  return null;
}

// Quadro encerrado → colunas no formato da importação ({t, v, c}). Grupo vira um card com os textos separados por
// "---", igual ao export do EasyRetro (o parser e a IA já entendem). Card só com imagem vai como "(imagem)".
function toRetroColumns({ board, cards, votes, comments }) {
  const byTime = (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id;
  return board.columns.map((col, i) => ({
    name: col.name, description: col.description || '',
    cards: cards.filter(c => !c.parent_id && c.col === i).sort(byTime).map(root => {
      const group = groupOf(root, cards).sort((a, b) => (a.id === root.id ? -1 : b.id === root.id ? 1 : byTime(a, b)));
      const ids = group.map(k => k.id);
      const img = group.flatMap(k => k.images || []);
      return {
        t: group.map(k => String(k.text || '').trim() || (k.images?.length ? '(imagem)' : '')).filter(Boolean).join('\n---\n'),
        v: votes.filter(v => ids.includes(v.card_id)).length,
        c: comments.filter(m => ids.includes(m.card_id)).sort(byTime).map(m => m.text),
        ...(img.length ? { img } : {}),
      };
    }).filter(k => k.t),
  }));
}

// Tipo da imagem pelos primeiros bytes (o Content-Type do upload vem do navegador e não é confiável). SVG fica de
// fora de propósito: é XML e pode carregar script.
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  const hex = buf.subarray(0, 8).toString('hex');
  if (hex === '89504e470d0a1a0a') return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  const ascii = buf.subarray(0, 12).toString('latin1');
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Imagens de card: as enviadas pro próprio DSMetrics ou GIFs da KLIPY/GIPHY. Qualquer outra URL fica de fora
// (pixel de rastreio, conteúdo arbitrário de terceiros).
const IMG_OWN = /^\/api\/retro-board\/img\/[0-9a-f-]{36}$/;
const IMG_GIPHY = /^https:\/\/(media\d*|i)\.giphy\.com\/[^\s"'<>\\]+$/;
const IMG_KLIPY = /^https:\/\/([a-z0-9-]+\.)*klipy\.com\/[^\s"'<>\\]+$/;
const isAllowedImageUrl = (u) => typeof u === 'string' && u.length <= 500 && (IMG_OWN.test(u) || IMG_GIPHY.test(u) || IMG_KLIPY.test(u));
const cleanImages = (list, max = 4) => (Array.isArray(list) ? list : []).filter(isAllowedImageUrl).slice(0, max);

// ---- busca de GIFs: resposta de cada provedor → [{src, preview, title}] + se tem próxima página.
const pickUrl = (file, sizes, formats) => {
  for (const sz of sizes) for (const f of formats) { const u = file?.[sz]?.[f]?.url; if (u) return u; }
  return null;
};
const okGif = (g) => isAllowedImageUrl(g.src) && isAllowedImageUrl(g.preview);

// KLIPY: { data: { data: [...], has_next } }, cada item com file.{hd,md,sm,xs}.{gif,webp,jpg}.url.
// Anúncio (type "ad" ou sem arquivo de GIF) fica de fora: o card guarda a URL e ela precisa ser um GIF.
function parseKlipy(json) {
  const list = Array.isArray(json?.data?.data) ? json.data.data : Array.isArray(json?.data) ? json.data : [];
  const items = list.filter(it => it && it.type !== 'ad').map(it => ({
    src: pickUrl(it.file, ['md', 'hd', 'sm'], ['gif']),
    preview: pickUrl(it.file, ['sm', 'xs', 'md'], ['gif', 'webp']),
    title: s(it.title, 100),
  })).filter(okGif);
  return { items, hasNext: !!json?.data?.has_next };
}

// GIPHY: { data: [...], pagination: { total_count, count, offset } }.
function parseGiphy(json) {
  const items = (Array.isArray(json?.data) ? json.data : []).map(g => ({
    src: g.images?.downsized_medium?.url || g.images?.fixed_height?.url,
    preview: g.images?.fixed_width?.url || g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
    title: s(g.title, 100),
  })).filter(okGif);
  const p = json?.pagination || {};
  return { items, hasNext: (p.offset || 0) + (p.count || 0) < (p.total_count || 0) };
}

module.exports = {
  TEMPLATES, cleanBoardColumns, cleanSettings, isVisible, viewFor, voteError, toRetroColumns, sniffImage, isAllowedImageUrl, cleanImages,
  parseKlipy, parseGiphy,
};
