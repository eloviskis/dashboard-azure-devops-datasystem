// backend/retroBoard.js
// Retrô ao vivo: quadro de retrospectiva conduzido dentro do DSMetrics (no lugar do EasyRetro).
// - /api/retro-board/:token/*  público: o time entra pelo link /retro/<token>, sem login (link com capacidade).
// - /api/retro-boards/*        logado: criar, revelar, votação, cronômetro, encerrar.
// Ao encerrar, vira uma retro comum (tabela retro, mesmo formato da importação) e segue pra IA/ações/Kaizen.
// Regras puras em services/retroBoardRules.js. Não existe no port .NET.
const crypto = require('crypto');
const express = require('express');
const B = require('./services/retroBoardRules');
const R = require('./services/retroRules');
const { loadTeams, cleanColumns, statsOf, str, isoDate } = require('./retro');

const MAX_IMAGE = 5 * 1024 * 1024;
const LIMITS = { participants: 100, cardsPerPerson: 150, commentsPerPerson: 300, imagesPerBoard: 100 };
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const newSecret = () => crypto.randomBytes(32).toString('base64url');

async function initRetroBoardSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS retro_board (
      id TEXT PRIMARY KEY,
      team_key TEXT NOT NULL,
      title TEXT NOT NULL,
      date DATE,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','encerrada')),
      columns JSONB NOT NULL,
      settings JSONB NOT NULL,
      revealed BOOLEAN NOT NULL DEFAULT false,
      timer_ends_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,
      retro_id TEXT REFERENCES retro(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_board_participant (
      id SERIAL PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES retro_board(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      secret TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_board_card (
      id SERIAL PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES retro_board(id) ON DELETE CASCADE,
      col INTEGER NOT NULL,
      participant_id INTEGER NOT NULL REFERENCES retro_board_participant(id) ON DELETE CASCADE,
      text TEXT NOT NULL DEFAULT '',
      images JSONB NOT NULL DEFAULT '[]',
      parent_id INTEGER REFERENCES retro_board_card(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_retro_board_card_board ON retro_board_card(board_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_board_vote (
      card_id INTEGER NOT NULL REFERENCES retro_board_card(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES retro_board_participant(id) ON DELETE CASCADE,
      PRIMARY KEY (card_id, participant_id)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_board_comment (
      id SERIAL PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES retro_board_card(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES retro_board_participant(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // ponytail: imagens em bytea no Postgres (até 5 MB cada, 100 por quadro) — sem disco nem config de Nginx pra
  // servir. Se o volume crescer muito, o caminho é gravar em disco/objeto e guardar só o caminho aqui.
  await sql`
    CREATE TABLE IF NOT EXISTS retro_board_image (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES retro_board(id) ON DELETE CASCADE,
      participant_id INTEGER REFERENCES retro_board_participant(id) ON DELETE SET NULL,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  console.log('✅ retro board tables ready');
}

function registerRetroBoard(app, { getSql, authenticateToken }) {
  const db = () => {
    const sql = getSql();
    if (!sql) throw Object.assign(new Error('Banco de dados não configurado'), { status: 503 });
    return sql;
  };
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('❌ retro-board:', e.message);
      res.status(status).json({ error: e.message || 'Erro interno' });
    }
  };
  // Erros dos parsers (JSON inválido, upload acima do limite) acontecem antes do wrap: responde em JSON também.
  const parserErrors = (err, req, res, next) => { // eslint-disable-line no-unused-vars
    const tooLarge = err.type === 'entity.too.large';
    res.status(tooLarge ? 413 : err.status || 400).json({ error: tooLarge ? 'Arquivo grande demais (máximo 5 MB)' : 'Requisição inválida' });
  };
  const bump = (id) => db()`UPDATE retro_board SET version = version + 1 WHERE id = ${id}`;
  const teamLabelOf = async (key) => (await loadTeams(db())).find(t => t.key === key)?.label || key;

  async function loadData(board) {
    const sql = db();
    const [cards, votes, comments, participants] = await Promise.all([
      sql`SELECT id, col, participant_id, text, images, parent_id, created_at FROM retro_board_card WHERE board_id = ${board.id} ORDER BY created_at, id`,
      sql`SELECT v.card_id, v.participant_id FROM retro_board_vote v JOIN retro_board_card c ON c.id = v.card_id WHERE c.board_id = ${board.id}`,
      sql`SELECT m.id, m.card_id, m.participant_id, m.text, m.created_at FROM retro_board_comment m
          JOIN retro_board_card c ON c.id = m.card_id WHERE c.board_id = ${board.id} ORDER BY m.created_at, m.id`,
      sql`SELECT id, name FROM retro_board_participant WHERE board_id = ${board.id}`,
    ]);
    return { cards, votes, comments, participants };
  }

  // ================================================================ público (link)
  const pub = express.Router();
  pub.use(express.json({ limit: '100kb' }));

  async function boardByToken(token) {
    if (!TOKEN_RE.test(String(token))) throw fail(404, 'Retro não encontrada');
    const b = (await db()`SELECT *, to_char(date, 'YYYY-MM-DD') AS date FROM retro_board WHERE token = ${token}`)[0];
    if (!b) throw fail(404, 'Retro não encontrada');
    if (b.status !== 'aberta') throw fail(410, 'Esta retro já foi encerrada. Obrigado por participar!');
    return b;
  }
  // Header X-Retro-Participant: "<id>.<segredo>", devolvido no join e guardado no localStorage do navegador.
  async function participantOf(req, board) {
    const [id, secret] = String(req.get('X-Retro-Participant') || '').split('.');
    const pid = parseInt(id, 10);
    const p = pid && secret
      ? (await db()`SELECT id, name FROM retro_board_participant WHERE id = ${pid} AND board_id = ${board.id} AND secret = ${secret}`)[0]
      : null;
    if (!p) throw fail(401, 'Entre na retro primeiro');
    return p;
  }
  // Contexto comum das rotas de card: quadro, participante e o card (visível pra ele) + a raiz do grupo.
  async function cardCtx(req) {
    const board = await boardByToken(req.params.token);
    const me = await participantOf(req, board);
    const sql = db();
    const card = (await sql`SELECT * FROM retro_board_card WHERE id = ${parseInt(req.params.id, 10) || 0} AND board_id = ${board.id}`)[0];
    if (!card || !B.isVisible(card, board, me.id)) throw fail(404, 'Card não encontrado');
    const root = card.parent_id ? (await sql`SELECT * FROM retro_board_card WHERE id = ${card.parent_id}`)[0] : card;
    const groupIds = [root.id, ...(await sql`SELECT id FROM retro_board_card WHERE parent_id = ${root.id}`).map(r => r.id)];
    return { board, me, card, root, groupIds };
  }

  pub.get('/img/:id', wrap(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw fail(404, 'Imagem não encontrada');
    const img = (await db()`SELECT mime, data FROM retro_board_image WHERE id = ${req.params.id}`)[0];
    if (!img) throw fail(404, 'Imagem não encontrada');
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
    res.send(Buffer.from(img.data)); // Buffer explícito: um Uint8Array faria o Express responder como JSON
  }));

  pub.get('/:token', wrap(async (req, res) => {
    const b = await boardByToken(req.params.token);
    res.json({ title: b.title, teamLabel: await teamLabelOf(b.team_key), date: b.date, anonymous: !!b.settings.anonymous });
  }));

  pub.post('/:token/join', wrap(async (req, res) => {
    const board = await boardByToken(req.params.token);
    const sql = db();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM retro_board_participant WHERE board_id = ${board.id}`;
    if (n >= LIMITS.participants) throw fail(429, 'Esta retro já está com o máximo de participantes');
    const name = str(req.body?.name, 60) || 'Anônimo';
    const secret = newSecret();
    const [p] = await sql`INSERT INTO retro_board_participant (board_id, name, secret) VALUES (${board.id}, ${name}, ${secret}) RETURNING id`;
    await bump(board.id);
    res.status(201).json({ participant: `${p.id}.${secret}`, name });
  }));

  // Polling: ?v=<versão que o navegador já tem>. Nada mudou → só {v, unchanged}.
  pub.get('/:token/state', wrap(async (req, res) => {
    const board = await boardByToken(req.params.token);
    const me = await participantOf(req, board);
    if (String(board.version) === String(req.query.v)) return res.json({ v: board.version, unchanged: true });
    const data = await loadData(board);
    res.json({
      ...B.viewFor({ board, ...data, meId: me.id }),
      v: board.version, serverNow: new Date().toISOString(), teamLabel: await teamLabelOf(board.team_key),
      gifsEnabled: !!process.env.GIPHY_API_KEY,
    });
  }));

  const cardBody = (body) => {
    const text = str(body?.text, 2000);
    const images = B.cleanImages(body?.images);
    if (!text && !images.length) throw fail(400, 'Escreva algo ou anexe uma imagem');
    return { text, images };
  };

  pub.post('/:token/cards', wrap(async (req, res) => {
    const board = await boardByToken(req.params.token);
    const me = await participantOf(req, board);
    const col = parseInt(req.body?.col, 10);
    if (!Number.isInteger(col) || col < 0 || col >= board.columns.length) throw fail(400, 'Coluna inválida');
    const { text, images } = cardBody(req.body);
    const sql = db();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM retro_board_card WHERE board_id = ${board.id} AND participant_id = ${me.id}`;
    if (n >= LIMITS.cardsPerPerson) throw fail(429, 'Você chegou ao limite de cards nesta retro');
    const [c] = await sql`
      INSERT INTO retro_board_card (board_id, col, participant_id, text, images)
      VALUES (${board.id}, ${col}, ${me.id}, ${text}, ${JSON.stringify(images)}::jsonb) RETURNING id`;
    await bump(board.id);
    res.status(201).json({ id: c.id });
  }));

  pub.patch('/:token/cards/:id', wrap(async (req, res) => {
    const { board, me, card } = await cardCtx(req);
    if (card.participant_id !== me.id) throw fail(403, 'Só quem escreveu edita o card');
    const { text, images } = cardBody(req.body);
    await db()`UPDATE retro_board_card SET text = ${text}, images = ${JSON.stringify(images)}::jsonb WHERE id = ${card.id}`;
    await bump(board.id);
    res.json({ ok: true });
  }));

  pub.delete('/:token/cards/:id', wrap(async (req, res) => {
    const { board, me, card } = await cardCtx(req);
    if (card.participant_id !== me.id) throw fail(403, 'Só quem escreveu apaga o card');
    // Os agrupados nele voltam a ser cards soltos (parent_id ON DELETE SET NULL).
    await db()`DELETE FROM retro_board_card WHERE id = ${card.id}`;
    await bump(board.id);
    res.json({ ok: true });
  }));

  // Voto vale pro grupo: um por pessoa por grupo, até o limite do quadro.
  pub.post('/:token/cards/:id/vote', wrap(async (req, res) => {
    const { board, me, root, groupIds } = await cardCtx(req);
    const sql = db();
    const mine = await sql`SELECT v.card_id FROM retro_board_vote v JOIN retro_board_card c ON c.id = v.card_id
      WHERE c.board_id = ${board.id} AND v.participant_id = ${me.id}`;
    const err = B.voteError({ board, visible: true, used: mine.length, already: mine.some(v => groupIds.includes(v.card_id)) });
    if (err) throw fail(400, err);
    const limit = board.settings.votesPerPerson || 0;
    // ponytail: o limite é conferido no próprio INSERT, sem lock; dois cliques no mesmo instante podem passar 1 voto
    // do limite. Se importar, o caminho é SELECT … FOR UPDATE no participante.
    await sql`
      INSERT INTO retro_board_vote (card_id, participant_id)
      SELECT ${root.id}, ${me.id}
      WHERE ${limit}::int = 0 OR (SELECT count(*) FROM retro_board_vote v JOIN retro_board_card c ON c.id = v.card_id
        WHERE c.board_id = ${board.id} AND v.participant_id = ${me.id}) < ${limit}::int
      ON CONFLICT DO NOTHING`;
    await bump(board.id);
    res.json({ ok: true });
  }));

  pub.delete('/:token/cards/:id/vote', wrap(async (req, res) => {
    const { board, me, groupIds } = await cardCtx(req);
    if (!board.settings.votingOpen) throw fail(400, 'A votação está fechada');
    await db()`DELETE FROM retro_board_vote WHERE participant_id = ${me.id} AND card_id = ANY(${groupIds})`;
    await bump(board.id);
    res.json({ ok: true });
  }));

  pub.post('/:token/cards/:id/comments', wrap(async (req, res) => {
    const { board, me, root } = await cardCtx(req);
    const text = str(req.body?.text, 1000);
    if (!text) throw fail(400, 'Escreva o comentário');
    const sql = db();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM retro_board_comment m JOIN retro_board_card c ON c.id = m.card_id
      WHERE c.board_id = ${board.id} AND m.participant_id = ${me.id}`;
    if (n >= LIMITS.commentsPerPerson) throw fail(429, 'Você chegou ao limite de comentários nesta retro');
    await sql`INSERT INTO retro_board_comment (card_id, participant_id, text) VALUES (${root.id}, ${me.id}, ${text})`;
    await bump(board.id);
    res.status(201).json({ ok: true });
  }));

  pub.delete('/:token/comments/:id', wrap(async (req, res) => {
    const board = await boardByToken(req.params.token);
    const me = await participantOf(req, board);
    const del = await db()`DELETE FROM retro_board_comment WHERE id = ${parseInt(req.params.id, 10) || 0} AND participant_id = ${me.id} RETURNING id`;
    if (!del.length) throw fail(404, 'Comentário não encontrado');
    await bump(board.id);
    res.json({ ok: true });
  }));

  // Agrupar: o card (e o que já estava agrupado nele) entra no grupo do alvo, na coluna do alvo.
  pub.post('/:token/cards/:id/group', wrap(async (req, res) => {
    const { board, me, card } = await cardCtx(req);
    const sql = db();
    const target = (await sql`SELECT * FROM retro_board_card WHERE id = ${parseInt(req.body?.into, 10) || 0} AND board_id = ${board.id}`)[0];
    if (!target || !B.isVisible(target, board, me.id)) throw fail(404, 'Card de destino não encontrado');
    const rootId = target.parent_id || target.id;
    const into = (await sql`SELECT col FROM retro_board_card WHERE id = ${rootId}`)[0];
    if (rootId === card.id || rootId === card.parent_id) throw fail(400, 'Estes cards já estão no mesmo grupo');
    await sql`UPDATE retro_board_card SET parent_id = ${rootId}, col = ${into.col} WHERE parent_id = ${card.id}`;
    await sql`UPDATE retro_board_card SET parent_id = ${rootId}, col = ${into.col} WHERE id = ${card.id}`;
    await bump(board.id);
    res.json({ ok: true });
  }));

  pub.post('/:token/cards/:id/ungroup', wrap(async (req, res) => {
    const { board, card } = await cardCtx(req);
    if (!card.parent_id) throw fail(400, 'Este card não está agrupado');
    await db()`UPDATE retro_board_card SET parent_id = NULL WHERE id = ${card.id}`;
    await bump(board.id);
    res.json({ ok: true });
  }));

  pub.post('/:token/images', express.raw({ type: () => true, limit: '6mb' }), wrap(async (req, res) => {
    const board = await boardByToken(req.params.token);
    const me = await participantOf(req, board);
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || !buf.length) throw fail(400, 'Envie a imagem');
    if (buf.length > MAX_IMAGE) throw fail(413, 'Arquivo grande demais (máximo 5 MB)');
    const mime = B.sniffImage(buf);
    if (!mime) throw fail(415, 'Formato não aceito: use PNG, JPG, GIF ou WEBP');
    const sql = db();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM retro_board_image WHERE board_id = ${board.id}`;
    if (n >= LIMITS.imagesPerBoard) throw fail(429, 'Esta retro chegou ao limite de imagens');
    const id = crypto.randomUUID();
    await sql`INSERT INTO retro_board_image (id, board_id, participant_id, mime, data, bytes) VALUES (${id}, ${board.id}, ${me.id}, ${mime}, ${buf}, ${buf.length})`;
    res.status(201).json({ src: `/api/retro-board/img/${id}` });
  }));

  // Busca na GIPHY pelo backend (a chave não vai pro navegador). Sem GIPHY_API_KEY, a busca não aparece na tela.
  pub.get('/:token/gifs', wrap(async (req, res) => {
    const board = await boardByToken(req.params.token);
    await participantOf(req, board);
    const key = process.env.GIPHY_API_KEY;
    if (!key) throw fail(404, 'Busca de GIFs não configurada no servidor');
    const q = str(req.query.q, 50);
    if (!q) return res.json([]);
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=12&rating=pg&lang=pt`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r || !r.ok) throw fail(502, 'A busca de GIFs não respondeu agora');
    const data = (await r.json())?.data || [];
    res.json(data.map(g => ({
      src: g.images?.downsized_medium?.url || g.images?.fixed_height?.url,
      preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
      title: str(g.title, 100),
    })).filter(g => B.isAllowedImageUrl(g.src) && B.isAllowedImageUrl(g.preview)));
  }));

  pub.use(parserErrors);
  app.use('/api/retro-board', pub);

  // ================================================================ facilitador (logado)
  const adm = express.Router();
  adm.use(express.json({ limit: '100kb' }));
  adm.use(authenticateToken);

  const canManage = (user, b) => b.created_by === user.id || R.isLeader(user);
  const toDto = (b, user) => ({
    id: b.id, teamKey: b.team_key, title: b.title, date: b.date, token: b.token, status: b.status, retroId: b.retro_id,
    settings: b.settings, revealed: b.revealed, columns: b.columns, createdByName: b.created_by_name || null, createdAt: b.created_at,
    cards: b.cards ?? 0, participants: b.participants ?? 0, canManage: canManage(user, b),
  });
  async function managed(req) {
    const b = (await db()`SELECT *, to_char(date, 'YYYY-MM-DD') AS date FROM retro_board WHERE id = ${req.params.id}`)[0];
    if (!b) throw fail(404, 'Retro não encontrada');
    if (!canManage(req.user, b)) throw fail(403, 'Só quem criou a retro (ou a liderança) conduz este quadro');
    return b;
  }

  adm.get('/', wrap(async (req, res) => {
    const rows = await db()`
      SELECT b.*, to_char(b.date, 'YYYY-MM-DD') AS date, u.username AS created_by_name,
        (SELECT count(*)::int FROM retro_board_card c WHERE c.board_id = b.id) AS cards,
        (SELECT count(*)::int FROM retro_board_participant p WHERE p.board_id = b.id) AS participants
      FROM retro_board b LEFT JOIN users u ON u.id = b.created_by
      ORDER BY b.status, b.created_at DESC LIMIT 100`;
    res.json(rows.map(b => toDto(b, req.user)));
  }));

  // Modelos prontos + as colunas das últimas retros gravadas (sem repetir o mesmo conjunto de colunas).
  adm.get('/templates', wrap(async (req, res) => {
    const rows = await db()`SELECT title, columns FROM retro ORDER BY created_at DESC LIMIT 60`;
    const seen = new Set(B.TEMPLATES.map(t => t.columns.map(c => R.norm(c.name)).join('|')));
    const fromRetros = [];
    for (const r of rows) {
      const columns = (r.columns || []).slice(0, 10).map(c => ({ name: str(c?.name, 80), description: str(c?.description, 300) })).filter(c => c.name);
      const key = columns.map(c => R.norm(c.name)).join('|');
      if (!columns.length || seen.has(key)) continue;
      seen.add(key);
      fromRetros.push({ id: `retro-${fromRetros.length}`, name: `Colunas de “${r.title}”`, columns });
      if (fromRetros.length >= 10) break;
    }
    res.json([...B.TEMPLATES, ...fromRetros]);
  }));

  adm.post('/', wrap(async (req, res) => {
    const b = req.body || {};
    const teams = await loadTeams(db());
    if (!teams.some(t => t.key === b.teamKey)) throw fail(400, 'Escolha o time');
    const title = str(b.title, 200);
    if (!title) throw fail(400, 'Informe o título');
    const { columns, error } = B.cleanBoardColumns(b.columns);
    if (error) throw fail(400, error);
    const date = isoDate(b.date);
    const id = R.newId(`${b.teamKey}-${date || 'retro'}`);
    const [row] = await db()`
      INSERT INTO retro_board (id, team_key, title, date, token, columns, settings, created_by)
      VALUES (${id}, ${b.teamKey}, ${title}, ${date}, ${newSecret()}, ${JSON.stringify(columns)}::jsonb,
        ${JSON.stringify(B.cleanSettings(b.settings || {}))}::jsonb, ${req.user.id})
      RETURNING *, to_char(date, 'YYYY-MM-DD') AS date`;
    res.status(201).json(toDto({ ...row, created_by_name: req.user.username }, req.user));
  }));

  // Controles da condução: revelar, votação (aberta/fechada, votos por pessoa) e cronômetro ({minutes} ou null).
  adm.patch('/:id', wrap(async (req, res) => {
    const b = await managed(req);
    if (b.status !== 'aberta') throw fail(400, 'Esta retro já foi encerrada');
    const body = req.body || {};
    const settings = B.cleanSettings(body.settings || {}, b.settings);
    const revealed = body.revealed === true ? true : b.revealed;
    let timerEnds = b.timer_ends_at;
    if (body.timer === null) timerEnds = null;
    else if (body.timer && Number.isInteger(body.timer.minutes) && body.timer.minutes >= 1 && body.timer.minutes <= 60) {
      timerEnds = new Date(Date.now() + body.timer.minutes * 60000).toISOString();
    }
    await db()`
      UPDATE retro_board SET settings = ${JSON.stringify(settings)}::jsonb, revealed = ${revealed}, timer_ends_at = ${timerEnds},
        version = version + 1 WHERE id = ${b.id}`;
    res.json({ ok: true });
  }));

  adm.post('/:id/finish', wrap(async (req, res) => {
    const b = await managed(req);
    if (b.status !== 'aberta') throw fail(400, 'Esta retro já foi encerrada');
    const columns = cleanColumns(B.toRetroColumns({ board: b, ...(await loadData(b)) }));
    const sql = db();
    const retroId = R.newId(`${b.team_key}-${b.date || 'retro'}`);
    await sql`
      INSERT INTO retro (id, team_key, title, date, source_file, columns, stats, created_by)
      VALUES (${retroId}, ${b.team_key}, ${b.title}, ${b.date}, 'Retrô ao vivo (DSMetrics)', ${JSON.stringify(columns)}::jsonb,
        ${JSON.stringify(statsOf(columns))}::jsonb, ${req.user.id})`;
    await sql`UPDATE retro_board SET status = 'encerrada', retro_id = ${retroId}, timer_ends_at = NULL, version = version + 1 WHERE id = ${b.id}`;
    res.json({ retroId });
  }));

  adm.delete('/:id', wrap(async (req, res) => {
    const b = await managed(req);
    if (b.status !== 'aberta') throw fail(400, 'Retro encerrada já está em Retros: exclua por lá');
    await db()`DELETE FROM retro_board WHERE id = ${b.id}`;
    res.json({ deleted: true });
  }));

  adm.use(parserErrors);
  app.use('/api/retro-boards', adm);
  console.log('✅ Retrô ao vivo routes registered (/api/retro-board, /api/retro-boards)');
}

module.exports = { initRetroBoardSchema, registerRetroBoard };
