const db = require('better-sqlite3')('devops.db');

console.log('=== Verificando campo causaRaiz nos P0 (priority = null) ===\n');

const rows = db.prepare(`
  SELECT DISTINCT causaRaiz, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
  GROUP BY causaRaiz 
  ORDER BY count DESC
`).all();

console.log('Causa Raiz nos P0:');
console.table(rows);

console.log('\n=== Amostra de P0 com causaRaiz ===');
const sample = db.prepare(`
  SELECT workItemId, title, causaRaiz, assignedTo
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL AND causaRaiz IS NOT NULL
  LIMIT 10
`).all();
console.table(sample);
