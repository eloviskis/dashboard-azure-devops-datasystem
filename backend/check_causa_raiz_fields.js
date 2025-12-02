const db = require('better-sqlite3')('devops.db');

console.log('=== Verificando campos de Causa Raiz nos P0 ===\n');

// Ver todos os valores únicos de rootCauseStatus
console.log('rootCauseStatus únicos:');
const rootCause = db.prepare(`
  SELECT DISTINCT rootCauseStatus, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
  GROUP BY rootCauseStatus
`).all();
console.table(rootCause);

// Ver se area tem dados
console.log('\narea únicos (nos P0):');
const area = db.prepare(`
  SELECT DISTINCT area, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
  GROUP BY area
`).all();
console.table(area);

// Ver se squad tem dados
console.log('\nsquad únicos (nos P0):');
const squad = db.prepare(`
  SELECT DISTINCT squad, COUNT(*) as count 
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
  GROUP BY squad
`).all();
console.table(squad);

// Ver amostra completa de P0
console.log('\n=== Amostra de 5 P0 com todos os campos relevantes ===');
const sample = db.prepare(`
  SELECT workItemId, title, rootCauseStatus, area, squad, reincidencia, complexity
  FROM work_items 
  WHERE type = 'Issue' AND priority IS NULL
  LIMIT 5
`).all();
console.table(sample);
