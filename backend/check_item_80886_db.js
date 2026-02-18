require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkItemInDB() {
  try {
    console.log('\nBuscando item 80886 no banco de dados...\n');
    
    const result = await pool.query(
      `SELECT 
        id, 
        title, 
        type, 
        state, 
        created_by, 
        ready_date,
        created_date,
        done_date,
        synced_at
      FROM work_items 
      WHERE id = $1`,
      [80886]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Item 80886 NÃO encontrado no banco de dados');
      console.log('Isso significa que o item não foi sincronizado ainda.');
    } else {
      const item = result.rows[0];
      console.log('✅ Item 80886 encontrado no banco:');
      console.log('─'.repeat(60));
      console.log(`ID: ${item.id}`);
      console.log(`Title: ${item.title}`);
      console.log(`Type: ${item.type}`);
      console.log(`State: ${item.state}`);
      console.log(`Created By: ${item.created_by}`);
      console.log(`Created Date: ${item.created_date}`);
      console.log(`Ready Date (DOR): ${item.ready_date || '❌ VAZIO/NULL'}`);
      console.log(`Done Date: ${item.done_date || '(não fechado)'}`);
      console.log(`Synced At: ${item.synced_at}`);
      console.log('─'.repeat(60));
      
      if (!item.ready_date) {
        console.log('\n⚠️  O campo ready_date está VAZIO/NULL');
        console.log('Por isso o item não está sendo contado como "Com DOR"');
        console.log('\nO backend busca o campo "Custom.ReadyDate" do Azure DevOps');
        console.log('Verifique se esse é o nome correto do campo no Azure DevOps');
      } else {
        console.log('\n✅ O campo ready_date está preenchido:',item.ready_date);
        console.log('Este item DEVERIA aparecer como "Com DOR"');
      }
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await pool.end();
  }
}

checkItemInDB();
