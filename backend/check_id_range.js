require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT 
        MIN(id) as min_id,
        MAX(id) as max_id,
        COUNT(*) as total,
        COUNT(CASE WHEN ready_date IS NOT NULL THEN 1 END) as com_dor,
        COUNT(CASE WHEN ready_date IS NULL THEN 1 END) as sem_dor
      FROM work_items
    `);
    
    const stats = result.rows[0];
    
    console.log('\n📊 Estatísticas do banco de dados:\n');
    console.log(`ID mínimo: ${stats.min_id}`);
    console.log(`ID máximo: ${stats.max_id}`);
    console.log(`Total de itens: ${stats.total}`);
    console.log(`Com DOR (ready_date preenchido): ${stats.com_dor}`);
    console.log(`Sem DOR (ready_date NULL): ${stats.sem_dor}`);
    
    console.log('\n⚠️  O item 80886 está FORA desta faixa!');
    console.log('O sync pode estar configurado para buscar apenas itens recentes (últimos 180 dias)');
    
    await pool.end();
  } catch (error) {
    console.error('Erro:', error.message);
    await pool.end();
  }
})();
