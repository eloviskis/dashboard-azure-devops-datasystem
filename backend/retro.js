// backend/retro.js
// Aba Retrô: schema, rotas /api/retro/*, envio das ações aprovadas pro board Kaizen e carga inicial.
// Regras puras em services/retroRules.js, Azure DevOps em services/retroAzdo.js, prompts em services/retroPrompts.js.
// O contrato HTTP daqui é o mesmo do port .NET (DSMetricsDotNet, RetroController) — mudou um, muda o outro.
const express = require('express');
const schedule = require('node-schedule');
const R = require('./services/retroRules');
const AZ = require('./services/retroAzdo');
const P = require('./services/retroPrompts');
const { callGemini, isAiConfigured } = require('./services/ai');

const DEFAULT_TEAMS = [
  { key: 'Sustentacao', label: 'Sustentação', aliases: [] },
  { key: 'Franquia', label: 'CTC', aliases: ['Franquia', 'Franquia/CTC'] },
  { key: 'Inovacao_novo', label: 'Inovação', aliases: ['Inovacao'] },
  { key: 'Wakanda', label: 'Wakanda', aliases: [] },
  { key: 'Tatico', label: 'Condado', aliases: ['Tático', 'Tatico'] },
];
const HUES = [205, 125, 275, 30, 175, 330, 48, 0, 235, 290];

