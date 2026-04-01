const { Client } = require('pg');

const client = new Client({
  host: '187.77.55.172',
  port: 5432,
  database: 'devops_dashboard',
  user: 'devops_dash',
  password: 'D3v0ps_D4sh_2026_Str0ng',
});

// Dados da concorrente GetNaves
const competitorData = {
  'Sustentacao': {
    'JANEIRO': 21,
    'FEVEREIRO': 7,
    'MARÇO': 9
  },
  'Boltz': {
    'JANEIRO': 59,
    'FEVEREIRO': 20,
    'MARÇO': 30
  },
  'Estrategico': {
    'JANEIRO': 46,
    'FEVEREIRO': 34,
    'MARÇO': 34
  },
  'Tatico': {
    'JANEIRO': 92,
    'FEVEREIRO': 102,
    'MARÇO': 14
  }
};

function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return null;
  
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (lower === upper) {
    return sorted[lower];
  }
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function calculateMean(arr) {
  if (arr.length === 0) return null;
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum / arr.length;
}

async function validateBothMetrics() {
  try {
    await client.connect();
    console.log('🔍 VALIDAÇÃO COMPLETA: Percentil 85 - CYCLE TIME vs LEAD TIME\n');
    console.log('='.repeat(80));
    
    const cycleTimeResults = {
      p85: { correct: 0, total: 0 }
    };
    
    const leadTimeResults = {
      p85: { correct: 0, total: 0 }
    };
    
    const detailedResults = [];

    for (const [teamName, months] of Object.entries(competitorData)) {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('='.repeat(80));
      
      // Mapear nomes de times para area_path corretos
      const areaPathMapping = {
        'Sustentacao': 'USE\\Sustentacao',
        'Boltz': 'USE\\Boltz',
        'Estrategico': 'USE\\Estrategico',
        'Tatico': 'USE\\Tatico'
      };
      
      const areaPath = areaPathMapping[teamName];
      
      for (const [monthName, expectedValue] of Object.entries(months)) {
        const monthMap = {
          'JANEIRO': 1,
          'FEVEREIRO': 2,
          'MARÇO': 3
        };
        const monthNumber = monthMap[monthName];
        
        // Query para CYCLE TIME (first_activation_date → closed_date)
        const cycleQuery = `
          SELECT 
            id,
            title,
            area_path,
            first_activation_date,
            closed_date,
            EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400.0 AS cycle_time_days
          FROM work_items
          WHERE 
            state = 'Closed'
            AND area_path = $1
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND first_activation_date IS NOT NULL
            AND closed_date IS NOT NULL
          ORDER BY cycle_time_days;
        `;
        
        const cycleResult = await client.query(cycleQuery, [areaPath, monthNumber]);
        const cycleTimes = cycleResult.rows
          .map(item => parseFloat(item.cycle_time_days))
          .filter(v => !isNaN(v) && v >= 0);
        
        // Query para LEAD TIME (created_date → closed_date)
        const leadQuery = `
          SELECT 
            id,
            title,
            area_path,
            created_date,
            closed_date,
            EXTRACT(EPOCH FROM (closed_date::timestamp - created_date::timestamp)) / 86400.0 AS lead_time_days
          FROM work_items
          WHERE 
            state = 'Closed'
            AND area_path = $1
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND created_date IS NOT NULL
            AND closed_date IS NOT NULL
          ORDER BY lead_time_days;
        `;
        
        const leadResult = await client.query(leadQuery, [areaPath, monthNumber]);
        const leadTimes = leadResult.rows
          .map(item => parseFloat(item.lead_time_days))
          .filter(v => !isNaN(v) && v >= 0);
        
        const cycleP85 = cycleTimes.length > 0 ? calculatePercentile(cycleTimes, 85) : null;
        const leadP85 = leadTimes.length > 0 ? calculatePercentile(leadTimes, 85) : null;
        
        const threshold = 3; // ±3 dias
        
        console.log(`\n📅 ${monthName}`);
        console.log(`   Concorrente:       ${expectedValue}d`);
        console.log(`   ───────────────────────────────────`);
        console.log(`   ${cycleTimes.length} itens com Cycle Time válido`);
        console.log(`   ${leadTimes.length} itens com Lead Time válido`);
        console.log(`   ───────────────────────────────────`);
        
        if (cycleP85 !== null) {
          const cycleDiff = Math.abs(Math.round(cycleP85) - expectedValue);
          const cycleCorrect = cycleDiff <= threshold;
          cycleTimeResults.p85.total++;
          if (cycleCorrect) cycleTimeResults.p85.correct++;
          
          const cycleIcon = cycleCorrect ? '✅' : '❌';
          console.log(`   Cycle Time P85:    ${Math.round(cycleP85)}d (diff: ${cycleDiff}d) ${cycleIcon}`);
        } else {
          console.log(`   Cycle Time P85:    N/A`);
        }
        
        if (leadP85 !== null) {
          const leadDiff = Math.abs(Math.round(leadP85) - expectedValue);
          const leadCorrect = leadDiff <= threshold;
          leadTimeResults.p85.total++;
          if (leadCorrect) leadTimeResults.p85.correct++;
          
          const leadIcon = leadCorrect ? '✅' : '❌';
          console.log(`   Lead Time P85:     ${Math.round(leadP85)}d (diff: ${leadDiff}d) ${leadIcon}`);
        } else {
          console.log(`   Lead Time P85:     N/A`);
        }
        
        detailedResults.push({
          team: teamName,
          month: monthName,
          competitor: expectedValue,
          cycleP85: cycleP85 !== null ? Math.round(cycleP85) : null,
          leadP85: leadP85 !== null ? Math.round(leadP85) : null
        });
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMO FINAL — PRECISÃO DO PERCENTIL 85');
    console.log('='.repeat(80));
    
    const cyclePrecision = cycleTimeResults.p85.total > 0 
      ? ((cycleTimeResults.p85.correct / cycleTimeResults.p85.total) * 100).toFixed(1) 
      : '0.0';
    
    const leadPrecision = leadTimeResults.p85.total > 0 
      ? ((leadTimeResults.p85.correct / leadTimeResults.p85.total) * 100).toFixed(1) 
      : '0.0';
    
    console.log(`\nCycle Time P85:  ${cycleTimeResults.p85.correct}/${cycleTimeResults.p85.total} corretas (${cyclePrecision}%)`);
    console.log(`Lead Time P85:   ${leadTimeResults.p85.correct}/${leadTimeResults.p85.total} corretas (${leadPrecision}%)`);
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 CONCLUSÃO');
    console.log('='.repeat(80));
    
    if (parseFloat(cyclePrecision) >= 75) {
      console.log('✅ CONFIRMADO: GetNaves usa PERCENTIL 85 do CYCLE TIME!');
      console.log(`   Precisão: ${cyclePrecision}%`);
    } else if (parseFloat(leadPrecision) >= 75) {
      console.log('✅ CONFIRMADO: GetNaves usa PERCENTIL 85 do LEAD TIME!');
      console.log(`   Precisão: ${leadPrecision}%`);
    } else {
      console.log(`⚠️ Nenhuma métrica atingiu 75% de precisão:`);
      console.log(`   Cycle Time P85: ${cyclePrecision}%`);
      console.log(`   Lead Time P85:  ${leadPrecision}%`);
      console.log(`\n💡 Possíveis causas:`);
      console.log(`   - Filtros adicionais (tipos de work item)`);
      console.log(`   - Diferentes definições de "Closed"`);
      console.log(`   - Períodos de análise diferentes`);
    }
    
    console.log('\n\n📋 DETALHAMENTO COMPLETO:\n');
    console.log('Time            Mês          Concorrente   Cycle P85    Lead P85');
    console.log('-'.repeat(75));
    
    detailedResults.forEach(r => {
      const cycleStr = r.cycleP85 !== null ? `${r.cycleP85}d` : 'N/A';
      const leadStr = r.leadP85 !== null ? `${r.leadP85}d` : 'N/A';
      const cycleMatch = r.cycleP85 !== null && Math.abs(r.cycleP85 - r.competitor) <= 3 ? '✅' : '❌';
      const leadMatch = r.leadP85 !== null && Math.abs(r.leadP85 - r.competitor) <= 3 ? '✅' : '❌';
      
      console.log(
        `${r.team.padEnd(16)}${r.month.padEnd(13)}${r.competitor}d`.padEnd(30) +
        `${cycleMatch} ${cycleStr.padStart(5)}`.padEnd(15) +
        `${leadMatch} ${leadStr.padStart(5)}`
      );
    });
    
    console.log('\n✅ Validação concluída!\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

validateBothMetrics();
