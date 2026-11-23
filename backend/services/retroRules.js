// backend/services/retroRules.js
// Regras puras da aba Retrô (estados, permissões, ordenação, sanitização das respostas da IA, casamento de
// responsável). Sem I/O — testado em retroRules.check.js. O port .NET (DSMetricsDotNet RetroRules.cs) segue
// exatamente estas regras.

const STATES = ['sugerida', 'aberta', 'andamento', 'validacao', 'concluida', 'descartada'];
const LIVE = ['aberta', 'andamento', 'validacao', 'concluida'];
const PRIORITIES = ['alta', 'media', 'baixa'];
const PRI_ORDER = { alta: 0, media: 1, baixa: 2 };
const TONES = ['positivo', 'atencao', 'critico'];
const LEADER_ROLES = ['admin', 'GESTOR'];
const LEADER_ONLY_MSG = 'Só a liderança fecha ou reabre ações. Quando terminar, mova para Validar.';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const newId = (base) => `${slug(base).slice(0, 40) || 'x'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isLeader = (user) => !!user && LEADER_ROLES.includes(user.role);
const todayStr = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Movimento no quadro (drag-and-drop / select de estado). Retorna null se pode, ou a mensagem de erro.
function moveError(from, to, leader) {
  if (!LIVE.includes(to)) return 'Estado inválido para o quadro';
  if (!LIVE.includes(from)) return 'Só ações aprovadas se movem no quadro';
  if (from === to) return null;
  if ((to === 'concluida' || from === 'concluida') && !leader) return LEADER_ONLY_MSG;
  return null;
}

// Aprovar exige título e responsável (pessoa do cadastro ou nome livre).
function approveError(action) {
  if (!action) return 'Ação não encontrada';
  if (action.state !== 'sugerida') return 'Só sugestões podem ser aprovadas';
  if (!String(action.title || '').trim()) return 'Informe o título antes de aprovar';
  if (!action.owner_id && !String(action.owner_name_fallback || '').trim()) return 'Escolha o responsável antes de aprovar';
  return null;
}

const isLate = (a, today = todayStr()) =>
  !a.recurring && !!a.due_date && a.due_date < today && (a.state === 'aberta' || a.state === 'andamento');

// Atrasadas primeiro, depois prazo (sem prazo por último), depois prioridade.
function sortActions(list, today = todayStr()) {
  return [...list].sort((a, b) =>
    (isLate(b, today) - isLate(a, today))
    || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
    || (PRI_ORDER[a.priority] ?? 1) - (PRI_ORDER[b.priority] ?? 1));
}

// Coluna Fechada: mais recentes no topo.
const sortClosed = (list) => [...list].sort((a, b) =>
  String(b.state_changed_at || b.approved_at || '').localeCompare(String(a.state_changed_at || a.approved_at || '')));

// Nomes de tipo sugeridos pela IA → ids do catálogo. Ignora desconhecidos, sem repetir, no máximo 3.
function mapAiTags(names, types) {
  const out = [];
  for (const n of Array.isArray(names) ? names : []) {
    const t = types.find(x => norm(x.name) === norm(n));
    if (t && !out.includes(t.id)) out.push(t.id);
    if (out.length === 3) break;
  }
  return out;
}

const cut = (s, n) => String(s ?? '').trim().slice(0, n);

// Resposta do prompt A.2 → insights saneados (limites do protótipo).
function sanitizeInsights(res) {
  const r = res && typeof res === 'object' ? res : {};
  return {
    resumo: cut(r.resumo, 1200),
    temas: (Array.isArray(r.temas) ? r.temas : []).slice(0, 10)
      .map(t => ({ tema: cut(t?.tema, 80), tom: TONES.includes(t?.tom) ? t.tom : 'atencao', detalhe: cut(t?.detalhe, 240) }))
      .filter(t => t.tema),
    elogios: (Array.isArray(r.elogios) ? r.elogios : []).map(e => cut(e, 200)).filter(Boolean).slice(0, 8),
  };
}

// Sugestões da IA (prompt A.2) → ações 'sugerida'. No máximo 10 e sem repetir título (normalizado) já
// existente no time — inclusive descartadas, pra IA não ressuscitar o que a liderança já recusou.
function buildSuggestions(acoes, { existingTitles = [], types = [], teamKey, retroId, developers = [] } = {}) {
  const seen = new Set(existingTitles.map(norm));
  const out = [];
  for (const a of (Array.isArray(acoes) ? acoes : []).slice(0, 10)) {
    const title = cut(a?.titulo, 140);
    if (!title || seen.has(norm(title))) continue;
    seen.add(norm(title));
    out.push({
      title,
      detail: cut(a?.detalhe, 600),
      origin: (Array.isArray(a?.origem) ? a.origem : []).map(o => cut(o, 280)).filter(Boolean).slice(0, 3),
      priority: PRIORITIES.includes(a?.prioridade) ? a.prioridade : 'media',
      ...matchOwner(cut(a?.responsavel, 80), developers),
      recurring: a?.recorrente === true || a?.recorrente === 'true',
      typeIds: mapAiTags(a?.tags, types),
      team_key: teamKey,
      retro_id: retroId,
      state: 'sugerida',
      source: 'ia',
    });
  }
  return out;
}

// Resposta do prompt A.3 → feedback saneado.
function sanitizeFeedback(res) {
  const r = res && typeof res === 'object' ? res : {};
  const list = (x) => (Array.isArray(x) ? x : []).map(i => cut(i, 300)).filter(Boolean).slice(0, 3);
  return { mensagem: cut(r.mensagem, 1500), manter: list(r.manter), melhorar: list(r.melhorar), proximo_passo: cut(r.proximo_passo, 300) };
}

// Extrai o objeto JSON de uma resposta de LLM (com ou sem cercas ```json, com texto em volta). Lança se não houver.
function extractJson(text) {
  const s = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* tenta recortar o objeto */ }
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1));
  throw new Error('invalid_json');
}

