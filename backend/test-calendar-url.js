const axios = require('axios');
const ical = require('node-ical');

const url = 'https://outlook.office365.com/owa/calendar/f4c67593d8e94418ab14e0087ba7cdc0@datasystem.com.br/7e278aaac7b34448954655d0160913fd3606670720141208884/calendar.ics';

const keywords = ['refinamento', 'review', 'sprint review', 'retrospectiva', 'retro', 'apresentação', 'apresentacao', 'result', 'resultado', 'planning', 'planing', 'daily', 'sprint'];
const startDate = new Date('2025-06-01');
const endDate = new Date();

(async () => {
  try {
    console.log('🔍 Baixando calendário da URL...\n');
    const response = await axios.get(url, { timeout: 10000 });
    console.log(`✅ Download OK (${response.data.length} bytes)\n`);
    
    console.log('📅 Parseando eventos...\n');
    const events = ical.sync.parseICS(response.data);
    
    let count = 0;
    const found = [];
    
    for (const k in events) {
      const ev = events[k];
      if (ev.type !== 'VEVENT') continue;
      
      const summaryValue = typeof ev.summary === 'string' ? ev.summary : (ev.summary?.val || '');
      const summary = summaryValue.toLowerCase();
      if (!keywords.some(kw => summary.includes(kw))) continue;
      
      if (!ev.start) continue;
      
      const eventDate = new Date(ev.start);
      if (eventDate < startDate || eventDate > endDate) continue;
      
      count++;
      const date = eventDate.toISOString().slice(0, 10);
      const time = eventDate.toISOString().slice(11, 16);
      found.push({ title: summaryValue, date, time });
    }
    
    console.log(`✅ Encontrou ${count} eventos de cerimônias (01/06/2025 - hoje):\n`);
    
    found.forEach((ev, i) => {
      console.log(`${i + 1}. ${ev.title}`);
      console.log(`   📅 ${ev.date} às ${ev.time}\n`);
    });
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
})();
