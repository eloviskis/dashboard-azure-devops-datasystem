const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: false 
});

async function checkUsers() {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users ORDER BY id');
    
    console.log('\n👥 Usuários cadastrados:');
    console.log(`Total: ${result.rows.length}\n`);
    
    if (result.rows.length === 0) {
      console.log('⚠️  Nenhum usuário encontrado!');
      console.log('   Execute: node backend/server.js para criar usuário admin padrão\n');
    } else {
      result.rows.forEach(user => {
        console.log(`  [${user.id}] ${user.username} (${user.email}) - Role: ${user.role}`);
      });
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
