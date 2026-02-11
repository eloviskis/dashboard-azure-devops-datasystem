const db = require('better-sqlite3')('devops.db');

console.log('=== Verificação completa do campo causaRaiz (Microsoft.VSTS.CMMI.RootCause) ===\n');

// 1. Verificar se a coluna existe
console.log('1️⃣ Verificando se a coluna causaRaiz existe:');
const columns = db.pragma('table_info(work_items)');
const hasCausaRaiz = columns.some(c => c.name === 'causaRaiz');
console.log(hasCausaRaiz ? '✅ Coluna causaRaiz existe' : '❌ Coluna causaRaiz NÃO existe');

if (!hasCausaRaiz) {
  console.log('\n⚠️  Execute: ALTER TABLE work_items ADD COLUMN causaRaiz TEXT');
  process.exit(1);
}

// 2. Verificar dados gerais
console.log('\n2️⃣ Estatísticas gerais:');
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(causaRaiz) as comCausaRaiz,
    COUNT(*) - COUNT(causaRaiz) as semCausaRaiz
  FROM work_items 
  WHERE type = 'Issue'
`).get();
console.table(stats);

// 3. Verificar Issues de Correção
console.log('3️⃣ Issues de Correção (customType = "Correção"):');
const correcaoStats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(causaRaiz) as comCausaRaiz,
    COUNT(*) - COUNT(causaRaiz) as semCausaRaiz
  FROM work_items 
  WHERE type = 'Issue' AND customType = 'Correção'
`).get();
console.table(correcaoStats);

// 4. Verificar P0 (priority null)
console.log('4️⃣ P0 (priority IS NULL):');
const p0Stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(causaRaiz) as comCausaRaiz,
    COUNT(*) - COUNT(causaRaiz) as semCausaRaiz
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
`).get();
console.table(p0Stats);

// 5. Valores distintos de causaRaiz
console.log('5️⃣ Valores distintos de causaRaiz:');
const valores = db.prepare(`
  SELECT causaRaiz, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' AND causaRaiz IS NOT NULL
  GROUP BY causaRaiz 
  ORDER BY count DESC
  LIMIT 10
`).all();
console.table(valores);

// 6. Amostra de Issues COM causaRaiz
console.log('6️⃣ Amostra de Issues COM causaRaiz:');
const comCausa = db.prepare(`
  SELECT workItemId, title, causaRaiz, customType, priority 
  FROM work_items 
  WHERE type = 'Issue' AND causaRaiz IS NOT NULL
  LIMIT 5
`).all();
console.table(comCausa);

// 7. Verificar o work item 78926 especificamente
console.log('7️⃣ Work Item 78926 (deve ter "Cenários de testes"):');
const witem78926 = db.prepare(`
  SELECT workItemId, title, causaRaiz, customType, priority 
  FROM work_items 
  WHERE workItemId = 78926
`).get();
console.table([witem78926]);

console.log('\n✅ Verificação completa!');
