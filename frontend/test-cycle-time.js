// Script de teste para analisar dados de Cycle Time
const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

// Simular dados do backend
async function fetchData() {
  const token = process.env.AUTH_TOKEN || '';
  const url = 'https://backend-hazel-three-14.vercel.app/api/items';
  
  console.log('Buscando dados do backend...');
  
  // Buscar direto do banco
  const { Client } = require('pg');
  const client = new Client({
    connectionString: 'postgresql://devops_dash:6BYHS3gSL%2FzBNnoEW%2Bt9mev84%2FJwv5ke%2BJdfOzM7jXQ%3D@31.97.64.250:5433/devops_dashboard'
  });
  
  await client.connect();
  
  // Query para analisar dados
  const result = await client.query(`
    SELECT 
      EXTRACT(YEAR FROM closed_date::timestamp) as ano,
      state,
      COUNT(*) as total,
      SUM(CASE WHEN first_activation_date IS NOT NULL AND first_activation_date != '' THEN 1 ELSE 0 END) as com_activation,
      SUM(CASE WHEN created_date IS NOT NULL AND created_date != '' THEN 1 ELSE 0 END) as com_created
    FROM work_items 
    WHERE closed_date IS NOT NULL 
      AND closed_date != '' 
      AND state IN ('Closed', 'Done', 'Finished', 'Resolved')
    GROUP BY EXTRACT(YEAR FROM closed_date::timestamp), state
    ORDER BY ano, state
  `);
  
  console.log('\n=== Dados por ano e estado ===');
  console.table(result.rows);
  
  // Verificar amostra de dados
  const sample = await client.query(`
    SELECT id, state, created_date, closed_date, first_activation_date
    FROM work_items 
    WHERE closed_date IS NOT NULL 
      AND closed_date != '' 
      AND state = 'Closed'
    ORDER BY closed_date DESC
    LIMIT 5
  `);
  
  console.log('\n=== Amostra de 5 itens fechados ===');
  console.table(sample.rows);
  
  // Verificar se os dados podem calcular cycle time
  const calcTest = await client.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN created_date IS NOT NULL AND created_date != '' AND closed_date IS NOT NULL AND closed_date != '' THEN 1 ELSE 0 END) as pode_calcular_ct
    FROM work_items 
    WHERE state IN ('Closed', 'Done', 'Finished', 'Resolved')
  `);
  
  console.log('\n=== Capacidade de calcular Cycle Time ===');
  console.table(calcTest.rows);
  
  await client.end();
}

fetchData().catch(console.error);
