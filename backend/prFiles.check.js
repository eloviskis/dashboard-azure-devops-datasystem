#!/usr/bin/env node
// Check da contagem de arquivos por PR. Sem framework — node prFiles.check.js
const assert = require('assert/strict');
const { summarizeChangeEntries } = require('./services/prFiles');

const arquivo = (path, changeType = 'edit') => ({ item: { path }, changeType });

// pasta não é arquivo (o Azure devolve a pasta como entry quando a mudança é de diretório inteiro)
const comPasta = summarizeChangeEntries([
  arquivo('/src/a.cs'),
  { item: { path: '/src/legado', isFolder: true }, changeType: 'add' },
  arquivo('/src/b.cs', 'add'),
]);
assert.equal(comPasta.files.length, 2, 'pasta não conta como arquivo');
assert.deepEqual(comPasta.byType, { edit: 1, add: 1 }, 'pasta não entra na contagem por tipo');

// entrada sem path é ignorada; path repetido não duplica
const sujo = summarizeChangeEntries([
  arquivo('/src/a.cs'),
  arquivo('/src/a.cs', 'add'),
  { item: {}, changeType: 'edit' },
  { changeType: 'edit' },
  null,
]);
assert.equal(sujo.files.length, 1, 'mesmo arquivo em iterations diferentes conta uma vez');
assert.equal(sujo.files[0].changeType, 'edit', 'vale a primeira ocorrência');
assert.deepEqual(sujo.byType, { edit: 1 });

// caso real do PR 27612: 486 edit + 8 add = 494 (o que o Azure mostra na tela)
const real = summarizeChangeEntries([
  ...Array.from({ length: 486 }, (_, i) => arquivo(`/DS.USE/Arquivo${i}.cs`)),
  ...Array.from({ length: 8 }, (_, i) => arquivo(`/DS.USE/Novo${i}.cs`, 'add')),
]);
assert.equal(real.files.length, 494, 'total tem que bater com a tela do Azure');
assert.deepEqual(real.byType, { edit: 486, add: 8 });

// vazio não quebra
assert.deepEqual(summarizeChangeEntries([]), { files: [], byType: {} });
assert.deepEqual(summarizeChangeEntries(undefined), { files: [], byType: {} });

console.log('✅ prFiles: contagem de arquivos por PR OK');
