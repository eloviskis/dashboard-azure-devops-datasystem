// Check das regras da Retrô. Sem framework — `node services/retroRules.check.js`.
const assert = require('node:assert/strict');
const R = require('./retroRules');

// ---- Permissões e transições ----
assert.equal(R.isLeader({ role: 'admin' }), true);
assert.equal(R.isLeader({ role: 'GESTOR' }), true);
for (const role of ['PO', 'DEV', 'QA', 'user']) assert.equal(R.isLeader({ role }), false, role);

assert.equal(R.moveError('aberta', 'andamento', false), null, 'membro move entre A fazer/Em andamento/Validar');
assert.equal(R.moveError('andamento', 'validacao', false), null);
assert.equal(R.moveError('validacao', 'aberta', false), null);
assert.equal(R.moveError('validacao', 'concluida', false), R.LEADER_ONLY_MSG, 'membro não fecha');
assert.equal(R.moveError('concluida', 'andamento', false), R.LEADER_ONLY_MSG, 'membro não reabre');
assert.equal(R.moveError('validacao', 'concluida', true), null, 'líder fecha');
assert.equal(R.moveError('concluida', 'validacao', true), null, 'líder reabre');
assert.ok(R.moveError('sugerida', 'aberta', true), 'sugestão só entra no quadro pela aprovação');
assert.ok(R.moveError('aberta', 'descartada', true), 'descartar é outra rota');

assert.equal(R.approveError({ state: 'sugerida', title: 'X', owner_id: 3 }), null);
assert.equal(R.approveError({ state: 'sugerida', title: 'X', owner_name_fallback: 'Fulano' }), null);
assert.match(R.approveError({ state: 'sugerida', title: ' ', owner_id: 3 }), /título/);
assert.match(R.approveError({ state: 'sugerida', title: 'X' }), /responsável/);
assert.match(R.approveError({ state: 'aberta', title: 'X', owner_id: 3 }), /Só sugestões/, 'aprovar duas vezes é recusado');

// ---- Atraso e ordenação (hoje = 2026-11-23) ----
const H = '2026-11-23';
assert.equal(R.isLate({ state: 'aberta', due_date: '2026-11-20' }, H), true);
assert.equal(R.isLate({ state: 'andamento', due_date: '2026-11-20', recurring: true }, H), false, 'recorrente nunca atrasa');
assert.equal(R.isLate({ state: 'validacao', due_date: '2026-11-20' }, H), false, 'entregue não conta como atrasada');
assert.equal(R.isLate({ state: 'aberta', due_date: '2026-11-23' }, H), false, 'vence hoje ainda não atrasou');
const ord = R.sortActions([
  { id: 'sem-prazo-alta', state: 'aberta', priority: 'alta' },
  { id: 'futuro-baixa', state: 'aberta', due_date: '2026-12-01', priority: 'baixa' },
  { id: 'futuro-alta', state: 'aberta', due_date: '2026-12-01', priority: 'alta' },
  { id: 'atrasada', state: 'aberta', due_date: '2026-11-01', priority: 'baixa' },
  { id: 'recorrente', state: 'aberta', recurring: true, priority: 'media' },
], H).map(a => a.id);
assert.deepEqual(ord, ['atrasada', 'futuro-alta', 'futuro-baixa', 'sem-prazo-alta', 'recorrente']);
assert.deepEqual(R.sortClosed([{ id: 'a', state_changed_at: '2026-11-01' }, { id: 'b', state_changed_at: '2026-11-20' }]).map(a => a.id), ['b', 'a']);

// ---- Tipos sugeridos pela IA → ids ----
const TYPES = [{ id: 'banco-de-dados', name: 'Banco de Dados' }, { id: 'testes', name: 'Testes' }, { id: 'comunicacao', name: 'Comunicação' }, { id: 'ia', name: 'IA' }];
assert.deepEqual(R.mapAiTags(['testes', 'COMUNICACAO', 'Inexistente', 'Testes'], TYPES), ['testes', 'comunicacao']);
assert.deepEqual(R.mapAiTags(['Banco de Dados', 'Testes', 'IA', 'Comunicação'], TYPES), ['banco-de-dados', 'testes', 'ia'], 'no máximo 3');
assert.deepEqual(R.mapAiTags('Testes', TYPES), [], 'não-array é ignorado');

// ---- Responsável: só casamento exato ----
const DEVS = [{ id: 1, name: 'Eloi Carlos Santaroza' }, { id: 2, name: 'Igor Hencklein' }, { id: 3, name: 'Ana Souza' }, { id: 4, name: 'Ana Lima' }];
assert.deepEqual(R.splitOwners('Eloi e Igor'), ['Eloi', 'Igor']);
assert.deepEqual(R.splitOwners('Ana, Bia / Caio; Duda & Edu'), ['Ana', 'Bia', 'Caio', 'Duda', 'Edu']);
assert.deepEqual(R.matchOwner('Eloi', DEVS), { owner_id: 1, owner_name_fallback: null });
assert.deepEqual(R.matchOwner('eloi carlos santaroza', DEVS), { owner_id: 1, owner_name_fallback: null });
assert.deepEqual(R.matchOwner('Eloi e Igor', DEVS), { owner_id: 1, owner_name_fallback: 'Eloi e Igor' });
assert.deepEqual(R.matchOwner('Ana', DEVS), { owner_id: null, owner_name_fallback: 'Ana' }, 'primeiro nome ambíguo não casa');
assert.deepEqual(R.matchOwner('Elo', DEVS), { owner_id: null, owner_name_fallback: 'Elo' }, 'sem substring');
assert.deepEqual(R.matchOwner('', DEVS), { owner_id: null, owner_name_fallback: null });