// "Eloi e Igor" / "Ana, Bia" → ["Eloi", "Igor"] / ["Ana", "Bia"].
const splitOwners = (s) => String(s ?? '').split(/\s*(?:,|\/|;|&|\s+e\s+)\s*/i).map(x => x.trim()).filter(Boolean);

// Texto livre de responsável → pessoa do cadastro, só com casamento exato (nome completo normalizado ou primeiro
// nome único). Diferente do findUserByName (casa por substring e pode errar). Vários nomes: liga o primeiro que
// casar e guarda o texto original no fallback, pra ninguém sumir.
function matchOwner(text, developers = []) {
  const raw = String(text ?? '').trim();
  if (!raw) return { owner_id: null, owner_name_fallback: null };
  const names = splitOwners(raw);
  for (const n of names) {
    const nn = norm(n);
    let hits = developers.filter(d => norm(d.name) === nn);
    if (!hits.length) hits = developers.filter(d => norm(d.name).split(/\s+/)[0] === nn);
    if (hits.length === 1) return { owner_id: hits[0].id, owner_name_fallback: names.length > 1 ? raw : null };
  }
  return { owner_id: null, owner_name_fallback: raw };
}

// Retro → texto do prompt A.2 (votos entre colchetes, comentários com ↳), cortado em ~16 mil caracteres.
function retroText(retro, max = 16000) {
  const parts = [];
  for (const col of retro.columns || []) {
    parts.push(`## ${col.name}${col.description ? ` (${col.description})` : ''}`);
    for (const c of col.cards || []) {
      parts.push(`- ${String(c.t || '').replace(/\n+/g, ' / ')}${c.v ? ` [${c.v} votos]` : ''}`);
      for (const k of c.c || []) parts.push(`  ↳ comentário: ${k}`);
    }
  }
  const s = parts.join('\n');
  return s.length > max ? `${s.slice(0, max)}\n[…cortado]` : s;
}

// ---- Volta do Azure DevOps (fase 2): o sync de 30 min já traz o work item pra work_items; aqui decidimos o que
// muda na ação quando o estado do item mudou. Fechar continua sendo da liderança: item fechado lá → Validar aqui.
const ADO_DONE = ['closed', 'finished', 'pronto', 'done', 'resolved'];
const ADO_REMOVED = ['removed', 'disapproved'];
const ADO_TODO = ['new', 'ux/ui', 'para desenvolver', 'proposed', 'to do'];
function adoCategory(adoState) {
  const s = norm(adoState);
  if (!s) return null;
  if (ADO_DONE.includes(s)) return 'done';
  if (ADO_REMOVED.includes(s)) return 'removed';
  if (ADO_TODO.includes(s)) return 'todo';
  return 'doing';
}

// Retorna { state, note } (state null = não move) ou null se nada a fazer.
function reconcileFromAdo(action, adoState) {
  const cat = adoCategory(adoState);
  const ref = `Item #${action.azdo_work_item_id} no Azure DevOps`;
  if (cat === 'done' && ['aberta', 'andamento'].includes(action.state)) {
    return { state: 'validacao', note: `${ref} foi para "${adoState}". Ação movida para Validar: a liderança confere e fecha.` };
  }
  if (cat === 'doing' && action.state === 'aberta') {
    return { state: 'andamento', note: `${ref} entrou em andamento ("${adoState}").` };
  }
  if (cat === 'removed' && ['aberta', 'andamento', 'validacao'].includes(action.state)) {
    return { state: null, note: `${ref} foi removido ("${adoState}"). A liderança decide se descarta a ação.` };
  }
  return null;
}

module.exports = {
  adoCategory, reconcileFromAdo,
  STATES, LIVE, PRIORITIES, TONES, LEADER_ROLES, LEADER_ONLY_MSG,
  norm, slug, newId, isLeader, todayStr, moveError, approveError, isLate, sortActions, sortClosed,
  mapAiTags, sanitizeInsights, buildSuggestions, sanitizeFeedback, extractJson, splitOwners, matchOwner, retroText,
};
