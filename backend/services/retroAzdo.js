// backend/services/retroAzdo.js
// Integração da aba Retrô com o board "Melhoria Continua - Kaizen" do Azure DevOps: payload JSON-Patch,
// tags, cliente HTTP (fetch injetável pro check) e envio idempotente. Primeira escrita em work item do
// DSMetrics — tudo aqui roda só no backend, o PAT nunca vai pro frontend nem pros logs.
// Check: retroAzdo.check.js (cliente HTTP mockado).

const PRI_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const MAX_ATTEMPTS = 6;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const lower = (s) => String(s).trim().toLowerCase();

// Config lida do ambiente na chamada (não no require), com os valores descobertos pela API como padrão.
function retroAzdoConfig(env = process.env) {
  const clean = (v) => String(v ?? '').replace(/[\r\n]/g, '').trim();
  return {
    org: clean(env.AZURE_ORG),
    project: clean(env.AZURE_PROJECT),
    pat: clean(env.RETRO_AZDO_PAT || env.AZURE_PAT),
    team: clean(env.RETRO_AZDO_TEAM) || 'Melhoria Continua - Kaizen',
    workItemType: clean(env.RETRO_AZDO_WORK_ITEM_TYPE) || 'Melhoria',
    areaPath: clean(env.RETRO_AZDO_AREA_PATH) || 'USE\\Melhoria Continua - Kaizen',
    iterationPath: clean(env.RETRO_AZDO_ITERATION_PATH) || 'USE',
    writeEnabled: /^(1|true|sim|yes)$/i.test(clean(env.RETRO_AZDO_WRITE_ENABLED)),
    appUrl: clean(env.FRONTEND_URL) || 'http://localhost:5173',
  };
}

const actionUrl = (appUrl, id) => `${appUrl.replace(/\/+$/, '')}/?tab=retro&action=${encodeURIComponent(id)}`;

// Tags que a Retrô controla. As demais (postas direto no ADO) são preservadas nas atualizações.
// O tipo Melhoria não tem campo de prioridade, então ela vai como tag (e na descrição).
function managedTags(action, ctx) {
  const tags = ['Retro', 'Kaizen', ctx.teamLabel, ...(ctx.typeNames || []), `Prioridade-${PRI_LABEL[action.priority] || 'Média'}`];
  if (action.recurring) tags.push('Recorrente');
  const seen = new Set();
  return tags.filter(t => t && !seen.has(lower(t)) && seen.add(lower(t)));
}

// Recalcula System.Tags: tira as que a Retrô tinha colocado antes, mantém as de terceiros, põe as atuais.
function mergeTags(current, previousManaged, nextManaged) {
  const prev = new Set((previousManaged || []).map(lower));
  const next = new Set(nextManaged.map(lower));
  const kept = String(current || '').split(';').map(t => t.trim()).filter(t => t && !prev.has(lower(t)) && !next.has(lower(t)));
  return [...nextManaged, ...kept].join('; ');
}

