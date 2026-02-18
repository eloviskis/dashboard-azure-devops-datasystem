// Script para executar a migration de adicionar campos identificacao e falha_do_processo
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não configurado');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // VPS PostgreSQL sempre usa SSL
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Executando migration...');
    
    // Adicionar colunas
    await client.query('ALTER TABLE work_items ADD COLUMN IF NOT EXISTS identificacao TEXT');
    console.log('✅ Coluna identificacao adicionada');
    
    await client.query('ALTER TABLE work_items ADD COLUMN IF NOT EXISTS falha_do_processo TEXT');
    console.log('✅ Coluna falha_do_processo adicionada');
    
    console.log('✅ Migration concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na migration:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
