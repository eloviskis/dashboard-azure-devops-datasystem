require('dotenv').config();
const { Pool } = require('pg');

async function testarConexao() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.log('❌ DATABASE_URL não encontrada no .env');
    return false;
  }
  
  const config = {
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  };
  
  console.log('🔍 Testando conexão com PostgreSQL...\n');
  
  // Parse URL para mostrar info (sem senha)
  const url = new URL(connectionString.replace('postgresql://', 'http://'));
  console.log('Configuração:');
  console.log(`  Host: ${url.hostname}`);
  console.log(`  Port: ${url.port}`);
  console.log(`  Database: ${url.pathname.slice(1)}`);
  console.log(`  User: ${url.username}`);
  console.log();
  
  const pool = new Pool(config);
  
  try {
    console.log('⏳ Conectando...');
    const client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!\n');
    
    // Testar query
    const result = await client.query('SELECT COUNT(*) as total FROM work_items');
    const total = parseInt(result.rows[0].total);
    console.log(`📊 Total de itens no banco: ${total.toLocaleString('pt-BR')}`);
    
    client.release();
    
    // Testar campos DOR e DOD
    console.log('\n🔍 Testando campos DOR e DOD...');
    const dorDod = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE ready_date IS NOT NULL) as com_dor,
        COUNT(*) FILTER (WHERE done_date IS NOT NULL) as com_dod
      FROM work_items
    `);
    
    const { com_dor, com_dod } = dorDod.rows[0];
    console.log(`✅ Itens com DOR: ${parseInt(com_dor).toLocaleString('pt-BR')}`);
    console.log(`✅ Itens com DOD: ${parseInt(com_dod).toLocaleString('pt-BR')}`);
    
    return true;
  } catch (error) {
    console.log('❌ Falha na conexão!\n');
    console.log('Detalhes do erro:');
    console.log(`  Tipo: ${error.code || 'UNKNOWN'}`);
    console.log(`  Mensagem: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Possíveis soluções:');
      console.log('  1. Verificar se o PostgreSQL está rodando na VPS');
      console.log('  2. Verificar se o firewall está bloqueando a porta 5433');
      console.log('  3. Verificar se o IP/hostname está correto');
      console.log('  4. Testar conexão: telnet 31.97.64.250 5433');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 Host não encontrado - verificar DNS ou IP');
    } else if (error.code === '28P01') {
      console.log('\n💡 Senha incorreta - verificar DATABASE_URL no .env');
    }
    
    return false;
  } finally {
    await pool.end();
  }
}

testarConexao();
