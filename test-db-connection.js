const { Pool } = require('pg');

// Password: 6BYHS3gSL/zBNnoEW+t9mev84/Jwv5ke+JdfOzM7jXQ=
// URL-encoded: / = %2F, + = %2B, = = %3D
const connectionString = 'postgresql://devops_dash:6BYHS3gSL%2FzBNnoEW%2Bt9mev84%2FJwv5ke%2BJdfOzM7jXQ%3D@31.97.64.250:5433/devops_dashboard';

console.log('🔍 Testando conexão com PostgreSQL na VPS...');
console.log('Host: 31.97.64.250:5433');
console.log('Database: devops_dashboard');
console.log('User: devops_dash\n');

const pool = new Pool({
  connectionString,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 5000,
});

async function testConnection() {
  try {
    console.log('⏳ Conectando...');
    const start = Date.now();
    
    const result = await pool.query(`
      SELECT 
        NOW() as current_time,
        version() as pg_version,
        current_database() as database,
        pg_size_pretty(pg_database_size(current_database())) as db_size
    `);
    
    const duration = Date.now() - start;
    
    console.log('✅ CONEXÃO ESTABELECIDA COM SUCESSO!\n');
    console.log(`⏱️  Tempo de resposta: ${duration}ms`);
    console.log(`🕐 Hora do servidor: ${result.rows[0].current_time}`);
    console.log(`🗄️  Database: ${result.rows[0].database}`);
    console.log(`📦 Tamanho: ${result.rows[0].db_size}`);
    console.log(`🐘 Versão: ${result.rows[0].pg_version.split(',')[0]}\n`);
    
    // Testar dados
    console.log('📊 Testando dados...');
    const countResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM work_items) as work_items_count,
        (SELECT COUNT(*) FROM pull_requests) as prs_count
    `);
    
    console.log(`✅ Work Items: ${countResult.rows[0].work_items_count}`);
    console.log(`✅ Pull Requests: ${countResult.rows[0].prs_count}\n`);
    
    // Testar item recente
    const recentItem = await pool.query(`
      SELECT id, title, state, changed_date 
      FROM work_items 
      ORDER BY changed_date DESC 
      LIMIT 1
    `);
    
    if (recentItem.rows.length > 0) {
      console.log('📋 Item mais recente:');
      console.log(`   ID: ${recentItem.rows[0].id}`);
      console.log(`   Título: ${recentItem.rows[0].title}`);
      console.log(`   Estado: ${recentItem.rows[0].state}`);
      console.log(`   Atualizado: ${recentItem.rows[0].changed_date}\n`);
    }
    
    console.log('🎉 BANCO DE DADOS FUNCIONANDO PERFEITAMENTE!');
    
  } catch (error) {
    console.error('❌ ERRO AO CONECTAR:\n');
    console.error(`Tipo: ${error.code || 'UNKNOWN'}`);
    console.error(`Mensagem: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Possíveis causas:');
      console.error('   - PostgreSQL não está rodando na VPS');
      console.error('   - Porta 5433 bloqueada por firewall');
      console.error('   - IP/porta incorretos');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n💡 Possíveis causas:');
      console.error('   - Firewall bloqueando conexão');
      console.error('   - VPS offline ou inacessível');
    } else if (error.code === '28P01') {
      console.error('\n💡 Senha ou usuário incorretos');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();
