const db = require('better-sqlite3')('devops.db');

console.log('=== Verificação dos dados de Causa Raiz ===\n');

// 1. Verificar se a coluna causaRaiz existe
console.log('1. Verificando estrutura da tabela:');
const columns = db.pragma('table_info(work_items)');
const hasCausaRaiz = columns.some(col => col.name === 'causaRaiz');
console.log(`   ✅ Coluna 'causaRaiz' existe: ${hasCausaRaiz}\n`);

// 2. Verificar Issues de Correção
const issuesCorrecao = db.prepare(`
  SELECT COUNT(*) as total 
  FROM work_items 
  WHERE type = 'Issue' AND customType = 'Correção'
`).get();
console.log(`2. Total de Issues de Correção: ${issuesCorrecao.total}\n`);

// 3. Issues sem causa raiz (causaRaiz null ou vazio)
const semCausaRaiz = db.prepare(`
  SELECT COUNT(*) as total 
  FROM work_items 
  WHERE type = 'Issue' 
  AND customType = 'Correção' 
  AND (causaRaiz IS NULL OR causaRaiz = '')
`).get();
console.log(`3. Correções SEM Causa Raiz: ${semCausaRaiz.total}`);
console.log(`   (${((semCausaRaiz.total / issuesCorrecao.total) * 100).toFixed(1)}% do total)\n`);

// 4. Issues com causa raiz preenchida
const comCausaRaiz = db.prepare(`
  SELECT COUNT(*) as total 
  FROM work_items 
  WHERE type = 'Issue' 
  AND customType = 'Correção' 
  AND causaRaiz IS NOT NULL 
  AND causaRaiz != ''
`).get();
console.log(`4. Correções COM Causa Raiz: ${comCausaRaiz.total}`);
console.log(`   (${((comCausaRaiz.total / issuesCorrecao.total) * 100).toFixed(1)}% do total)\n`);

// 5. P0 (priority null)
const p0Count = db.prepare(`
  SELECT COUNT(*) as total 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
`).get();
console.log(`5. Total de P0 (priority null): ${p0Count.total}\n`);

// 6. Valores únicos de causa raiz nos P0
console.log('6. Causa Raiz nos P0:');
const p0CausaRaiz = db.prepare(`
  SELECT causaRaiz, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
  GROUP BY causaRaiz
  ORDER BY count DESC
`).all();
console.table(p0CausaRaiz);

// 7. Valores únicos de causa raiz em todas correções
console.log('\n7. Valores únicos de Causa Raiz (top 10):');
const topCausas = db.prepare(`
  SELECT causaRaiz, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' 
  AND customType = 'Correção'
  AND causaRaiz IS NOT NULL 
  AND causaRaiz != ''
  GROUP BY causaRaiz
  ORDER BY count DESC
  LIMIT 10
`).all();
console.table(topCausas);

// 8. Por pessoa (sem causa raiz vs com causa raiz)
console.log('\n8. Top 10 pessoas com mais correções sem causa raiz:');
const porPessoa = db.prepare(`
  SELECT 
    assignedTo,
    SUM(CASE WHEN causaRaiz IS NULL OR causaRaiz = '' THEN 1 ELSE 0 END) as semCausa,
    SUM(CASE WHEN causaRaiz IS NOT NULL AND causaRaiz != '' THEN 1 ELSE 0 END) as comCausa,
    COUNT(*) as total
  FROM work_items 
  WHERE type = 'Issue' AND customType = 'Correção'
  GROUP BY assignedTo
  ORDER BY semCausa DESC
  LIMIT 10
`).all();
console.table(porPessoa);
