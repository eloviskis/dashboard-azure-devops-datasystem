const axios = require('axios');
const ical = require('node-ical');
const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não definido no .env');
  process.exit(1);
}

const isLocalDb = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

const url = 'https://outlook.office365.com/owa/calendar/f4c67593d8e94418ab14e0087ba7cdc0@datasystem.com.br/7e278aaac7b34448954655d0160913fd3606670720141208884/calendar.ics';

const keywords = ['refinamento', 'review', 'sprint review', 'retrospectiva', 'retro', 'apresentação', 'apresentacao', 'result', 'resultado', 'planning', 'planing', 'daily', 'sprint'];
const startDate = new Date('2025-06-01');
const endDate = new Date();

// Mapear nomes de times encontrados nos títulos dos eventos
const teamMapping = {
  'ctc': 'Franquia',
  'franquia': 'Franquia',
  'castelini': 'Castelini',
  'estratégico': 'Estrategico',
  'estrategico': 'Estrategico',
  'tático': 'Tatico',
  'tatico': 'Tatico',
  'monjuá': 'Monjua',
  'monjua': 'Monjua',
  'condado': 'Sustentacao',  // Condado geralmente é Sustentação
  'constance': 'Sustentacao',
  'boltz': 'Boltz',
  'mordor': 'Boltz',  // Mordor parece ser Boltz
  'wakanda': 'Wakanda',
  'inovação': 'Inovacao',
  'inovacao': 'Inovacao',
  'diretoria': 'Diretoria',
  'sustentação': 'Sustentacao',
  'sustentacao': 'Sustentacao',
  'retaguarda': 'Tatico',  // Retaguarda geralmente é Tático
  'frente de loja': 'Estrategico',  // Frente de loja geralmente é Estratégico
  'gotham': 'Estrategico',
  'war room': 'Sustentacao'
};

// Inferir tipo de cerimônia do título
function inferRitualType(title) {
  const lower = title.toLowerCase();
  if (lower.includes('planning') || lower.includes('planing')) return 'planning';
  if (lower.includes('daily')) return 'daily';
  if (lower.includes('refinamento')) return 'refinamento';
  if (lower.includes('retrospectiva') || lower.includes('retro')) return 'retrospectiva';
  if (lower.includes('review')) return 'review';
  if (lower.includes('apresentação') || lower.includes('apresentacao') || lower.includes('resultado')) return 'review';
  return 'daily'; // fallback
}

// Extrair time do título
function extractTeam(title) {
  const lower = title.toLowerCase();
  for (const [keyword, team] of Object.entries(teamMapping)) {
    if (lower.includes(keyword)) {
      return team;
    }
  }
  return null; // não identificado
}

(async () => {
  try {
    console.log('🔍 Baixando calendário...\n');
    const response = await axios.get(url, { timeout: 10000 });
    
    console.log('📅 Parseando eventos...\n');
    const events = ical.sync.parseICS(response.data);
    
    const toImport = [];
    
    for (const k in events) {
      const ev = events[k];
      if (ev.type !== 'VEVENT') continue;
      
      const summaryValue = typeof ev.summary === 'string' ? ev.summary : (ev.summary?.val || '');
      const summary = summaryValue.toLowerCase();
      if (!keywords.some(kw => summary.includes(kw))) continue;
      
      if (!ev.start) continue;
      
      const eventDate = new Date(ev.start);
      if (eventDate < startDate || eventDate > endDate) continue;
      
      const date = eventDate.toISOString().slice(0, 10);
      const time = eventDate.toISOString().slice(11, 16);
      
      const team = extractTeam(summaryValue);
      const ritualType = inferRitualType(summaryValue);
      
      toImport.push({
        title: summaryValue,
        date,
        time,
        team,
        ritualType
      });
    }
    
    console.log(`✅ Encontrou ${toImport.length} eventos para importar\n`);
    
    // Buscar teams válidos do banco
    const teamsResult = await pool.query('SELECT DISTINCT team FROM ceremony_config ORDER BY team');
    const validTeams = teamsResult.rows.map(r => r.team);
    
    console.log('📊 Times válidos no banco:', validTeams.join(', '), '\n');
    
    // Separar eventos com e sem time identificado
    const withTeam = toImport.filter(e => e.team && validTeams.includes(e.team));
    const withoutTeam = toImport.filter(e => !e.team || !validTeams.includes(e.team));
    
    console.log(`✅ ${withTeam.length} eventos COM time identificado`);
    console.log(`⚠️  ${withoutTeam.length} eventos SEM time identificado (serão pulados)\n`);
    
    if (withoutTeam.length > 0) {
      console.log('❌ Eventos sem time (não serão importados):');
      withoutTeam.forEach((e, i) => {
        console.log(`   ${i + 1}. ${e.title} (${e.date})`);
      });
      console.log('');
    }
    
    // Inserir eventos com time identificado
    let inserted = 0;
    let skipped = 0;
    
    for (const event of withTeam) {
      try {
        // Verificar se já existe (evitar duplicados)
        const existing = await pool.query(
          'SELECT id FROM ceremony_records WHERE team = $1 AND ritual_type = $2 AND scheduled_date = $3',
          [event.team, event.ritualType, event.date]
        );
        
        if (existing.rows.length > 0) {
          console.log(`⏭️  Pulando (já existe): ${event.title} - ${event.date}`);
          skipped++;
          continue;
        }
        
        await pool.query(
          `INSERT INTO ceremony_records (team, ritual_type, scheduled_date, status, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.team, event.ritualType, event.date, 'done', event.title]
        );
        
        console.log(`✅ Importado: ${event.title} → Time: ${event.team}, Tipo: ${event.ritualType}, Data: ${event.date}`);
        inserted++;
        
      } catch (err) {
        console.error(`❌ Erro ao inserir: ${event.title} - ${err.message}`);
      }
    }
    
    console.log(`\n📊 RESUMO:`);
    console.log(`   ✅ ${inserted} eventos importados`);
    console.log(`   ⏭️  ${skipped} eventos já existiam (pulados)`);
    console.log(`   ❌ ${withoutTeam.length} eventos sem time identificado`);
    console.log(`\n🎯 Total processado: ${toImport.length} eventos`);
    
    await pool.end();
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
