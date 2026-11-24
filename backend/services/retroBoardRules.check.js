// Check das regras da Retrô ao vivo. Sem framework — `node services/retroBoardRules.check.js`.
const assert = require('node:assert/strict');
const B = require('./retroBoardRules');

const board = (over = {}) => ({
  title: 'Retro', date: '2026-11-24', status: 'aberta', revealed: false, timer_ends_at: null,
  columns: [{ name: 'Bom', description: '' }, { name: 'Ruim', description: 'x' }],
  settings: { anonymous: true, hideUntilReveal: true, votesPerPerson: 2, votingOpen: true }, ...over,
});
const people = [{ id: 1, name: 'Ana' }, { id: 2, name: 'Beto' }];
const cards = [
  { id: 10, col: 0, participant_id: 1, text: 'deploy rápido', images: [], parent_id: null, created_at: '2026-11-24T10:00:00Z' },
  { id: 11, col: 0, participant_id: 2, text: 'deploy ágil', images: ['/api/retro-board/img/00000000-0000-0000-0000-000000000000'], parent_id: 10, created_at: '2026-11-24T10:01:00Z' },
  { id: 12, col: 1, participant_id: 2, text: '', images: ['https://media1.giphy.com/media/abc/giphy.gif'], parent_id: null, created_at: '2026-11-24T10:02:00Z' },
];
const votes = [{ card_id: 10, participant_id: 1 }, { card_id: 11, participant_id: 2 }, { card_id: 12, participant_id: 1 }];
const comments = [{ id: 1, card_id: 11, participant_id: 1, text: 'concordo', created_at: '2026-11-24T10:05:00Z' }];
const data = (b) => ({ board: b, cards, votes, comments, participants: people });

// ---- Ocultos até revelar: o card dos outros vai só com id e coluna (o texto não sai do servidor)
{
  const v = B.viewFor({ ...data(board()), meId: 2 });
  assert.deepEqual(v.cards.find(c => c.id === 10), { id: 10, col: 0, hidden: true }, 'card da Ana oculto pro Beto');
  assert.equal(v.cards.find(c => c.id === 12).hidden, false, 'o próprio card sempre aparece');
  assert.equal(JSON.stringify(v).includes('deploy rápido'), false, 'texto oculto não vaza no payload');
  assert.equal(v.cards.length, 2, 'card agrupado não aparece solto');
}
// ---- Revelado + anônimo: grupo junto, votos somados, nenhum nome
{
  const v = B.viewFor({ ...data(board({ revealed: true })), meId: 2 });
  const g = v.cards.find(c => c.id === 10);
  assert.deepEqual(g.items.map(i => i.id), [10, 11]);
  assert.equal(g.votes, 2, 'votos do grupo somados');
  assert.equal(g.myVote, true, 'Beto votou num card do grupo');
  assert.deepEqual(g.items.map(i => i.mine), [false, true]);
  assert.equal(JSON.stringify(v).includes('Ana'), false, 'anônimo: nome não vaza');
  assert.equal(v.me.votesLeft, 1);
}
// ---- Sem anonimato: autor aparece; sem limite: votesLeft null
{
  const v = B.viewFor({ ...data(board({ revealed: true, settings: { anonymous: false, hideUntilReveal: true, votesPerPerson: 0, votingOpen: true } })), meId: 1 });
  assert.equal(v.cards[0].items[0].author, 'Ana');
  assert.equal(v.cards[0].comments[0].author, 'Ana');
  assert.equal(v.me.votesLeft, null);
}

// ---- Voto
{
  const b = board({ revealed: true });
  assert.equal(B.voteError({ board: b, visible: true, used: 0, already: false }), null);
  assert.match(B.voteError({ board: b, visible: true, used: 2, already: false }), /2 votos/);
  assert.match(B.voteError({ board: b, visible: true, used: 0, already: true }), /já votou/);
  assert.match(B.voteError({ board: board({ settings: { ...b.settings, votingOpen: false } }), visible: true, used: 0, already: false }), /fechada/);
  assert.ok(B.voteError({ board: b, visible: false, used: 0, already: false }), 'card oculto não recebe voto');
  assert.ok(B.voteError({ board: board({ status: 'encerrada' }), visible: true, used: 0, already: false }));
  assert.equal(B.voteError({ board: board({ settings: { ...b.settings, votesPerPerson: 0 } }), visible: true, used: 99, already: false }), null, '0 = sem limite');
}

// ---- Encerrar → formato da retro
{
  const cols = B.toRetroColumns(data(board()));
  assert.deepEqual(cols[0].cards, [{
    t: 'deploy rápido\n---\ndeploy ágil', v: 2, c: ['concordo'], img: ['/api/retro-board/img/00000000-0000-0000-0000-000000000000'],
  }], 'grupo vira um card com ---, votos e comentários somados');
  assert.deepEqual(cols[1].cards[0].t, '(imagem)', 'card só com GIF não some');
  assert.equal(cols[1].description, 'x');
}

