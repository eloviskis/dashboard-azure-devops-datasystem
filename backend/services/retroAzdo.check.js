// Check da integração Retrô → Azure DevOps com HTTP e banco simulados. Sem framework — `node services/retroAzdo.check.js`.
const assert = require('node:assert/strict');
const A = require('./retroAzdo');

(async () => {
  const action = {
    id: 'ctc-a1', title: 'Criar plano de teste de regressão', detail: 'Montar o plano <com> casos', priority: 'alta',
    recurring: false, due_date: '2026-12-05', origin: ['Bugs voltando em produção'], approved_at: '2026-11-23T15:00:00Z',
  };
  const ctx = {
    teamLabel: 'CTC', typeNames: ['Testes', 'Processo'], retroTitle: 'CTC 09/11', retroDate: '2026-11-09',
    ownerName: 'Igor Hencklein', assignedTo: 'igor@datasystem.com.br', areaPath: 'USE\\Melhoria Continua - Kaizen',
    iterationPath: 'USE', workItemType: 'Melhoria', url: A.actionUrl('https://dsmetrics.online/', 'ctc-a1'),
  };

  // ---- Config ----
  const cfg = A.retroAzdoConfig({ AZURE_ORG: 'org', AZURE_PROJECT: 'USE', AZURE_PAT: 'p1', FRONTEND_URL: 'https://x' });
  assert.deepEqual([cfg.team, cfg.workItemType, cfg.areaPath, cfg.iterationPath, cfg.writeEnabled, cfg.pat],
    ['Melhoria Continua - Kaizen', 'Melhoria', 'USE\\Melhoria Continua - Kaizen', 'USE', false, 'p1'], 'escrita desligada por padrão');
  assert.equal(A.retroAzdoConfig({ RETRO_AZDO_WRITE_ENABLED: 'true', RETRO_AZDO_PAT: 'p2', AZURE_PAT: 'p1' }).pat, 'p2');
  assert.equal(ctx.url, 'https://dsmetrics.online/?tab=retro&action=ctc-a1');

  // ---- Payload de criação (JSON-Patch) ----
  const patch = A.buildCreatePatch(action, ctx);
  const f = Object.fromEntries(patch.filter(o => o.path.startsWith('/fields/')).map(o => [o.path.slice(8), o.value]));
  assert.ok(patch.every(o => o.op === 'add'));
  assert.equal(f['System.Title'], 'Criar plano de teste de regressão');
  assert.equal(f['System.AreaPath'], 'USE\\Melhoria Continua - Kaizen');
  assert.equal(f['System.IterationPath'], 'USE');
  assert.equal(f['System.AssignedTo'], 'igor@datasystem.com.br');
  assert.equal(f['System.Tags'], 'Retro; Kaizen; CTC; Testes; Processo; Prioridade-Alta');
  assert.ok(!('Microsoft.VSTS.Common.Priority' in f), 'Melhoria não tem Priority: vai como tag e na descrição');
  for (const s of ['Montar o plano &lt;com&gt; casos', 'CTC 09/11 (09/11/2026)', 'Igor Hencklein', '05/12/2026', 'Alta', 'Testes, Processo',
    '<li>Bugs voltando em produção</li>', 'https://dsmetrics.online/?tab=retro&amp;action=ctc-a1']) {
    assert.ok(f['System.Description'].includes(s), `descrição contém ${s}`);
  }
  assert.deepEqual(patch.at(-1), { op: 'add', path: '/relations/-', value: { rel: 'Hyperlink', url: ctx.url, attributes: { comment: 'Ação no DSMetrics (aba Retrô)' } } });

  const rec = A.buildCreatePatch({ ...action, recurring: true, priority: 'baixa' }, { ...ctx, assignedTo: null, typeNames: [] });
  const rf = Object.fromEntries(rec.filter(o => o.path.startsWith('/fields/')).map(o => [o.path.slice(8), o.value]));
  assert.equal(rf['System.Tags'], 'Retro; Kaizen; CTC; Prioridade-Baixa; Recorrente');
  assert.ok(rf['System.Description'].includes('<b>Prazo:</b> Recorrente'), 'recorrente não leva data');
  assert.ok(!('System.AssignedTo' in rf), 'sem identidade resolvida, não atribui');

  // ---- Tags nas atualizações: preserva as de terceiros, troca só as da Retrô ----
  const prev = ['Retro', 'Kaizen', 'CTC', 'Testes', 'Prioridade-Alta'];
  const next = A.managedTags({ priority: 'media' }, { teamLabel: 'CTC', typeNames: ['Comunicação'] });
  assert.equal(A.mergeTags('Retro; Kaizen; CTC; Testes; Prioridade-Alta; urgente-cliente', prev, next),
    'Retro; Kaizen; CTC; Comunicação; Prioridade-Média; urgente-cliente');
  const up = A.buildUpdatePatch({ ...action, priority: 'media' }, { ...ctx, typeNames: ['Comunicação'], assignedTo: null }, 'Retro; Testes; x', prev);
  assert.equal(up.find(o => o.path === '/fields/System.Tags').value, 'Retro; Kaizen; CTC; Comunicação; Prioridade-Média; x');
  assert.ok(!up.some(o => o.path === '/fields/System.AssignedTo'), 'sem identidade resolvida não mexe no responsável do ADO');
  assert.equal(A.buildUpdatePatch(action, ctx, '', prev).find(o => o.path === '/fields/System.AssignedTo').value, 'igor@datasystem.com.br');
  assert.deepEqual(A.buildStatePatch('Removed'), [{ op: 'add', path: '/fields/System.State', value: 'Removed' }]);

  // ---- Backoff ----
  assert.deepEqual([1, 2, 3, 5].map(A.nextAttemptDelayMs), [120000, 240000, 480000, 1920000]);
  assert.equal(A.nextAttemptDelayMs(6), null, 'esgotou: só reenvio manual');

  // ---- Cliente HTTP (fetch mockado) ----
  const calls = [];
  let adoItems = []; // work items "existentes" no ADO
  const fakeFetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body && JSON.parse(opts.body), headers: opts.headers });
    const ok = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), headers: { get: () => null } });
    if (url.includes('/wiql')) return ok({ workItems: adoItems.map(w => ({ id: w.id })) });
    if (/workitems\/\d+\?\$expand=relations/.test(url)) return ok(adoItems.find(w => url.includes(`/workitems/${w.id}?`)));
    if (opts.method === 'PATCH') return ok({ id: 1 });
    if (opts.method === 'POST' && url.includes('/workitems/$Melhoria')) {
      const wi = { id: 1000 + calls.length, fields: { 'System.Tags': 'Retro' }, _links: { html: { href: `https://ado/wi/${1000 + calls.length}` } },
        relations: JSON.parse(opts.body).filter(o => o.path === '/relations/-').map(o => o.value) };
      adoItems.push(wi);
      return ok(wi);
    }
    throw new Error(`chamada inesperada ${opts.method} ${url}`);
  };
  const client = A.createAzdoClient({ org: 'datasystemsoftwares', project: 'USE', pat: 'segredo', fetchImpl: fakeFetch });

  // Banco em memória com claim atômico, igual ao UPDATE … WHERE do retro.js.
  const db = { [action.id]: { ...action, azdo_sync_status: 'pendente', azdo_attempts: 0, azdo_work_item_id: null } };
  const repo = {
    async claim(id) {
      const r = db[id];
      if (!r || r.azdo_work_item_id || !['pendente', 'erro'].includes(r.azdo_sync_status)) return null;
      r.azdo_sync_status = 'enviando';
      return { ...r };
    },
    async markOk(id, { workItemId, url, managedTags }) { Object.assign(db[id], { azdo_sync_status: 'ok', azdo_work_item_id: workItemId, azdo_url: url, azdo_managed_tags: managedTags }); },
    async markSimulated(id) { db[id].azdo_sync_status = 'simulado'; },
    async markError(id, msg, delay) { Object.assign(db[id], { azdo_sync_status: 'erro', azdo_sync_error: msg, azdo_attempts: db[id].azdo_attempts + 1, delay }); },
  };
  const ctxFor = async () => ctx;
  const posts = () => calls.filter(c => c.method === 'POST' && c.url.includes('/workitems/$')).length;

  // Modo simulado (padrão): nada vai pro ADO.
  assert.equal((await A.syncAction({ actionId: action.id, repo, client, ctxFor, writeEnabled: false })).status, 'simulado');
  assert.equal(calls.length, 0, 'simulado não chama o ADO');
  db[action.id].azdo_sync_status = 'pendente';

  // Duas execuções concorrentes (aprovar duas vezes / job + setImmediate) → um único POST.
  const [r1, r2] = await Promise.all([1, 2].map(() => A.syncAction({ actionId: action.id, repo, client, ctxFor, writeEnabled: true })));
  assert.deepEqual([r1.status, r2.status].sort(), ['ignorada', 'ok']);
  assert.equal(posts(), 1);
  assert.equal(db[action.id].azdo_url, `https://ado/wi/${db[action.id].azdo_work_item_id}`);
  assert.deepEqual(db[action.id].azdo_managed_tags, ['Retro', 'Kaizen', 'CTC', 'Testes', 'Processo', 'Prioridade-Alta']);
  assert.equal((await A.syncAction({ actionId: action.id, repo, client, ctxFor, writeEnabled: true })).status, 'ignorada', 'job repetido não recria');
  assert.equal(posts(), 1);
  const post = calls.find(c => c.method === 'POST' && c.url.includes('/workitems/$'));
  assert.equal(post.url, 'https://dev.azure.com/datasystemsoftwares/USE/_apis/wit/workitems/$Melhoria?api-version=7.1');
  assert.equal(post.headers['Content-Type'], 'application/json-patch+json');
  assert.equal(post.headers.Authorization, `Basic ${Buffer.from(':segredo').toString('base64')}`);

  // Processo caiu depois do POST (id não gravado): o reenvio acha o item pelo Hyperlink e não cria outro.
  db[action.id] = { ...action, azdo_sync_status: 'erro', azdo_attempts: 1, azdo_work_item_id: null };
  const before = posts();
  const again = await A.syncAction({ actionId: action.id, repo, client, ctxFor, writeEnabled: true });
  assert.equal(again.status, 'ok');
  assert.equal(posts(), before, 'reaproveitou o item existente');
  assert.equal(again.workItemId, adoItems[0].id);

  // approved_at como Date (é assim que o pg devolve TIMESTAMPTZ) → WIQL com data ISO, não "Mon Nov 23".
  db[action.id] = { ...action, approved_at: new Date('2026-11-23T15:00:00Z'), azdo_sync_status: 'erro', azdo_attempts: 1, azdo_work_item_id: null };
  await A.syncAction({ actionId: action.id, repo, client, ctxFor, writeEnabled: true });
  const wiql = calls.filter(c => c.url.includes('/wiql')).at(-1).body.query;
  assert.ok(wiql.includes("[System.CreatedDate] >= '2026-11-23'"), wiql);

  // Ação descartada/excluída enquanto o POST estava em andamento → quem criou tira o item do board.
  adoItems = [];
  db.race = { ...action, id: 'race', title: 'Outra ação', azdo_sync_status: 'pendente', azdo_attempts: 0, azdo_work_item_id: null };
  const raceRepo = { ...repo, isLive: async () => false };
  const race = await A.syncAction({ actionId: 'race', repo: raceRepo, client, ctxFor: async () => ({ ...ctx, url: 'https://x/?action=race' }), writeEnabled: true });
  assert.equal(race.status, 'removido');
  const removedPatch = calls.filter(c => c.method === 'PATCH').at(-1);
  assert.ok(removedPatch.url.includes(`/workitems/${race.workItemId}?`));
  assert.deepEqual(removedPatch.body, [{ op: 'add', path: '/fields/System.State', value: 'Removed' }]);

  // Falha da API: ação fica em erro com backoff, sem perder nada; mensagem sem o PAT.
  const failing = A.createAzdoClient({ org: 'o', project: 'p', pat: 'segredo', fetchImpl: async () => ({
    ok: false, status: 403, text: async () => '', headers: { get: (h) => (h === 'x-tfs-serviceerror' ? 'VS403463%3A%20conditional%20access' : null) } }) });
  db.x = { ...action, id: 'x', azdo_sync_status: 'pendente', azdo_attempts: 0, azdo_work_item_id: null };
  const fail = await A.syncAction({ actionId: 'x', repo, client: failing, ctxFor, writeEnabled: true });
  assert.equal(fail.status, 'erro');
  assert.equal(db.x.azdo_sync_status, 'erro');
  assert.equal(db.x.azdo_sync_error, 'Azure DevOps 403: VS403463: conditional access');
  assert.equal(db.x.delay, 120000);
  assert.ok(!db.x.azdo_sync_error.includes('segredo'));

  console.log('retroAzdo: ok');
})().catch((e) => { console.error(e); process.exit(1); });