// ---- Sugestões da IA: limite, dedupe, saneamento ----
const acoes = Array.from({ length: 12 }, (_, i) => ({ titulo: `Ação ${i}`, prioridade: 'alta', tags: ['Testes'] }));
acoes[1] = { titulo: 'Abrir o board na daily', detalhe: 'x', origem: ['a', '', 'b', 'c', 'd'], prioridade: 'urgente', responsavel: 'Igor', recorrente: 'true', tags: ['Inventado'] };
acoes[2] = { titulo: 'abrir o BOARD na dáily' };
const sug = R.buildSuggestions(acoes, { existingTitles: ['Ação 0'], types: TYPES, teamKey: 'Wakanda', retroId: 'r1', developers: DEVS });
assert.equal(sug.length, 8, '10 processadas, menos 1 já existente e 1 duplicada');
const board = sug.find(s => s.title === 'Abrir o board na daily');
assert.deepEqual(
  [board.priority, board.recurring, board.owner_id, board.typeIds, board.origin, board.state, board.source, board.team_key, board.retro_id],
  ['media', true, 2, [], ['a', 'b', 'c'], 'sugerida', 'ia', 'Wakanda', 'r1']);
assert.ok(!sug.some(s => s.title === 'Ação 10' || s.title === 'Ação 11'), 'só as 10 primeiras');

const ins = R.sanitizeInsights({ resumo: 'r', temas: [{ tema: 'T', tom: 'bravo', detalhe: 'd' }, { tema: '' }], elogios: ['ok', ''] });
assert.deepEqual(ins, { resumo: 'r', temas: [{ tema: 'T', tom: 'atencao', detalhe: 'd' }], elogios: ['ok'] });
assert.deepEqual(R.sanitizeFeedback({ mensagem: 'm', manter: ['a', 'b', 'c', 'd'], melhorar: 'x' }),
  { mensagem: 'm', manter: ['a', 'b', 'c'], melhorar: [], proximo_passo: '' });

// ---- JSON da IA ----
assert.deepEqual(R.extractJson('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(R.extractJson('Claro! Aqui está: {"a":{"b":2}} Espero ter ajudado.'), { a: { b: 2 } });
assert.throws(() => R.extractJson('sem json'), /invalid_json/);

// ---- Texto da retro pro prompt ----
const txt = R.retroText({ columns: [{ name: 'Bem', description: 'd', cards: [{ t: 'a\n---\nb', v: 2, c: ['x'] }, { t: 'c', v: 0, c: [] }] }] });
assert.equal(txt, '## Bem (d)\n- a / --- / b [2 votos]\n  ↳ comentário: x\n- c');
assert.ok(R.retroText({ columns: [{ name: 'X', cards: [{ t: 'y'.repeat(200) }] }] }, 50).endsWith('[…cortado]'));

// ---- Volta do Azure DevOps (fase 2)
assert.deepEqual(['Closed', 'Finished', 'Pronto', 'Removed', 'New', 'Para desenvolver', 'Active', 'Testando QA', ''].map(R.adoCategory),
  ['done', 'done', 'done', 'removed', 'todo', 'todo', 'doing', 'doing', null]);
const wi = (state) => ({ state, azdo_work_item_id: 75001 });
assert.equal(R.reconcileFromAdo(wi('andamento'), 'Closed').state, 'validacao', 'fechado lá → Validar aqui (não Fechada)');
assert.equal(R.reconcileFromAdo(wi('aberta'), 'Pronto').state, 'validacao');
assert.match(R.reconcileFromAdo(wi('aberta'), 'Closed').note, /#75001.*Validar/);
assert.equal(R.reconcileFromAdo(wi('aberta'), 'Active').state, 'andamento');
assert.equal(R.reconcileFromAdo(wi('andamento'), 'Active'), null, 'já está em andamento');
assert.equal(R.reconcileFromAdo(wi('validacao'), 'Closed'), null, 'já esperando a liderança');
assert.equal(R.reconcileFromAdo(wi('concluida'), 'Active'), null, 'fechada aqui não reabre sozinha');
assert.deepEqual(R.reconcileFromAdo(wi('andamento'), 'Removed').state, null, 'removido lá só gera nota');
assert.match(R.reconcileFromAdo(wi('andamento'), 'Removed').note, /removido/);
assert.equal(R.reconcileFromAdo(wi('aberta'), 'New'), null);

// ---- Lista de times ----
{
  const cur = [{ key: 'Tatico', label: 'Condado', aliases: ['Tático'] }, { key: 'Antigo', label: 'Antigo', aliases: [] }];
  const ok = R.cleanTeams([{ key: 'Tatico', label: ' Condado ' }, { key: 'Boltz', label: '' }, { key: 'Antigo', label: 'X' }, { key: 'Boltz' }], ['Tatico', 'Boltz'], cur);
  assert.deepEqual(ok.teams, [
    { key: 'Tatico', label: 'Condado', aliases: ['Tático'] },
    { key: 'Boltz', label: 'Boltz', aliases: [] },
    { key: 'Antigo', label: 'X', aliases: [] },
  ], 'mantém aliases, nome vazio vira a chave, repetido some, time que já estava continua válido');
  assert.match(R.cleanTeams([{ key: 'Inventado' }], ['Boltz'], cur).error, /Inventado/, 'time fora do DevOps é recusado');
  assert.ok(R.cleanTeams([], ['Boltz']).error, 'lista vazia é recusada');
  assert.ok(R.cleanTeams(null, ['Boltz']).error);
}

console.log('retroRules: ok');