// ---- Configuração: anonimato e ocultar não mudam depois de criado
{
  const created = B.cleanSettings({ votesPerPerson: '5' });
  assert.deepEqual(created, { anonymous: true, hideUntilReveal: true, votesPerPerson: 5, votingOpen: true });
  const later = B.cleanSettings({ anonymous: false, hideUntilReveal: false, votingOpen: false, votesPerPerson: 99 }, created);
  assert.deepEqual(later, { anonymous: true, hideUntilReveal: true, votesPerPerson: 5, votingOpen: false });
  assert.ok(B.cleanBoardColumns([]).error);
  assert.ok(B.cleanBoardColumns(Array(11).fill({ name: 'x' })).error);
  assert.equal(B.cleanBoardColumns([{ name: ' ' }]).columns[0].name, 'Coluna 1');
}

// ---- Imagens
{
  const b = (hex, tail = '') => Buffer.concat([Buffer.from(hex, 'hex'), Buffer.from(tail.padEnd(16, '\0'), 'latin1')]);
  assert.equal(B.sniffImage(b('89504e470d0a1a0a')), 'image/png');
  assert.equal(B.sniffImage(b('ffd8ffe0')), 'image/jpeg');
  assert.equal(B.sniffImage(Buffer.from('GIF89a\0\0\0\0\0\0\0\0', 'latin1')), 'image/gif');
  assert.equal(B.sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(B.sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>', 'latin1')), null, 'SVG recusado');
  assert.equal(B.sniffImage(Buffer.from('oi')), null);
  assert.ok(B.isAllowedImageUrl('https://media2.giphy.com/media/xyz/giphy.gif?cid=1&rid=giphy.gif'));
  assert.ok(B.isAllowedImageUrl('/api/retro-board/img/0f8fad5b-d9cb-469f-a165-70867728950e'));
  for (const bad of ['https://evil.com/x.gif', 'javascript:alert(1)', 'https://media.giphy.com.evil.com/x.gif', '/api/retro-board/img/../../x', 'https://giphy.com/"onerror=x']) {
    assert.equal(B.isAllowedImageUrl(bad), false, bad);
  }
  assert.equal(B.cleanImages(['https://evil.com/a.png', '/api/retro-board/img/0f8fad5b-d9cb-469f-a165-70867728950e']).length, 1);
  assert.ok(B.isAllowedImageUrl('https://static.klipy.com/ii/abc/gif.gif'));
  assert.ok(B.isAllowedImageUrl('https://klipy.com/x.gif'));
  for (const bad of ['https://klipy.com.evil.com/x.gif', 'https://evilklipy.com/x.gif', 'http://static.klipy.com/x.gif']) {
    assert.equal(B.isAllowedImageUrl(bad), false, bad);
  }
}

// ---- Busca de GIFs: KLIPY e GIPHY → formato único; anúncio e URL de fora ficam de fora
{
  const k = B.parseKlipy({ result: true, data: { has_next: true, data: [
    { id: 1, title: 'Gato', file: { hd: { gif: { url: 'https://static.klipy.com/a/hd.gif' } }, md: { gif: { url: 'https://static.klipy.com/a/md.gif' } }, sm: { gif: { url: 'https://static.klipy.com/a/sm.gif' } } } },
    { id: 2, type: 'ad', file: { md: { gif: { url: 'https://static.klipy.com/ad.gif' } } } },
    { id: 3, title: 'sem gif', file: { md: { jpg: { url: 'https://static.klipy.com/b.jpg' } } } },
    { id: 4, title: 'de fora', file: { md: { gif: { url: 'https://evil.com/x.gif' } } } },
    { id: 5, title: 'só hd', file: { hd: { gif: { url: 'https://static.klipy.com/c/hd.gif' } }, xs: { webp: { url: 'https://static.klipy.com/c/xs.webp' } } } },
  ] } });
  assert.deepEqual(k, { hasNext: true, items: [
    { src: 'https://static.klipy.com/a/md.gif', preview: 'https://static.klipy.com/a/sm.gif', title: 'Gato' },
    { src: 'https://static.klipy.com/c/hd.gif', preview: 'https://static.klipy.com/c/xs.webp', title: 'só hd' },
  ] });
  assert.deepEqual(B.parseKlipy({}), { items: [], hasNext: false });
  assert.deepEqual(B.parseKlipy({ data: [] }), { items: [], hasNext: false });

  const g = B.parseGiphy({ data: [
    { title: 'Oi', images: { downsized_medium: { url: 'https://media2.giphy.com/media/x/giphy.gif' }, fixed_width: { url: 'https://media2.giphy.com/media/x/200w.gif' } } },
    { title: 'ruim', images: { downsized_medium: { url: 'https://evil.com/x.gif' }, fixed_width: { url: 'https://evil.com/y.gif' } } },
  ], pagination: { total_count: 50, count: 24, offset: 0 } });
  assert.deepEqual(g, { hasNext: true, items: [{ src: 'https://media2.giphy.com/media/x/giphy.gif', preview: 'https://media2.giphy.com/media/x/200w.gif', title: 'Oi' }] });
  assert.equal(B.parseGiphy({ data: [], pagination: { total_count: 24, count: 24, offset: 0 } }).hasNext, false);
}

console.log('retroBoardRules: ok');