function descriptionHtml(action, ctx) {
  const prazo = action.recurring ? 'Recorrente' : (fmtBr(action.due_date) || 'Sem prazo');
  const retro = ctx.retroTitle ? `${ctx.retroTitle}${ctx.retroDate ? ` (${fmtBr(ctx.retroDate)})` : ''}` : 'Ação avulsa';
  const origem = (action.origin || []).length
    ? `<ul>${action.origin.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : 'Nenhum';
  const rows = [
    ['Ação', esc(action.detail || action.title)],
    ['Time', esc(ctx.teamLabel)],
    ['Retro', esc(retro)],
    ['Responsável', esc(ctx.ownerName || 'Não definido')],
    ['Prazo', esc(prazo)],
    ['Prioridade', esc(PRI_LABEL[action.priority] || 'Média')],
    ['Tipo', esc((ctx.typeNames || []).join(', ') || 'Sem tipo')],
    ['Cards de origem', origem],
    ['Link no DSMetrics', `<a href="${esc(ctx.url)}">${esc(ctx.url)}</a>`],
  ];
  return rows.map(([k, v]) => `<div><b>${k}:</b> ${v}</div>`).join('');
}

const field = (name, value) => ({ op: 'add', path: `/fields/${name}`, value });

function buildCreatePatch(action, ctx) {
  const ops = [
    field('System.Title', String(action.title).slice(0, 255)),
    field('System.Description', descriptionHtml(action, ctx)),
    field('System.AreaPath', ctx.areaPath),
    field('System.IterationPath', ctx.iterationPath),
    field('System.Tags', managedTags(action, ctx).join('; ')),
  ];
  if (ctx.assignedTo) ops.push(field('System.AssignedTo', ctx.assignedTo));
  ops.push({ op: 'add', path: '/relations/-', value: { rel: 'Hyperlink', url: ctx.url, attributes: { comment: 'Ação no DSMetrics (aba Retrô)' } } });
  return ops;
}

// Atualização de um item já criado: título, descrição (prazo/prioridade/responsável), tags e responsável.
function buildUpdatePatch(action, ctx, currentTags, previousManaged) {
  return [
    field('System.Title', String(action.title).slice(0, 255)),
    field('System.Description', descriptionHtml(action, ctx)),
    field('System.Tags', mergeTags(currentTags, previousManaged, managedTags(action, ctx))),
    field('System.AssignedTo', ctx.assignedTo || ''),
  ];
}

const buildStatePatch = (state) => [field('System.State', state)];

// Backoff exponencial do reenvio: 1, 2, 4, 8, 16 min… até 6h. Depois de MAX_ATTEMPTS fica em erro (só manual).
const nextAttemptDelayMs = (attempts) => (attempts >= MAX_ATTEMPTS ? null : Math.min(2 ** attempts * 60000, 6 * 3600000));

function createAzdoClient({ org, project, pat, fetchImpl = fetch, apiVersion = '7.1' }) {
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const auth = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

  async function req(method, url, body, contentType = 'application/json') {
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': contentType } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual', // credencial inválida vira 302 pra página de login, não um 401
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) {
      const reason = res.headers?.get?.('x-tfs-serviceerror');
      const msg = data?.message || (reason ? decodeURIComponent(reason) : '') || `HTTP ${res.status}`;
      const err = new Error(`Azure DevOps ${res.status}: ${String(msg).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    async currentIteration(team) {
      const r = await req('GET', `${base}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=${apiVersion}`);
      return r?.value?.[0]?.path || null;
    },
    async createWorkItem(type, patch) {
      const r = await req('POST', `${base}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=${apiVersion}`, patch, 'application/json-patch+json');
      return { id: r.id, url: r?._links?.html?.href || `${base}/_workitems/edit/${r.id}`, tags: r?.fields?.['System.Tags'] || '' };
    },
    async updateWorkItem(id, patch) {
      return req('PATCH', `${base}/_apis/wit/workitems/${id}?api-version=${apiVersion}`, patch, 'application/json-patch+json');
    },
    async getWorkItem(id, withRelations = false) {
      return req('GET', `${base}/_apis/wit/workitems/${id}?${withRelations ? '$expand=relations&' : ''}api-version=${apiVersion}`);
    },
    // Rede de segurança da idempotência: o processo pode cair entre o POST e gravar o id no banco. Antes de
    // criar, procura um item da área Kaizen com o mesmo título criado desde a aprovação e confirma pelo
    // Hyperlink que aponta pra esta ação.
    // ponytail: WIQL não busca relações; o filtro por título+data é o que dá pra fazer barato. Se o título for
    // editado no ADO nesse intervalo, cai no POST e pode duplicar (janela de segundos, aceitável).
    async findExisting(action, ctx) {
      const since = String(action.approved_at || new Date().toISOString()).slice(0, 10);
      const q = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AreaPath] = '${ctx.areaPath.replace(/'/g, "''")}' AND [System.Title] = '${String(action.title).slice(0, 255).replace(/'/g, "''")}' AND [System.CreatedDate] >= '${since}'`;
      const r = await req('POST', `${base}/_apis/wit/wiql?$top=20&api-version=${apiVersion}`, { query: q });
      for (const { id } of r?.workItems || []) {
        const wi = await this.getWorkItem(id, true);
        if ((wi?.relations || []).some(rel => rel.rel === 'Hyperlink' && rel.url === ctx.url)) {
          return { id: wi.id, url: wi?._links?.html?.href || `${base}/_workitems/edit/${wi.id}`, tags: wi?.fields?.['System.Tags'] || '' };
        }
      }
      return null;
    },
    // Nome de exibição do DevTracker → identidade do ADO (e-mail/uniqueName). Só aceita resultado único.
    async resolveIdentity(name) {
      const url = `https://vssps.dev.azure.com/${encodeURIComponent(org)}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(name)}&queryMembership=None&api-version=${apiVersion}`;
      const r = await req('GET', url);
      const hits = (r?.value || []).filter(i => lower(i.providerDisplayName || '') === lower(name));
      if (hits.length !== 1) return null;
      const p = hits[0].properties || {};
      return p.Account?.$value || p.Mail?.$value || null;
    },
  };
}

// Cria o work item de uma ação aprovada, uma vez só. `repo` isola o banco (claim atômico + gravações):
//   claim(id) → linha da ação ou null (já criada / outro processo pegou / fora da fila)
//   markOk(id, {workItemId, url, managedTags}) · markSimulated(id, patch) · markError(id, message, nextAttemptDelayMs|null)
// `ctxFor(action)` monta time, tipos, retro, responsável, área, iteração e URL.
async function syncAction({ actionId, repo, client, ctxFor, writeEnabled, log = () => {} }) {
  const action = await repo.claim(actionId);
  if (!action) return { status: 'ignorada' };
  try {
    const ctx = await ctxFor(action);
    const patch = buildCreatePatch(action, ctx);
    if (!writeEnabled) {
      log(`[retro] RETRO_AZDO_WRITE_ENABLED desligado — work item da ação ${actionId} só simulado`);
      await repo.markSimulated(actionId, patch);
      return { status: 'simulado', patch };
    }
    const wi = (await client.findExisting(action, ctx)) || (await client.createWorkItem(ctx.workItemType, patch));
    await repo.markOk(actionId, { workItemId: wi.id, url: wi.url, managedTags: managedTags(action, ctx) });
    return { status: 'ok', workItemId: wi.id };
  } catch (e) {
    const attempts = (action.azdo_attempts || 0) + 1;
    await repo.markError(actionId, e.message, nextAttemptDelayMs(attempts));
    log(`[retro] falha ao criar work item da ação ${actionId} (tentativa ${attempts}): ${e.message}`);
    return { status: 'erro', error: e.message };
  }
}

module.exports = {
  PRI_LABEL, MAX_ATTEMPTS, retroAzdoConfig, actionUrl, managedTags, mergeTags, descriptionHtml,
  buildCreatePatch, buildUpdatePatch, buildStatePatch, nextAttemptDelayMs, createAzdoClient, syncAction,
};