// ---------------------------------------------------------------- schema
async function initRetroSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS retro_action_type (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      hue INTEGER NOT NULL DEFAULT 205 CHECK (hue BETWEEN 0 AND 359),
      sort_order INTEGER NOT NULL DEFAULT 99,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro (
      id TEXT PRIMARY KEY,
      team_key TEXT NOT NULL,
      title TEXT NOT NULL,
      date DATE,
      source_file TEXT,
      columns JSONB NOT NULL DEFAULT '[]',
      stats JSONB NOT NULL DEFAULT '{}',
      insights JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_action (
      id TEXT PRIMARY KEY,
      retro_id TEXT REFERENCES retro(id) ON DELETE SET NULL,
      team_key TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      origin JSONB NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baixa')),
      owner_id INTEGER REFERENCES devtracker_developers(id) ON DELETE SET NULL,
      owner_name_fallback TEXT,
      due_date DATE,
      recurring BOOLEAN NOT NULL DEFAULT false,
      state TEXT NOT NULL DEFAULT 'sugerida' CHECK (state IN ('sugerida','aberta','andamento','validacao','concluida','descartada')),
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ia','manual')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      state_changed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      azdo_work_item_id INTEGER,
      azdo_url TEXT,
      azdo_sync_status TEXT CHECK (azdo_sync_status IN ('pendente','enviando','ok','erro','simulado')),
      azdo_sync_error TEXT,
      azdo_synced_at TIMESTAMPTZ,
      azdo_attempts INTEGER NOT NULL DEFAULT 0,
      azdo_next_attempt_at TIMESTAMPTZ,
      azdo_claimed_at TIMESTAMPTZ,
      azdo_managed_tags JSONB
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_retro_action_team ON retro_action(team_key)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_retro_action_retro ON retro_action(retro_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_action_type_link (
      action_id TEXT NOT NULL REFERENCES retro_action(id) ON DELETE CASCADE,
      type_id TEXT NOT NULL REFERENCES retro_action_type(id) ON DELETE CASCADE,
      PRIMARY KEY (action_id, type_id)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS retro_action_update (
      id SERIAL PRIMARY KEY,
      action_id TEXT NOT NULL REFERENCES retro_action(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS team_retro_feedback (
      team_key TEXT PRIMARY KEY,
      feedback JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )`;
  // Fase 2: último estado do work item visto na volta do ADO (evita repetir a mesma nota/movimento).
  await sql`ALTER TABLE retro_action ADD COLUMN IF NOT EXISTS azdo_last_state TEXT`;
  // Cache da identidade do ADO de cada pessoa (System.AssignedTo). '' = procurado e não achado.
  await sql`ALTER TABLE devtracker_developers ADD COLUMN IF NOT EXISTS ado_unique_name TEXT`;
  console.log('✅ retro tables ready');
}

// ---------------------------------------------------------------- leitura
const ACTION_SELECT = `
  SELECT a.id, a.retro_id, a.team_key, a.title, a.detail, a.origin, a.priority, a.owner_id, a.owner_name_fallback,
    to_char(a.due_date, 'YYYY-MM-DD') AS due_date, a.recurring, a.state, a.source,
    a.created_at, a.approved_at, a.state_changed_at, a.closed_at,
    a.azdo_work_item_id, a.azdo_url, a.azdo_sync_status, a.azdo_sync_error, a.azdo_synced_at, a.azdo_attempts, a.azdo_managed_tags,
    d.name AS owner_name, d.ado_unique_name AS owner_ado_unique_name,
    cu.username AS created_by_name, au.username AS approved_by_name, xu.username AS closed_by_name,
    r.title AS retro_title, to_char(r.date, 'YYYY-MM-DD') AS retro_date,
    COALESCE((SELECT array_agg(l.type_id ORDER BY t.sort_order, t.name) FROM retro_action_type_link l
              JOIN retro_action_type t ON t.id = l.type_id WHERE l.action_id = a.id), '{}') AS type_ids,
    (SELECT count(*)::int FROM retro_action_update u WHERE u.action_id = a.id) AS updates_count
  FROM retro_action a
  LEFT JOIN devtracker_developers d ON d.id = a.owner_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users au ON au.id = a.approved_by
  LEFT JOIN users xu ON xu.id = a.closed_by
  LEFT JOIN retro r ON r.id = a.retro_id`;

const toActionDto = (a) => ({
  id: a.id, retroId: a.retro_id, retroTitle: a.retro_title, retroDate: a.retro_date, teamKey: a.team_key,
  title: a.title, detail: a.detail, origin: a.origin || [], priority: a.priority,
  ownerId: a.owner_id, ownerName: a.owner_name || a.owner_name_fallback || null, ownerNameFallback: a.owner_name_fallback,
  dueDate: a.due_date, recurring: a.recurring, state: a.state, source: a.source, typeIds: a.type_ids || [],
  createdAt: a.created_at, createdByName: a.created_by_name, approvedAt: a.approved_at, approvedByName: a.approved_by_name,
  stateChangedAt: a.state_changed_at, closedAt: a.closed_at, closedByName: a.closed_by_name,
  late: R.isLate(a), updatesCount: a.updates_count,
  azdo: { workItemId: a.azdo_work_item_id, url: a.azdo_url, status: a.azdo_sync_status, error: a.azdo_sync_error, syncedAt: a.azdo_synced_at },
});

const toRetroDto = (r, withColumns) => ({
  id: r.id, teamKey: r.team_key, title: r.title, date: r.date, sourceFile: r.source_file, stats: r.stats,
  insights: r.insights, createdAt: r.created_at, createdByName: r.created_by_name,
  actionsCount: r.actions_count ?? undefined, ...(withColumns ? { columns: r.columns } : {}),
});

// ---------------------------------------------------------------- validação de entrada
const str = (v, max) => String(v ?? '').trim().slice(0, max);
// Só datas de calendário válidas (30/02 passaria no regex e o Postgres recusaria o INSERT com 500).
const isoDate = (v) => {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
};
// Aceita true/"true" (o frontend manda boolean; outro cliente pode mandar texto).
const bool = (v) => v === true || v === 'true';

function cleanColumns(cols) {
  if (!Array.isArray(cols) || !cols.length) throw Object.assign(new Error('A retro precisa ter colunas'), { status: 400 });
  const out = cols.slice(0, 20).map((c, i) => ({
    name: str(c?.name, 120) || `Coluna ${i + 1}`,
    description: str(c?.description, 500),
    cards: (Array.isArray(c?.cards) ? c.cards : []).slice(0, 500).map(k => ({
      t: str(k?.t, 4000), v: Math.max(0, parseInt(k?.v, 10) || 0),
      c: (Array.isArray(k?.c) ? k.c : []).map(x => str(x, 2000)).filter(Boolean).slice(0, 100),
    })).filter(k => k.t),
  }));
  if (!out.some(c => c.cards.length)) throw Object.assign(new Error('A retro não tem nenhum card'), { status: 400 });
  return out;
}
const statsOf = (cols) => {
  const cards = cols.flatMap(c => c.cards);
  return { cards: cards.length, votes: cards.reduce((s, c) => s + c.v, 0), comments: cards.reduce((s, c) => s + c.c.length, 0) };
};

// ---------------------------------------------------------------- módulo
function registerRetro(app, { getSql, authenticateToken }) {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  router.use(authenticateToken);
  const db = () => {
    const sql = getSql();
    if (!sql) throw Object.assign(new Error('Banco de dados não configurado'), { status: 503 });
    return sql;
  };
  // SQL montado em string ($1..$n) passando pelo helper sql do server.js, que só aceita template literal:
  // quebra o texto nos placeholders e repassa os valores na ordem em que aparecem.
  const rawQuery = async (text, params) => {
    const strings = text.split(/\$\d+/);
    const values = [...text.matchAll(/\$(\d+)/g)].map(m => params[+m[1] - 1]);
    return db()(Object.assign(strings, { raw: strings }), ...values);
  };

  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('❌ retro:', e.message);
      res.status(status).json({ error: e.message || 'Erro interno' });
    }
  };
  const leaderOnly = (req, res, next) => (R.isLeader(req.user) ? next()
    : res.status(403).json({ error: 'Só a liderança (admin ou gestor) pode fazer isso.' }));
  const fail = (status, message) => Object.assign(new Error(message), { status });

  // ---- helpers de dados
  async function getTeams() {
    const sql = db();
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'retro_config'`;
    let teams = null;
    try { teams = JSON.parse(rows[0]?.value || 'null')?.teams; } catch { /* config inválida: usa padrão */ }
    return Array.isArray(teams) && teams.length ? teams : DEFAULT_TEAMS;
  }
  const teamLabel = (teams, key) => teams.find(t => t.key === key)?.label || key;
  const getTypes = async () => db()`SELECT id, name, hue, sort_order FROM retro_action_type WHERE active ORDER BY sort_order, name`;
  const getAction = async (id) => (await rawQuery(`${ACTION_SELECT} WHERE a.id = $1`, [id]))[0] || null;
  const listActions = async (where = 'TRUE', params = []) => rawQuery(`${ACTION_SELECT} WHERE ${where} ORDER BY a.created_at`, params);

  async function setTypes(actionId, typeIds) {
    const sql = db();
    const valid = (await sql`SELECT id FROM retro_action_type WHERE id = ANY(${typeIds || []})`).map(r => r.id);
    await sql`DELETE FROM retro_action_type_link WHERE action_id = ${actionId}`;
    for (const t of valid) await sql`INSERT INTO retro_action_type_link (action_id, type_id) VALUES (${actionId}, ${t}) ON CONFLICT DO NOTHING`;
  }

  async function assertOwner(ownerId) {
    if (ownerId == null || ownerId === '') return null;
    const id = parseInt(ownerId, 10);
    const rows = await db()`SELECT id FROM devtracker_developers WHERE id = ${id}`;
    if (!rows.length) throw fail(400, 'Responsável não encontrado no cadastro de pessoas');
    return id;
  }

  // Campos editáveis de uma ação (sugestão, formulário ou detalhe). Só o que veio no body é alterado.
  async function applyEdits(id, body, teams) {
    const sql = db();
    const cur = await getAction(id);
    if (!cur) throw fail(404, 'Ação não encontrada');
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const recurring = has('recurring') ? bool(body.recurring) : cur.recurring;
    const next = {
      title: has('title') ? str(body.title, 140) : cur.title,
      detail: has('detail') ? str(body.detail, 2000) : cur.detail,
      priority: has('priority') ? (R.PRIORITIES.includes(body.priority) ? body.priority : 'media') : cur.priority,
      owner_id: has('ownerId') ? await assertOwner(body.ownerId) : cur.owner_id,
      owner_name_fallback: has('ownerNameFallback') ? (str(body.ownerNameFallback, 120) || null) : cur.owner_name_fallback,
      due_date: recurring ? null : (has('dueDate') ? isoDate(body.dueDate) : cur.due_date),
      recurring,
      team_key: has('teamKey') && teams.some(t => t.key === body.teamKey) ? body.teamKey : cur.team_key,
      origin: has('origin') && Array.isArray(body.origin) ? body.origin.map(o => str(o, 280)).filter(Boolean).slice(0, 5) : cur.origin,
    };
    if (has('title') && !next.title) throw fail(400, 'O título não pode ficar vazio');
    await sql`
      UPDATE retro_action SET title = ${next.title}, detail = ${next.detail}, priority = ${next.priority},
        owner_id = ${next.owner_id}, owner_name_fallback = ${next.owner_name_fallback}, due_date = ${next.due_date},
        recurring = ${next.recurring}, team_key = ${next.team_key}, origin = ${JSON.stringify(next.origin || [])}::jsonb
      WHERE id = ${id}`;
    if (has('typeIds')) await setTypes(id, Array.isArray(body.typeIds) ? body.typeIds : []);
    return getAction(id);
  }

  // ---- Azure DevOps
  const azdoCfg = () => AZ.retroAzdoConfig();
  const azdoClient = (cfg) => AZ.createAzdoClient({ org: cfg.org, project: cfg.project, pat: cfg.pat });

  async function ctxFor(action) {
    const cfg = azdoCfg();
    const sql = db();
    const teams = await getTeams();
    const a = action.type_ids ? action : await getAction(action.id);
    const types = await getTypes();
    const typeNames = (a.type_ids || []).map(id => types.find(t => t.id === id)?.name).filter(Boolean);
    let assignedTo = a.owner_ado_unique_name || null;
    if (a.owner_id && a.owner_ado_unique_name == null && cfg.pat && a.owner_name) {
      try {
        assignedTo = await azdoClient(cfg).resolveIdentity(a.owner_name);
        await sql`UPDATE devtracker_developers SET ado_unique_name = ${assignedTo || ''} WHERE id = ${a.owner_id}`;
      } catch (e) { console.warn(`⚠️ retro: identidade de ${a.owner_name} não resolvida: ${e.message}`); }
    }
    let iterationPath = cfg.iterationPath;
    if (cfg.writeEnabled) {
      try { iterationPath = (await azdoClient(cfg).currentIteration(cfg.team)) || cfg.iterationPath; } catch { /* usa a padrão */ }
    }
    return {
      teamLabel: teamLabel(teams, a.team_key), typeNames, retroTitle: a.retro_title, retroDate: a.retro_date,
      ownerName: a.owner_name || a.owner_name_fallback, assignedTo: assignedTo || null, areaPath: cfg.areaPath,
      iterationPath, workItemType: cfg.workItemType, url: AZ.actionUrl(cfg.appUrl, a.id),
    };
  }

  const repo = {
    async claim(id) {
      const statuses = azdoCfg().writeEnabled ? ['pendente', 'erro', 'simulado'] : ['pendente', 'erro'];
      const rows = await db()`
        UPDATE retro_action SET azdo_sync_status = 'enviando', azdo_claimed_at = NOW()
        WHERE id = ${id} AND azdo_work_item_id IS NULL AND state IN ('aberta','andamento','validacao','concluida')
          AND (azdo_sync_status = ANY(${statuses}) OR (azdo_sync_status = 'enviando' AND azdo_claimed_at < NOW() - INTERVAL '10 minutes'))
        RETURNING id`;
      return rows.length ? getAction(id) : null;
    },
    markOk: (id, { workItemId, url, managedTags }) => db()`
      UPDATE retro_action SET azdo_sync_status = 'ok', azdo_work_item_id = ${workItemId}, azdo_url = ${url},
        azdo_managed_tags = ${JSON.stringify(managedTags)}::jsonb, azdo_sync_error = NULL, azdo_synced_at = NOW(),
        azdo_next_attempt_at = NULL, azdo_last_state = 'New' WHERE id = ${id}`,
    isLive: async (id) => {
      const r = await db()`SELECT state FROM retro_action WHERE id = ${id}`;
      return !!r.length && R.LIVE.includes(r[0].state);
    },
    markSimulated: (id) => db()`
      UPDATE retro_action SET azdo_sync_status = 'simulado', azdo_sync_error = NULL, azdo_synced_at = NOW() WHERE id = ${id}`,
    markError: (id, message, delayMs) => db()`
      UPDATE retro_action SET azdo_sync_status = 'erro', azdo_sync_error = ${String(message).slice(0, 500)},
        azdo_attempts = azdo_attempts + 1,
        azdo_next_attempt_at = ${delayMs == null ? null : new Date(Date.now() + delayMs).toISOString()}
      WHERE id = ${id}`,
  };

  function queueCreate(id) {
    setImmediate(() => {
      const cfg = azdoCfg();
      AZ.syncAction({ actionId: id, repo, client: azdoClient(cfg), ctxFor, writeEnabled: cfg.writeEnabled, log: console.log })
        .catch(e => console.error('❌ retro azdo:', e.message));
    });
  }

  // Ação que já tem work item: propaga título/descrição/tags/responsável (e estado, se informado).
  function queueUpdate(id, adoState) {
    setImmediate(async () => {
      const cfg = azdoCfg();
      const a = await getAction(id).catch(() => null);
      if (!a?.azdo_work_item_id) return;
      if (!cfg.writeEnabled) { console.log(`[retro] escrita desligada — atualização do work item #${a.azdo_work_item_id} só simulada`); return; }
      try {
        const client = azdoClient(cfg);
        const ctx = await ctxFor(a);
        const wi = await client.getWorkItem(a.azdo_work_item_id);
        const patch = [...AZ.buildUpdatePatch(a, ctx, wi?.fields?.['System.Tags'] || '', a.azdo_managed_tags || []),
          ...(adoState ? AZ.buildStatePatch(adoState) : [])];
        await client.updateWorkItem(a.azdo_work_item_id, patch);
        // Estado empurrado daqui vira o "último visto": a volta do ADO não reage à nossa própria mudança.
        await db()`UPDATE retro_action SET azdo_managed_tags = ${JSON.stringify(AZ.managedTags(a, ctx))}::jsonb,
          azdo_sync_status = 'ok', azdo_sync_error = NULL, azdo_synced_at = NOW(),
          azdo_last_state = COALESCE(${adoState || null}, azdo_last_state) WHERE id = ${id}`;
      } catch (e) {
        console.error(`❌ retro: falha ao atualizar work item #${a.azdo_work_item_id}: ${e.message}`);
        await db()`UPDATE retro_action SET azdo_sync_status = 'erro', azdo_sync_error = ${String(e.message).slice(0, 500)} WHERE id = ${id}`.catch(() => {});
      }
    });
  }

  // Reenvio em background: criações pendentes/com erro cujo backoff venceu (e simuladas, se a escrita foi ligada).
  schedule.scheduleJob('*/5 * * * *', async () => {
    if (!getSql()) return;
    try {
      const cfg = azdoCfg();
      const rows = await db()`
        SELECT id FROM retro_action
        WHERE azdo_work_item_id IS NULL AND state IN ('aberta','andamento','validacao','concluida')
          AND (azdo_sync_status = 'pendente'
            OR (azdo_sync_status = 'erro' AND azdo_next_attempt_at <= NOW())
            OR (azdo_sync_status = 'simulado' AND ${cfg.writeEnabled})
            OR (azdo_sync_status = 'enviando' AND azdo_claimed_at < NOW() - INTERVAL '10 minutes'))
        LIMIT 20`;
      for (const { id } of rows) {
        await AZ.syncAction({ actionId: id, repo, client: azdoClient(cfg), ctxFor, writeEnabled: cfg.writeEnabled, log: console.log });
      }
      await reconcileFromWorkItems();
    } catch (e) { console.error('❌ retro job:', e.message); }
  });

  // Fase 2 — volta do Azure DevOps: o sync de 30 min (syncData) já grava o estado de cada work item em
  // work_items. Aqui comparamos com as ações ligadas e movemos/anotamos quando o estado mudou desde a última vez.
  async function reconcileFromWorkItems() {
    const sql = db();
    const rows = await sql`
      SELECT a.id, a.state, a.azdo_work_item_id, a.azdo_last_state, w.state AS ado_state
      FROM retro_action a JOIN work_items w ON w.work_item_id = a.azdo_work_item_id
      WHERE a.azdo_work_item_id IS NOT NULL AND w.state IS NOT NULL AND w.state IS DISTINCT FROM a.azdo_last_state`;
    for (const r of rows) {
      const change = R.reconcileFromAdo(r, r.ado_state);
      // Mesmo sem mudança registra que esse estado já foi visto. "AND state = …": se alguém mexeu na ação no
      // mesmo instante, não sobrescreve nem anota — a próxima rodada reavalia.
      const done = await sql`UPDATE retro_action SET azdo_last_state = ${r.ado_state},
        state = COALESCE(${change?.state ?? null}, state),
        state_changed_at = CASE WHEN ${change?.state ?? null}::text IS NULL THEN state_changed_at ELSE NOW() END
        WHERE id = ${r.id} AND state = ${r.state} AND azdo_last_state IS NOT DISTINCT FROM ${r.azdo_last_state}
        RETURNING id`; // azdo_last_state na condição: duas reconciliações simultâneas não anotam duas vezes
      if (change && done.length) {
        await sql`INSERT INTO retro_action_update (action_id, author_id, text) VALUES (${r.id}, NULL, ${change.note})`;
        console.log(`[retro] ação ${r.id}: work item #${r.azdo_work_item_id} → "${r.ado_state}"${change.state ? ` (ação para ${change.state})` : ''}`);
      }
    }
    return rows.length;
  }

  // ---- IA
  async function askJson(prompt, timeoutMs = 60000) {
    if (!isAiConfigured()) throw fail(503, 'IA não configurada no servidor (GEMINI_API_KEY).');
    const raw = await callGemini(prompt, { timeoutMs, json: true });
    if (!raw) throw fail(502, 'A IA não respondeu agora. Tente de novo em instantes.');
    try { return R.extractJson(raw); } catch { throw fail(502, 'A IA respondeu num formato inválido. Tente de novo.'); }
  }

  // ================================================================ rotas
  router.get('/config', wrap(async (req, res) => {
    const cfg = azdoCfg();
    res.json({
      teams: await getTeams(), isLeader: R.isLeader(req.user), aiAvailable: isAiConfigured(),
      azdo: { writeEnabled: cfg.writeEnabled, workItemType: cfg.workItemType, team: cfg.team },
    });
  }));

  // Força a volta do Azure DevOps agora (normalmente roda a cada 5 min, lendo o que o sync de 30 min trouxe).
  router.post('/azdo/reconcile', leaderOnly, wrap(async (req, res) => {
    res.json({ checked: await reconcileFromWorkItems() });
  }));

  router.post('/ai/structure-pdf', wrap(async (req, res) => {
    const text = str(req.body?.text, 30000);
    if (!text) throw fail(400, 'Texto do PDF vazio');
    res.json(await askJson(P.pdfStructurePrompt(text), 90000));
  }));

  // ---- Pessoas (DevTracker) + quem trabalhou em cada time nos últimos 180 dias
  router.get('/people', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const people = await sql`SELECT id, name, active FROM devtracker_developers ORDER BY name`;
    const since = new Date(Date.now() - 180 * 86400000).toISOString();
    const rows = await sql`
      SELECT DISTINCT team, assigned_to FROM work_items
      WHERE team = ANY(${teams.map(t => t.key)}) AND assigned_to IS NOT NULL AND changed_date >= ${since}`;
    const idByName = new Map(people.map(p => [R.norm(p.name), p.id]));
    const byTeam = Object.fromEntries(teams.map(t => [t.key, []]));
    for (const r of rows) {
      const id = idByName.get(R.norm(r.assigned_to));
      if (id && !byTeam[r.team].includes(id)) byTeam[r.team].push(id);
    }
    res.json({ people, byTeam });
  }));

  // ---- Tipos de ação
  router.get('/types', wrap(async (req, res) => res.json(await getTypes())));

  router.put('/types', leaderOnly, wrap(async (req, res) => {
    const sql = db();
    const list = Array.isArray(req.body?.types) ? req.body.types : null;
    if (!list) throw fail(400, 'Envie a lista de tipos');
    const names = new Set();
    const clean = list.map((t, i) => {
      const name = str(t?.name, 60);
      if (!name) throw fail(400, 'Todo tipo precisa de nome');
      if (names.has(R.norm(name))) throw fail(400, `Tipo repetido: ${name}`);
      names.add(R.norm(name));
      const hue = Number.isInteger(t?.hue) && t.hue >= 0 && t.hue <= 359 ? t.hue : HUES[i % HUES.length];
      return { id: str(t?.id, 80) || null, name, hue, sort_order: i };
    });
    const before = await getTypes();
    const keepIds = clean.map(t => t.id).filter(Boolean);
    const removed = before.filter(t => !keepIds.includes(t.id)).map(t => t.id);
    const renamed = clean.filter(t => t.id && before.find(b => b.id === t.id && b.name !== t.name)).map(t => t.id);
    // ações com work item afetadas (pra recalcular System.Tags no ADO)
    const affected = (await sql`SELECT DISTINCT a.id FROM retro_action a JOIN retro_action_type_link l ON l.action_id = a.id
      WHERE a.azdo_work_item_id IS NOT NULL AND l.type_id = ANY(${[...removed, ...renamed]})`).map(r => r.id);
    // nomes são UNIQUE: libera os nomes antes de regravar (troca de nome entre dois tipos)
    for (const t of clean.filter(c => c.id)) await sql`UPDATE retro_action_type SET name = ${`__tmp_${t.id}`} WHERE id = ${t.id}`;
    await sql`DELETE FROM retro_action_type WHERE id = ANY(${removed})`;
    for (const t of clean) {
      const id = t.id || R.newId(t.name);
      await sql`
        INSERT INTO retro_action_type (id, name, hue, sort_order, created_by) VALUES (${id}, ${t.name}, ${t.hue}, ${t.sort_order}, ${req.user.id})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, hue = EXCLUDED.hue, sort_order = EXCLUDED.sort_order, active = true`;
    }
    affected.forEach(id => queueUpdate(id));
    res.json(await getTypes());
  }));

  // ---- Retros
  router.get('/retros', wrap(async (req, res) => {
    const rows = await db()`
      SELECT r.id, r.team_key, r.title, to_char(r.date, 'YYYY-MM-DD') AS date, r.source_file, r.stats, r.insights, r.created_at,
        u.username AS created_by_name,
        (SELECT count(*)::int FROM retro_action a WHERE a.retro_id = r.id AND a.state <> 'descartada') AS actions_count
      FROM retro r LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.date DESC NULLS LAST, r.created_at DESC`;
    res.json(rows.map(r => toRetroDto(r, false)));
  }));

  router.get('/retros/:id', wrap(async (req, res) => {
    const rows = await db()`
      SELECT r.*, to_char(r.date, 'YYYY-MM-DD') AS date, u.username AS created_by_name
      FROM retro r LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ${req.params.id}`;
    if (!rows.length) throw fail(404, 'Retro não encontrada');
    const actions = await listActions(`a.retro_id = $1 AND a.state <> 'descartada'`, [req.params.id]);
    res.json({ ...toRetroDto(rows[0], true), actions: actions.map(toActionDto) });
  }));

  // Importação (lote já estruturado pelo frontend).
  router.post('/retros', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const items = Array.isArray(req.body?.retros) ? req.body.retros : [];
    if (!items.length) throw fail(400, 'Nenhuma retro enviada');
    if (items.length > 20) throw fail(400, 'Importe no máximo 20 retros por vez');
    // Valida o lote inteiro antes de gravar: um arquivo ruim não deixa os anteriores salvos pela metade.
    const valid = items.map((it, i) => {
      if (!teams.some(t => t.key === it?.teamKey)) throw fail(400, `Retro ${i + 1}: time inválido (${it?.teamKey || 'vazio'})`);
      const title = str(it.title, 200);
      if (!title) throw fail(400, `Retro ${i + 1}: falta o título`);
      if (it.date && !isoDate(it.date)) throw fail(400, `Retro ${i + 1}: data inválida (${it.date})`);
      return { ...it, title, columns: cleanColumns(it.columns), date: isoDate(it.date) };
    });
    const created = [];
    for (const it of valid) {
      const { title, columns, date } = it;
      const id = R.newId(`${it.teamKey}-${date || 'retro'}`);
      await sql`
        INSERT INTO retro (id, team_key, title, date, source_file, columns, stats, created_by)
        VALUES (${id}, ${it.teamKey}, ${title}, ${date}, ${str(it.sourceFile, 255) || null}, ${JSON.stringify(columns)}::jsonb,
          ${JSON.stringify(statsOf(columns))}::jsonb, ${req.user.id})`;
      created.push({ id, teamKey: it.teamKey, title, date });
    }
    res.status(201).json({ created });
  }));

  router.patch('/retros/:id', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const cur = (await sql`SELECT id, team_key, title, to_char(date, 'YYYY-MM-DD') AS date FROM retro WHERE id = ${req.params.id}`)[0];
    if (!cur) throw fail(404, 'Retro não encontrada');
    const b = req.body || {};
    const teamKey = b.teamKey !== undefined ? b.teamKey : cur.team_key;
    if (!teams.some(t => t.key === teamKey)) throw fail(400, 'Time inválido');
    const title = b.title !== undefined ? str(b.title, 200) : cur.title;
    if (!title) throw fail(400, 'O título não pode ficar vazio');
    const date = b.date !== undefined ? isoDate(b.date) : cur.date;
    await sql`UPDATE retro SET team_key = ${teamKey}, title = ${title}, date = ${date} WHERE id = ${cur.id}`;
    if (teamKey !== cur.team_key) {
      const moved = await sql`UPDATE retro_action SET team_key = ${teamKey} WHERE retro_id = ${cur.id} RETURNING id, azdo_work_item_id`;
      moved.filter(m => m.azdo_work_item_id).forEach(m => queueUpdate(m.id));
    }
    res.json({ id: cur.id, teamKey, title, date });
  }));

  // Excluir retro: apaga as sugestões ainda não aprovadas; ações aprovadas (e descartadas) ficam, sem vínculo.
  router.delete('/retros/:id', leaderOnly, wrap(async (req, res) => {
    const sql = db();
    const del = await sql`DELETE FROM retro_action WHERE retro_id = ${req.params.id} AND state = 'sugerida' RETURNING id`;
    const r = await sql`DELETE FROM retro WHERE id = ${req.params.id} RETURNING id`;
    if (!r.length) throw fail(404, 'Retro não encontrada');
    res.json({ deleted: true, suggestionsDeleted: del.length });
  }));

  // Leitura da retro + sugestões (prompt A.2).
  router.post('/retros/:id/analyze', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const r = (await sql`SELECT *, to_char(date, 'YYYY-MM-DD') AS date FROM retro WHERE id = ${req.params.id}`)[0];
    if (!r) throw fail(404, 'Retro não encontrada');
    const types = await getTypes();
    const existing = await sql`SELECT title, state FROM retro_action WHERE team_key = ${r.team_key} ORDER BY created_at DESC`;
    const res1 = await askJson(P.retroAnalysisPrompt({
      retro: r, teamLabel: teamLabel(teams, r.team_key),
      existingActions: existing.filter(a => a.state !== 'descartada'), typeNames: types.map(t => t.name),
    }));
    const insights = { ...R.sanitizeInsights(res1), gerado_em: new Date().toISOString(), gerado_por: req.user.username };
    await sql`UPDATE retro SET insights = ${JSON.stringify(insights)}::jsonb WHERE id = ${r.id}`;
    const developers = await sql`SELECT id, name FROM devtracker_developers`;
    const suggestions = R.buildSuggestions(res1?.acoes, {
      existingTitles: existing.map(a => a.title), types, teamKey: r.team_key, retroId: r.id, developers,
    });
    for (const s of suggestions) {
      const id = R.newId(`${r.team_key}-${s.title}`);
      await sql`
        INSERT INTO retro_action (id, retro_id, team_key, title, detail, origin, priority, owner_id, owner_name_fallback, recurring, state, source, created_by)
        VALUES (${id}, ${r.id}, ${r.team_key}, ${s.title}, ${s.detail}, ${JSON.stringify(s.origin)}::jsonb, ${s.priority},
          ${s.owner_id}, ${s.owner_name_fallback}, ${s.recurring}, 'sugerida', 'ia', ${req.user.id})`;
      await setTypes(id, s.typeIds);
    }
    res.json({ insights, created: suggestions.length });
  }));

  // ---- Ações
  router.get('/actions', wrap(async (req, res) => {
    res.json((await listActions()).map(toActionDto));
  }));

  router.get('/actions/:id', wrap(async (req, res) => {
    const a = await getAction(req.params.id);
    if (!a) throw fail(404, 'Ação não encontrada');
    const updates = await db()`
      SELECT u.id, u.text, u.created_at, COALESCE(us.username, 'Azure DevOps') AS author_name FROM retro_action_update u
      LEFT JOIN users us ON us.id = u.author_id WHERE u.action_id = ${a.id} ORDER BY u.created_at`;
    res.json({ ...toActionDto(a), updates: updates.map(u => ({ id: u.id, text: u.text, createdAt: u.created_at, authorName: u.author_name })) });
  }));

  // Nova ação: líder cria já aprovada (A fazer → vai pro ADO); demais membros criam uma sugestão.
  router.post('/actions', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const b = req.body || {};
    if (!teams.some(t => t.key === b.teamKey)) throw fail(400, 'Escolha o time');
    const title = str(b.title, 140);
    if (!title) throw fail(400, 'Informe o título');
    const leader = R.isLeader(req.user);
    const ownerId = await assertOwner(b.ownerId);
    const fallback = str(b.ownerNameFallback, 120) || null;
    if (leader && !ownerId && !fallback) throw fail(400, 'Escolha o responsável');
    const retroId = b.retroId ? (await sql`SELECT id FROM retro WHERE id = ${b.retroId}`)[0]?.id || null : null;
    const id = R.newId(`${b.teamKey}-${title}`);
    const recurring = bool(b.recurring);
    await sql`
      INSERT INTO retro_action (id, retro_id, team_key, title, detail, origin, priority, owner_id, owner_name_fallback, due_date, recurring,
        state, source, created_by, approved_at, approved_by, state_changed_at, azdo_sync_status)
      VALUES (${id}, ${retroId}, ${b.teamKey}, ${title}, ${str(b.detail, 2000)},
        ${JSON.stringify((Array.isArray(b.origin) ? b.origin : []).map(o => str(o, 280)).filter(Boolean).slice(0, 5))}::jsonb,
        ${R.PRIORITIES.includes(b.priority) ? b.priority : 'media'}, ${ownerId}, ${fallback}, ${recurring ? null : isoDate(b.dueDate)}, ${recurring},
        ${leader ? 'aberta' : 'sugerida'}, 'manual', ${req.user.id},
        ${leader ? new Date().toISOString() : null}, ${leader ? req.user.id : null}, ${leader ? new Date().toISOString() : null},
        ${leader ? 'pendente' : null})`;
    await setTypes(id, Array.isArray(b.typeIds) ? b.typeIds : []);
    if (leader) queueCreate(id);
    res.status(201).json(toActionDto(await getAction(id)));
  }));

  router.patch('/actions/:id', wrap(async (req, res) => {
    const teams = await getTeams();
    const before = await getAction(req.params.id);
    if (!before) throw fail(404, 'Ação não encontrada');
    if (before.state === 'concluida' && !R.isLeader(req.user)) throw fail(403, 'Ação fechada: só a liderança edita.');
    const a = await applyEdits(req.params.id, req.body || {}, teams);
    if (a.azdo_work_item_id) queueUpdate(a.id);
    res.json(toActionDto(a));
  }));

  // Aprovar (aceita as edições feitas no card da sugestão no mesmo request).
  router.post('/actions/:id/approve', leaderOnly, wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const cur = await getAction(req.params.id);
    if (!cur) throw fail(404, 'Ação não encontrada');
    if (cur.state !== 'sugerida') throw fail(409, 'Esta ação já foi aprovada ou descartada.');
    // Valida com os valores que ficariam depois da edição ANTES de gravar: aprovação recusada não salva nada.
    const b = req.body || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    const err = R.approveError({
      state: cur.state,
      title: has('title') ? str(b.title, 140) : cur.title,
      owner_id: has('ownerId') ? (b.ownerId || null) : cur.owner_id,
      owner_name_fallback: has('ownerNameFallback') ? str(b.ownerNameFallback, 120) : cur.owner_name_fallback,
    });
    if (err) throw fail(400, err);
    await applyEdits(cur.id, b, teams);
    // UPDATE condicional: aprovar duas vezes (duplo clique, duas abas) só vale uma vez.
    const ok = await sql`
      UPDATE retro_action SET state = 'aberta', approved_at = NOW(), approved_by = ${req.user.id}, state_changed_at = NOW(),
        azdo_sync_status = CASE WHEN azdo_work_item_id IS NULL THEN 'pendente' ELSE azdo_sync_status END,
        azdo_attempts = CASE WHEN azdo_work_item_id IS NULL THEN 0 ELSE azdo_attempts END
      WHERE id = ${cur.id} AND state = 'sugerida' RETURNING id, azdo_work_item_id`;
    if (!ok.length) throw fail(409, 'Esta ação já foi aprovada.');
    if (ok[0].azdo_work_item_id) queueUpdate(cur.id, 'New'); // voltou das descartadas: reativa o item
    else queueCreate(cur.id);
    res.json(toActionDto(await getAction(cur.id)));
  }));

  router.post('/actions/:id/discard', leaderOnly, wrap(async (req, res) => {
    const rows = await db()`
      UPDATE retro_action SET state = 'descartada', state_changed_at = NOW()
      WHERE id = ${req.params.id} AND state <> 'descartada' RETURNING id, azdo_work_item_id`;
    if (!rows.length) throw fail(404, 'Ação não encontrada ou já descartada');
    if (rows[0].azdo_work_item_id) queueUpdate(rows[0].id, 'Removed');
    res.json(toActionDto(await getAction(req.params.id)));
  }));

  router.post('/actions/:id/restore', leaderOnly, wrap(async (req, res) => {
    const rows = await db()`
      UPDATE retro_action SET state = 'sugerida', state_changed_at = NOW()
      WHERE id = ${req.params.id} AND state = 'descartada' RETURNING id`;
    if (!rows.length) throw fail(404, 'Ação não encontrada nas descartadas');
    res.json(toActionDto(await getAction(req.params.id)));
  }));

  router.post('/actions/:id/move', wrap(async (req, res) => {
    const sql = db();
    const to = req.body?.state;
    const cur = await getAction(req.params.id);
    if (!cur) throw fail(404, 'Ação não encontrada');
    const err = R.moveError(cur.state, to, R.isLeader(req.user));
    if (err) throw fail(err === R.LEADER_ONLY_MSG ? 403 : 400, err);
    if (cur.state !== to) {
      const moved = await sql`
        UPDATE retro_action SET state = ${to}, state_changed_at = NOW(),
          closed_at = ${to === 'concluida' ? new Date().toISOString() : null},
          closed_by = ${to === 'concluida' ? req.user.id : null}
        WHERE id = ${cur.id} AND state = ${cur.state} RETURNING id`;
      // Fechar/reabrir aqui espelha no board Kaizen (as outras colunas são só nossas).
      if (moved.length && cur.azdo_work_item_id) {
        if (to === 'concluida') queueUpdate(cur.id, 'Closed');
        else if (cur.state === 'concluida') queueUpdate(cur.id, 'Active');
      }
    }
    res.json(toActionDto(await getAction(cur.id)));
  }));

  router.delete('/actions/:id', leaderOnly, wrap(async (req, res) => {
    const cur = await getAction(req.params.id);
    if (!cur) throw fail(404, 'Ação não encontrada');
    if (cur.azdo_work_item_id && azdoCfg().writeEnabled) {
      // tira o item do board antes de apagar a ação (depois não teria mais de onde ler o id)
      try { await azdoClient(azdoCfg()).updateWorkItem(cur.azdo_work_item_id, AZ.buildStatePatch('Removed')); } catch (e) {
        console.warn(`⚠️ retro: não deu pra remover o work item #${cur.azdo_work_item_id}: ${e.message}`);
      }
    }
    await db()`DELETE FROM retro_action WHERE id = ${cur.id}`;
    res.json({ deleted: true });
  }));

  router.post('/actions/:id/updates', wrap(async (req, res) => {
    const text = str(req.body?.text, 2000);
    if (!text) throw fail(400, 'Escreva a atualização');
    const sql = db();
    if (!(await sql`SELECT id FROM retro_action WHERE id = ${req.params.id}`).length) throw fail(404, 'Ação não encontrada');
    const [u] = await sql`INSERT INTO retro_action_update (action_id, author_id, text) VALUES (${req.params.id}, ${req.user.id}, ${text}) RETURNING id, text, created_at`;
    res.status(201).json({ id: u.id, text: u.text, createdAt: u.created_at, authorName: req.user.username });
  }));

  // "Tentar de novo" no card: recria (sem id) ou reaplica a atualização (com id).
  router.post('/actions/:id/azdo-retry', wrap(async (req, res) => {
    const sql = db();
    const cur = await getAction(req.params.id);
    if (!cur) throw fail(404, 'Ação não encontrada');
    if (!R.LIVE.includes(cur.state)) throw fail(400, 'Só ações aprovadas vão para o Azure DevOps');
    if (cur.azdo_work_item_id) {
      queueUpdate(cur.id);
    } else {
      await sql`UPDATE retro_action SET azdo_sync_status = 'pendente', azdo_attempts = 0, azdo_next_attempt_at = NULL
        WHERE id = ${cur.id} AND azdo_work_item_id IS NULL AND azdo_sync_status IN ('erro','simulado','pendente')`;
      queueCreate(cur.id);
    }
    res.json({ queued: true });
  }));

  // ---- Times: quais aparecem na Retrô (liderança escolhe entre os times que o sync traz do Azure DevOps)
  router.get('/azdo-teams', leaderOnly, wrap(async (req, res) => {
    const rows = await db()`SELECT team, count(*)::int AS items FROM work_items WHERE team IS NOT NULL AND team <> '' GROUP BY team ORDER BY team`;
    res.json(rows.map(r => ({ key: r.team, items: r.items })));
  }));

  router.put('/teams', leaderOnly, wrap(async (req, res) => {
    const sql = db();
    const current = await getTeams();
    const available = (await sql`SELECT DISTINCT team FROM work_items WHERE team IS NOT NULL AND team <> ''`).map(r => r.team);
    const { error, teams } = R.cleanTeams(req.body?.teams, available, current);
    if (error) throw fail(400, error);
    const removed = current.filter(c => !teams.some(t => t.key === c.key)).map(c => c.key);
    const used = removed.length ? await sql`
      SELECT team_key FROM retro WHERE team_key = ANY(${removed})
      UNION SELECT team_key FROM retro_action WHERE team_key = ANY(${removed})` : [];
    if (used.length) throw fail(400, `Não dá para tirar ${used.map(u => teamLabel(current, u.team_key)).join(', ')}: já tem retros ou ações.`);
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'retro_config'`;
    let cfg = {};
    try { cfg = JSON.parse(rows[0]?.value || '{}') || {}; } catch { /* config inválida: regrava */ }
    await sql`
      INSERT INTO app_settings (key, value, updated_by, updated_at)
      VALUES ('retro_config', ${JSON.stringify({ ...cfg, teams })}, ${req.user.username}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`;
    res.json(teams);
  }));

  // ---- Times (acompanhamento)
  router.get('/teams', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const retros = await sql`SELECT team_key, to_char(date, 'YYYY-MM-DD') AS date, insights, created_at FROM retro`;
    const actions = (await listActions()).map(toActionDto);
    const feedbacks = await sql`SELECT f.team_key, f.feedback, f.generated_at, u.username AS generated_by_name
      FROM team_retro_feedback f LEFT JOIN users u ON u.id = f.generated_by`;
    res.json(teams.map(t => {
      const tr = retros.filter(r => r.team_key === t.key).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const ta = actions.filter(a => a.teamKey === t.key && a.state !== 'descartada');
      const live = ta.filter(a => R.LIVE.includes(a.state));
      const count = (s) => ta.filter(a => a.state === s).length;
      const temas = new Map();
      for (const r of tr) for (const tm of r.insights?.temas || []) {
        const k = R.norm(tm.tema);
        const e = temas.get(k) || { tema: tm.tema, tom: tm.tom, count: 0 };
        e.count++; if (tm.tom === 'critico') e.tom = 'critico';
        temas.set(k, e);
      }
      const typeCounts = {};
      for (const a of ta) for (const id of a.typeIds) typeCounts[id] = (typeCounts[id] || 0) + 1;
      const fb = feedbacks.find(f => f.team_key === t.key);
      return {
        ...t,
        retros: tr.length, lastRetroDate: tr[0]?.date || null,
        counts: { aberta: count('aberta'), andamento: count('andamento'), validacao: count('validacao'), concluida: count('concluida'),
          atrasadas: ta.filter(a => a.late).length, sugeridas: count('sugerida') },
        closedPct: live.length ? Math.round((count('concluida') / live.length) * 100) : 0,
        temas: [...temas.values()].sort((a, b) => b.count - a.count || (b.tom === 'critico') - (a.tom === 'critico')).slice(0, 6),
        typeCounts: Object.entries(typeCounts).map(([typeId, n]) => ({ typeId, count: n })).sort((a, b) => b.count - a.count),
        elogios: tr.flatMap(r => r.insights?.elogios || []).slice(0, 4),
        feedback: fb ? { ...fb.feedback, generatedAt: fb.generated_at, generatedByName: fb.generated_by_name } : null,
      };
    }));
  }));

  router.post('/teams/:key/feedback', wrap(async (req, res) => {
    const sql = db();
    const teams = await getTeams();
    const team = teams.find(t => t.key === req.params.key);
    if (!team) throw fail(404, 'Time não encontrado');
    const retros = await sql`SELECT title, to_char(date, 'YYYY-MM-DD') AS date, columns, insights FROM retro WHERE team_key = ${team.key} ORDER BY date NULLS FIRST, created_at`;
    const types = await getTypes();
    const actions = (await listActions(`a.team_key = $1 AND a.state NOT IN ('descartada')`, [team.key])).map(a => ({
      ...a, ownerName: a.owner_name || a.owner_name_fallback, late: R.isLate(a), updatesCount: a.updates_count,
      typeNames: (a.type_ids || []).map(id => types.find(t => t.id === id)?.name).filter(Boolean),
    }));
    if (!retros.length && !actions.length) throw fail(400, 'Este time ainda não tem retros nem ações');
    const fb = R.sanitizeFeedback(await askJson(P.teamFeedbackPrompt({ teamLabel: team.label, today: R.todayStr(), retros, actions })));
    await sql`
      INSERT INTO team_retro_feedback (team_key, feedback, generated_at, generated_by) VALUES (${team.key}, ${JSON.stringify(fb)}::jsonb, NOW(), ${req.user.id})
      ON CONFLICT (team_key) DO UPDATE SET feedback = EXCLUDED.feedback, generated_at = NOW(), generated_by = EXCLUDED.generated_by`;
    res.json({ ...fb, generatedAt: new Date().toISOString(), generatedByName: req.user.username });
  }));

  app.use('/api/retro', router);
  console.log('✅ Retrô routes registered (/api/retro)');
}

// ---------------------------------------------------------------- carga inicial (docs/retro/retro-dados-iniciais.json)
// Idempotente (upsert por id). Não dispara o Azure DevOps: as 34 ações entram como 'sugerida'.
async function seedRetro(sql, data, { teams = DEFAULT_TEAMS, log = console.log } = {}) {
  const teamKeyOf = (name) => {
    const n = R.norm(name);
    return teams.find(t => [t.label, t.key, ...(t.aliases || [])].some(x => R.norm(x) === n))?.key || null;
  };
  const missingTeams = new Set();
  for (const t of data.tags || []) {
    await sql`
      INSERT INTO retro_action_type (id, name, hue, sort_order) VALUES (${t.id}, ${t.name}, ${t.hue ?? 205}, ${t.order ?? 99})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, hue = EXCLUDED.hue, sort_order = EXCLUDED.sort_order, active = true`;
  }
  let retros = 0;
  for (const r of data.retros || []) {
    const key = teamKeyOf(r.team);
    if (!key) { missingTeams.add(r.team); continue; }
    const cols = cleanColumns(r.columns);
    await sql`
      INSERT INTO retro (id, team_key, title, date, source_file, columns, stats, insights, created_at)
      VALUES (${r.id}, ${key}, ${r.title}, ${isoDate(r.date)}, ${r.source || null}, ${JSON.stringify(cols)}::jsonb,
        ${JSON.stringify(statsOf(cols))}::jsonb, ${r.insights ? JSON.stringify({ ...R.sanitizeInsights(r.insights), gerado_em: r.insights.at || null, gerado_por: 'carga inicial' }) : null}::jsonb,
        ${r.createdAt || new Date().toISOString()})
      ON CONFLICT (id) DO UPDATE SET team_key = EXCLUDED.team_key, title = EXCLUDED.title, date = EXCLUDED.date, columns = EXCLUDED.columns,
        stats = EXCLUDED.stats, insights = EXCLUDED.insights`;
    retros++;
  }
  const developers = await sql`SELECT id, name FROM devtracker_developers`;
  const unmatchedOwners = new Set();
  let actions = 0;
  for (const a of data.actions || []) {
    const key = teamKeyOf(a.team);
    if (!key) { missingTeams.add(a.team); continue; }
    const owner = R.matchOwner(a.owner, developers);
    if (a.owner && (!owner.owner_id || owner.owner_name_fallback)) unmatchedOwners.add(a.owner);
    const retroExists = a.retroId && (await sql`SELECT 1 FROM retro WHERE id = ${a.retroId}`).length;
    await sql`
      INSERT INTO retro_action (id, retro_id, team_key, title, detail, origin, priority, owner_id, owner_name_fallback, due_date, recurring, state, source, created_at)
      VALUES (${a.id}, ${retroExists ? a.retroId : null}, ${key}, ${a.title}, ${a.detail || ''}, ${JSON.stringify(a.origin || [])}::jsonb,
        ${R.PRIORITIES.includes(a.priority) ? a.priority : 'media'}, ${owner.owner_id}, ${owner.owner_name_fallback},
        ${a.recurring ? null : isoDate(a.due)}, ${!!a.recurring}, 'sugerida', ${a.source === 'manual' ? 'manual' : 'ia'}, ${a.createdAt || new Date().toISOString()})
      ON CONFLICT (id) DO NOTHING`;
    for (const t of a.tags || []) {
      await sql`INSERT INTO retro_action_type_link (action_id, type_id) SELECT ${a.id}, ${t} WHERE EXISTS (SELECT 1 FROM retro_action_type WHERE id = ${t}) ON CONFLICT DO NOTHING`;
    }
    actions++;
  }
  log(`Retrô: ${(data.tags || []).length} tipos, ${retros} retros, ${actions} ações (sugeridas).`);
  if (missingTeams.size) log(`Times não encontrados (ignorados): ${[...missingTeams].join(', ')}`);
  if (unmatchedOwners.size) log(`Responsáveis guardados como texto (sem casamento único no DevTracker): ${[...unmatchedOwners].join(', ')}`);
  return { types: (data.tags || []).length, retros, actions, missingTeams: [...missingTeams], unmatchedOwners: [...unmatchedOwners] };
}

module.exports = { initRetroSchema, registerRetro, seedRetro, DEFAULT_TEAMS };
