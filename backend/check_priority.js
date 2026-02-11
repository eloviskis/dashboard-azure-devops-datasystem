const db = require('better-sqlite3')('devops.db');

console.log('=== Verificando Prioridades e Causa Raiz nas Issues ===\n');

const rows = db.prepare(`
  SELECT DISTINCT priority, rootCauseStatus, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' 
  GROUP BY priority, rootCauseStatus 
  ORDER BY priority
`).all();

console.log('Prioridades e Causa Raiz encontradas:');
console.table(rows);

console.log('\n=== Issues com Priority = 0 ===');
const p0 = db.prepare(`
  SELECT workItemId, title, priority, rootCauseStatus 
  FROM work_items 
  WHERE type = 'Issue' AND (priority = 0 OR priority = '0' OR priority = '0.0')
  LIMIT 10
`).all();
console.table(p0);

console.log('\n=== Valores únicos de Priority ===');
const priorities = db.prepare(`
  SELECT DISTINCT priority, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' 
  GROUP BY priority
`).all();
console.table(priorities);
