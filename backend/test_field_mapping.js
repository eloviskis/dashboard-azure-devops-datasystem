// backend/test_field_mapping.js
// Teste de regressao para backend/fieldExtraction.js (extracao de campos de work items
// respeitando field_mappings). Nao depende de banco nem da API do Azure DevOps —
// roda offline com payloads sinteticos. Rodar com: node test_field_mapping.js
//
// Cobre os cenarios validados manualmente antes do deploy que converteu os campos
// padrao (System.*/Microsoft.VSTS.*) para usar fld().

const assert = require('assert');
const { extractTeam, extractWorkItemFields, extractAvatarCandidates } = require('./fieldExtraction');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

// Payload sintetico simulando um work item real do Azure DevOps
const fields = {
  'System.Title': 'Bug de teste',
  'System.State': 'Active',
  'System.WorkItemType': 'Bug',
  'System.AssignedTo': { displayName: 'Fulano de Tal', imageUrl: 'http://x/a.png' },
  'System.AreaPath': 'Projeto\\Time Norte',
  'System.IterationPath': 'Projeto\\Sprint 3',
  'System.CreatedDate': '2026-01-01T10:00:00Z',
  'System.ChangedDate': '2026-01-05T10:00:00Z',
  'System.CreatedBy': { displayName: 'Criador X', imageUrl: 'http://x/b.png' },
  'System.Tags': 'urgente; cliente-x',
  'Microsoft.VSTS.Common.ClosedDate': '2026-01-10T10:00:00Z',
  'Microsoft.VSTS.Common.Priority': 2,
  'Microsoft.VSTS.Common.ActivatedDate': '2026-01-02T10:00:00Z',
  'Microsoft.VSTS.Scheduling.StoryPoints': 5,
  'Microsoft.VSTS.CMMI.RootCause': 'Falha de requisito',
  'Custom.Raizdoproblema': 'Erro de validacao',
  'Custom.QA': { displayName: 'QA Pessoa', imageUrl: 'http://x/c.png' },
  'Custom.PO': { displayName: 'PO Pessoa', imageUrl: 'http://x/d.png' },
  'Custom.DEV': { displayName: 'Dev Pessoa' },
  'Custom.Tipocliente': 'Cliente Premium',
  'Custom.Impedimento': true,
};

test('extractTeam: extrai o ultimo segmento do area path', () => {
  assert.strictEqual(extractTeam('Projeto\\Time Norte'), 'Time Norte');
});

test('extractTeam: area path sem separador retorna o valor inteiro', () => {
  assert.strictEqual(extractTeam('Projeto'), 'Projeto');
});

test('extractTeam: vazio/null retorna "Sem Time"', () => {
  assert.strictEqual(extractTeam(''), 'Sem Time');
  assert.strictEqual(extractTeam(null), 'Sem Time');
});

test('extractWorkItemFields: sem overrides, bate com os defaults hardcoded', () => {
  const r = extractWorkItemFields(fields, {});
  assert.strictEqual(r.title, 'Bug de teste');
  assert.strictEqual(r.state, 'Active');
  assert.strictEqual(r.type, 'Bug');
  assert.strictEqual(r.assignedTo, 'Fulano de Tal');
  assert.strictEqual(r.areaPath, 'Projeto\\Time Norte');
  assert.strictEqual(r.team, 'Time Norte');
  assert.strictEqual(r.createdDate, '2026-01-01T10:00:00Z');
  assert.strictEqual(r.closedDate, '2026-01-10T10:00:00Z');
  assert.strictEqual(r.priority, '2');
  assert.strictEqual(r.storyPoints, 5);
  assert.strictEqual(r.tipoCliente, 'Cliente Premium');
  assert.strictEqual(r.qa, 'QA Pessoa');
  assert.strictEqual(r.po, 'PO Pessoa');
  assert.strictEqual(r.dev, 'Dev Pessoa');
  assert.strictEqual(r.causaRaiz, 'Erro de validacao');
  assert.strictEqual(r.rootCauseLegacy, 'Falha de requisito');
  assert.strictEqual(r.createdBy, 'Criador X');
  assert.strictEqual(r.impedimento, true);
  assert.strictEqual(r.bloqueio, false);
});

test('extractWorkItemFields: override em campo que varia por template (Scrum Effort)', () => {
  // Simula um cliente Scrum, onde nao existe Microsoft.VSTS.Scheduling.StoryPoints,
  // e sim Microsoft.VSTS.Scheduling.Effort, mapeado pelo admin.
  const fieldsEffort = { ...fields, 'Microsoft.VSTS.Scheduling.Effort': 8 };
  delete fieldsEffort['Microsoft.VSTS.Scheduling.StoryPoints'];
  const fm = { storyPoints: 'Microsoft.VSTS.Scheduling.Effort' };
  const r = extractWorkItemFields(fieldsEffort, fm);
  assert.strictEqual(r.storyPoints, 8);
});

test('extractWorkItemFields: override redundante em campo critico (state) nao quebra', () => {
  const fm = { state: 'System.State', assignedTo: 'System.AssignedTo' };
  const r = extractWorkItemFields(fields, fm);
  assert.strictEqual(r.state, 'Active');
  assert.strictEqual(r.assignedTo, 'Fulano de Tal');
});

test('extractWorkItemFields: campo identity mapeado para texto simples nao quebra', () => {
  const fieldsTextoSimples = { ...fields, 'Custom.ResponsavelTexto': 'Nome em Texto Puro' };
  const fm = { assignedTo: 'Custom.ResponsavelTexto' };
  const r = extractWorkItemFields(fieldsTextoSimples, fm);
  assert.strictEqual(r.assignedTo, 'Nome em Texto Puro');
});

test('extractWorkItemFields: fields vazio nao lanca excecao e usa fallback seguro', () => {
  const r = extractWorkItemFields({}, {});
  assert.strictEqual(r.title, '');
  assert.strictEqual(r.state, '');
  assert.strictEqual(r.type, '');
  assert.strictEqual(r.assignedTo, '');
  assert.strictEqual(r.team, 'Sem Time');
  assert.strictEqual(r.storyPoints, null);
  assert.strictEqual(r.impedimento, false);
  assert.strictEqual(r.bloqueio, false);
  assert.strictEqual(r.categoria, null);
});

test('extractAvatarCandidates: sem overrides, retorna os 4 avatares esperados', () => {
  const r = extractAvatarCandidates(fields, {});
  assert.strictEqual(r.length, 4);
  assert.deepStrictEqual(r.find(c => c.displayName === 'Fulano de Tal'), { displayName: 'Fulano de Tal', imageUrl: 'http://x/a.png' });
  assert.deepStrictEqual(r.find(c => c.displayName === 'PO Pessoa'), { displayName: 'PO Pessoa', imageUrl: 'http://x/d.png' });
  assert.deepStrictEqual(r.find(c => c.displayName === 'QA Pessoa'), { displayName: 'QA Pessoa', imageUrl: 'http://x/c.png' });
});

test('extractAvatarCandidates: com overrides explicitos, mesmos resultados', () => {
  const fm = { po: 'Custom.PO', qa: 'Custom.QA', assignedTo: 'System.AssignedTo', createdBy: 'System.CreatedBy' };
  const r = extractAvatarCandidates(fields, fm);
  assert.strictEqual(r.length, 4);
});

test('extractAvatarCandidates: fields vazio retorna lista vazia sem excecao', () => {
  const r = extractAvatarCandidates({}, {});
  assert.deepStrictEqual(r, []);
});

console.log(`\n${passed} passou, ${failed} falhou.`);
if (failed > 0) {
  process.exit(1);
}
