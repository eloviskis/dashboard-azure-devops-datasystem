// backend/services/retroBoardRules.js
// Regras puras da Retrô ao vivo (quadro conduzido dentro do DSMetrics): modelos, o que cada participante vê
// (cards ocultos e anonimato decididos aqui, nunca só na tela), voto, grupo → formato da retro e imagens.
// Sem I/O — testado em retroBoardRules.check.js.

// Os de FunRetrospectives (só os da categoria em pt-BR): nomes das colunas são os da página (é o formato);
// perguntas e descrição foram escritas aqui, com o link da página como fonte.
const FR = 'https://www.funretrospectives.com/pt/';
const c = (name, description) => ({ name, description });
const TEMPLATES = [
  {
    id: 'tias', name: 'Tias', group: 'Modelos do time', description: 'O modelo que o time já usava no EasyRetro.', columns: [
      { name: 'Tia Calma', description: 'Ações e atitudes que nos deram segurança e que nos acalmaram por ver e saber que fizemos tal ação.' },
      { name: 'Tia Legra', description: 'Tia que celebra algo que fizemos tão bem, mas tão bem, que devemos exaltar.' },
      { name: 'Tia Flige', description: 'Coisas que não foram bem na sprint, que nos entristeceram, que não deveríamos repetir.' },
      { name: 'Tia Nima', description: 'Planos de ação a respeito das coisas que a Tia Flige relatou.' },
      { name: 'Tia Fasta', description: 'Coisas tão problemáticas que não devem mais acontecer!' },
    ],
  },
  {
    id: 'quebra-cabeca', name: 'Quebra-cabeça', group: 'Modelos do time', description: 'O modelo que o time já usava no EasyRetro.', columns: [
      { name: 'Peças que encaixaram', description: 'O que funcionou muito bem nesse ciclo?' },
      { name: 'Peças que ainda não encontramos', description: 'O que ainda está nos causando dificuldade?' },
      { name: 'Peças que podemos construir', description: 'O que podemos melhorar juntos?' },
      { name: 'Peça surpresa', description: 'Qual foi a maior surpresa deste ciclo?' },
      { name: 'Peças que alguém entregou', description: 'Aqui cada pessoa escreve uma peça que outro colega colocou no quebra-cabeça.' },
    ],
  },
  {
    id: 'classica', name: 'Clássica', group: 'Modelos do time', description: 'Três colunas simples, para qualquer retro.', columns: [
      { name: 'O que foi bem', description: '' },
      { name: 'O que pode melhorar', description: '' },
      { name: 'Ideias de ação', description: '' },
    ],
  },
  {
    id: 'abra-a-caixa', name: 'Abra a Caixa', group: 'FunRetrospectives', source: `${FR}abra-a-caixa/`,
    description: 'Para questionar como o time trabalha hoje e abrir espaço para inovar. A caixa são as práticas atuais.',
    columns: [
      c('Remover', 'O que deveria sair da caixa e parar de ser feito?'),
      c('Acrescentar', 'O que ainda não fazemos e deveria entrar na caixa?'),
      c('Reciclar', 'O que já fazemos e dá para reaproveitar de outro jeito?'),
    ],
  },
  {
    id: 'ancoras-e-motor', name: 'Âncoras e Motor', group: 'FunRetrospectives', source: `${FR}ancoras-e-motor/`,
    description: 'Para enxergar o que empurra o time para a frente e o que o prende no lugar.',
    columns: [
      c('Motor', 'O que dá energia ao time e faz a gente avançar?'),
      c('Âncoras', 'O que segura o time ou deixa tudo mais lento?'),
    ],
  },
  {
    id: 'carro-veloz', name: 'Carro Veloz', group: 'FunRetrospectives', source: `${FR}carro-veloz-2/`,
    description: 'Para descobrir o que acelera o time e o que funciona como freio.',
    columns: [
      c('Motor', 'O que faz o time andar mais rápido?'),
      c('Paraquedas', 'O que está freando o time?'),
    ],
  },
  {
    id: 'clra', name: 'CLRA: Considerações Futuras, Lições Aprendidas, Realizações, Áreas Problemáticas', group: 'FunRetrospectives',
    source: `${FR}clra-consideracoes-futuras-licoes-aprendidas-realizacoes-areas-problematicas/`,
    description: 'Boa para fechar um projeto ou uma fase: olha para trás e já prepara o próximo ciclo.',
    columns: [
      c('Considerações futuras', 'O que precisamos levar em conta daqui para a frente?'),
      c('Lições aprendidas', 'Que conclusões tiramos deste período?'),
      c('Realizações', 'Que conquistas merecem ser comemoradas?'),
      c('Áreas problemáticas', 'Onde o time mais sofreu?'),
    ],
  },
  {
    id: 'conversa-sobre-erros', name: 'Conversa Sobre Erros', group: 'FunRetrospectives', source: `${FR}conversa-sobre-erros/`,
    description: 'Para falar de erros sem caça às bruxas, separando o que fizemos do que deixamos de fazer. Registre a ação como comentário no card do erro.',
    columns: [
      c('Erro por comissão', 'Que erro veio de algo que fizemos e não deveríamos ter feito?'),
      c('Erro por omissão', 'Que erro veio de algo que deixamos de fazer?'),
    ],
  },
  {
    id: 'deu-certo-nao-deu-ideias', name: 'Deu certo, Não deu certo, Ideias novas', group: 'FunRetrospectives', source: `${FR}deu-certo-nao-deu-ideias-novas/`,
    description: 'Direta: o que repetir, o que evitar e o que vale experimentar.',
    columns: [
      c('Deu certo', 'O que funcionou e vale repetir?'),
      c('Não deu certo', 'O que não funcionou e precisa ser evitado?'),
      c('Ideias novas', 'Que experimento ou sugestão vale testar?'),
    ],
  },
  {
    id: 'gaf', name: 'GAF: Gostei, Aprendi, Faltou', group: 'FunRetrospectives', source: `${FR}gaf-gostei-aprendi-faltou/`,
    description: 'Rápida de preencher, boa para revisar um período longo.',
    columns: [
      c('Gostei', 'O que você curtiu neste período?'),
      c('Aprendi', 'O que você aprendeu ou descobriu?'),
      c('Faltou', 'O que você esperava e não aconteceu?'),
    ],
  },
  {
    id: 'lidando-com-falha', name: 'Lidando com Falha', group: 'FunRetrospectives', source: `${FR}lidando-com-falha/`,
    description: 'Para tratar uma falha específica do começo ao fim. Escreva a falha no título da retro.',
    columns: [
      c('Análise', 'O que falhou e o que provocou a falha?'),
      c('Avaliação', 'Qual foi o estrago, quão grave é e qual a chance de acontecer de novo?'),
      c('Ação', 'O que fazemos para corrigir e para evitar que se repita?'),
      c('Verificação', 'Como vamos saber se essas ações deram certo?'),
    ],
  },
  {
    id: 'mamm', name: 'MAMM: Manter, Acrescentar, Mais, Menos', group: 'FunRetrospectives', source: `${FR}mamm-manter-acrescentar-mais-menos/`,
    description: 'Para ajustar a forma de trabalhar: o que continua, o que entra e o que aumenta ou diminui.',
    columns: [
      c('Manter', 'O que fazemos bem e deve continuar?'),
      c('Acrescentar', 'Que prática nova vale trazer para o time?'),
      c('Mais', 'O que já fazemos e daria mais resultado se fizéssemos mais?'),
      c('Menos', 'O que já fazemos e deveria acontecer menos?'),
    ],
  },
  {
    id: 'tres-porquinhos', name: 'Os Três Porquinhos', group: 'FunRetrospectives', source: `${FR}os-tres-porquinhos/`,
    description: 'Usa a história das três casas para avaliar o quanto as práticas do time são sólidas.',
    columns: [
      c('Casa de palha', 'O que parece funcionar, mas pode desabar a qualquer momento?'),
      c('Casa de madeira', 'O que é firme, mas ainda dá para melhorar?'),
      c('Casa de tijolos', 'O que é tão sólido que não precisa de atenção agora?'),
    ],
  },
  {
    id: 'prazer-e-ganhos', name: 'Prazer e Ganhos', group: 'FunRetrospectives', source: `${FR}prazer-e-ganhos/`,
    description: 'Cada pessoa coloca as atividades do dia a dia num quadrante. Depois, conversem sobre como levar mais coisas para "Prazer e ganho".',
    columns: [
      c('Prazer e ganho', 'O que é bom de fazer e traz resultado? (o quadrante mágico)'),
      c('Prazer e perda', 'O que é bom de fazer, mas custa caro para o time?'),
      c('Sofrimento e ganho', 'O que pesa para fazer, mas traz resultado?'),
      c('Sofrimento e perda', 'O que pesa e não traz benefício?'),
    ],
  },
  {
    id: 'problemas-e-acoes', name: 'Problemas e Ações', group: 'FunRetrospectives', source: `${FR}problemas-e-acoes/`,
    description: 'Jeito rápido de levantar problemas e já sair com ações. Agrupe os parecidos antes de votar.',
    columns: [
      c('Problemas', 'Que problema você percebe no time?'),
      c('Ações', 'Que ação ajudaria a resolver?'),
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
