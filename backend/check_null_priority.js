const db = require('better-sqlite3')('devops.db');

console.log('=== Issues com Priority NULL (possível P0?) ===\n');

const rows = db.prepare(`
  SELECT workItemId, title, priority, rootCauseStatus, state 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL 
  LIMIT 10
`).all();

console.table(rows);

console.log('\n=== Total de Issues com Priority NULL ===');
const count = db.prepare(`
  SELECT COUNT(*) as total 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
`).get();
console.log('Total:', count.total);
