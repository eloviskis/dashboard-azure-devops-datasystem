const { Client } = require('pg');

const client = new Client({
  host: '187.77.55.172',
  port: 5432,
  database: 'devops_dashboard',
  user: 'devops_dash',
  password: 'D3v0ps_D4sh_2026_Str0ng',
});

async function checkAreaPaths() {
  try {
    await client.connect();
    console.log('🔍 Verificando area_path disponíveis...\n');
    
    const query = `
      SELECT 
        area_path,
        COUNT(*) as total
      FROM work_items
      WHERE state = 'Closed'
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND closed_date IS NOT NULL
      GROUP BY area_path
      ORDER BY total DESC;
    `;
    
    const result = await client.query(query);
    
    console.log('Area paths com itens fechados em 2026:');
    console.log('---------------------------------------');
    result.rows.forEach(row => {
      console.log(`${row.area_path}: ${row.total} itens`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkAreaPaths();
