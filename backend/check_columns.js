const { Client } = require('pg');

const client = new Client({
  host: '187.77.55.172',
  port: 5432,
  database: 'devops_dashboard',
  user: 'devops_dash',
  password: 'D3v0ps_D4sh_2026_Str0ng',
});

async function checkColumns() {
  try {
    await client.connect();
    console.log('🔍 Verificando colunas da tabela work_items...\n');
    
    const query = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'work_items'
      ORDER BY ordinal_position;
    `;
    
    const result = await client.query(query);
    
    console.log('Colunas disponíveis:');
    console.log('-'.repeat(60));
    result.rows.forEach(row => {
      console.log(`${row.column_name.padEnd(40)} ${row.data_type}`);
    });
    
    console.log('\n🔍 Verificando tipos de work item únicos no banco:\n');
    
    const typeQuery = `
      SELECT 
        COALESCE(type, 'NULL') as type,
        COUNT(*) as total
      FROM work_items
      WHERE state = 'Closed'
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
      GROUP BY type
      ORDER BY total DESC;
    `;
    
    const typeResult = await client.query(typeQuery);
    
    console.log('Tipos de Work Item encontrados em 2026:');
    console.log('-'.repeat(60));
    typeResult.rows.forEach(row => {
      console.log(`${row.type.padEnd(40)} ${row.total} itens`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkColumns();
