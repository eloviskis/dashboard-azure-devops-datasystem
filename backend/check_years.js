const { Client } = require('pg');

const client = new Client({
  host: '187.77.55.172',
  port: 5432,
  database: 'devops_dashboard',
  user: 'devops_dash',
  password: 'D3v0ps_D4sh_2026_Str0ng',
});

async function checkYears() {
  try {
    await client.connect();
    console.log('🔍 Verificando anos disponíveis no banco de dados...\n');
    
    const query = `
      SELECT 
        EXTRACT(YEAR FROM closed_date::timestamp) as year,
        COUNT(*) as total
      FROM work_items
      WHERE state = 'Closed'
        AND closed_date IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM closed_date::timestamp)
      ORDER BY year DESC;
    `;
    
    const result = await client.query(query);
    
    console.log('Anos com itens fechados:');
    console.log('------------------------');
    result.rows.forEach(row => {
      console.log(`Ano ${row.year}: ${row.total} itens`);
    });
    
    console.log('\n🔍 Verificando dados por time e mês:\n');
    
    const teamMapping = {
      'Sustentacao': 'Sustentação',
      'Boltz': ['Boitz', 'Boltz'],
      'Estrategico': ['Estratégico', 'Estrategico'],
      'Tatico': ['Idtico', 'Tatico']
    };
    
    for (const [teamName, teamFilter] of Object.entries(teamMapping)) {
      const filter = Array.isArray(teamFilter) ? teamFilter : [teamFilter];
      
      const query2 = `
        SELECT 
          EXTRACT(YEAR FROM closed_date::timestamp) as year,
          EXTRACT(MONTH FROM closed_date::timestamp) as month,
          COUNT(*) as total
        FROM work_items
        WHERE state = 'Closed'
          AND area_path = ANY($1)
          AND closed_date IS NOT NULL
        GROUP BY EXTRACT(YEAR FROM closed_date::timestamp), EXTRACT(MONTH FROM closed_date::timestamp)
        ORDER BY year DESC, month DESC
        LIMIT 10;
      `;
      
      const result2 = await client.query(query2, [filter]);
      
      console.log(`\n${teamName}:`);
      result2.rows.forEach(row => {
        const monthName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][row.month - 1];
        console.log(`  ${row.year}/${monthName}: ${row.total} itens`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkYears();
