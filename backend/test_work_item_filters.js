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

async function testWorkItemTypeFilters() {
  try {
    await client.connect();
    console.log('🔍 TESTE DE FILTROS POR TIPO DE WORK ITEM\n');
    console.log('='.repeat(80));
    
    const areaPathMapping = {
      'Sustentacao': 'USE\\Sustentacao',
      'Boltz': 'USE\\Boltz',
      'Estrategico': 'USE\\Estrategico',
      'Tatico': 'USE\\Tatico'
    };
    
    const workItemTypeFilters = [
      { name: 'TODOS', filter: null },
      { name: 'Sem Bug', filter: "type != 'Bug'" },
      { name: 'Sem Bug/Task', filter: "type NOT IN ('Bug', 'Task')" },
      { name: 'Apenas User Story', filter: "type = 'User Story'" },
      { name: 'User Story + Feature', filter: "type IN ('User Story', 'Feature')" },
      { name: 'User Story + Issue', filter: "type IN ('User Story', 'Issue')" },
      { name: 'Sem Eventuality', filter: "type != 'Eventuality'" },
      { name: 'Sem Bug/Eventuality', filter: "type NOT IN ('Bug', 'Eventuality')" },
      { name: 'Apenas Issue', filter: "type = 'Issue'" },
      { name: 'Issue + User Story + Feature', filter: "type IN ('Issue', 'User Story', 'Feature')" }
    ];
    
    const filterResults = {};
    workItemTypeFilters.forEach(f => {
      filterResults[f.name] = { correct: 0, total: 0 };
    });

    for (const [teamName, months] of Object.entries(competitorData)) {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('='.repeat(80));
      
      const areaPath = areaPathMapping[teamName];
      
      for (const [monthName, expectedValue] of Object.entries(months)) {
        const monthMap = {
          'JANEIRO': 1,
          'FEVEREIRO': 2,
          'MARÇO': 3
        };
        const monthNumber = monthMap[monthName];
        
        console.log(`\n📅 ${monthName} — Concorrente: ${expectedValue}d`);
        console.log(`${'─'.repeat(60)}`);
        
        for (const filterConfig of workItemTypeFilters) {
          let whereClause = `
            state = 'Closed'
            AND area_path = $1
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND first_activation_date IS NOT NULL
            AND closed_date IS NOT NULL
          `;
          
          if (filterConfig.filter) {
            whereClause += ` AND ${filterConfig.filter}`;
          }
          
          const query = `
            SELECT 
              EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400.0 AS cycle_time_days
            FROM work_items
            WHERE ${whereClause}
            ORDER BY cycle_time_days;
          `;
          
          const result = await client.query(query, [areaPath, monthNumber]);
          const cycleTimes = result.rows
            .map(item => parseFloat(item.cycle_time_days))
            .filter(v => !isNaN(v) && v >= 0);
          
          const p85 = cycleTimes.length > 0 ? calculatePercentile(cycleTimes, 85) : null;
          
          if (p85 !== null) {
            const diff = Math.abs(Math.round(p85) - expectedValue);
            const isCorrect = diff <= 3;
            const icon = isCorrect ? '✅' : '❌';
            
            filterResults[filterConfig.name].total++;
            if (isCorrect) filterResults[filterConfig.name].correct++;
            
            console.log(`   ${filterConfig.name.padEnd(25)}: ${Math.round(p85).toString().padStart(3)}d (${cycleTimes.length.toString().padStart(3)} itens, diff: ${diff.toString().padStart(3)}d) ${icon}`);
          } else {
            console.log(`   ${filterConfig.name.padEnd(25)}: N/A (0 itens)`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMO FINAL — PRECISÃO POR FILTRO');
    console.log('='.repeat(80));
    console.log('\nFiltro                      | Corretas | Total | Precisão');
    console.log('-'.repeat(65));
    
    const sortedResults = Object.entries(filterResults)
      .map(([name, data]) => ({
        name,
        correct: data.correct,
        total: data.total,
        precision: data.total > 0 ? ((data.correct / data.total) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => parseFloat(b.precision) - parseFloat(a.precision));
    
    sortedResults.forEach(result => {
      const star = parseFloat(result.precision) >= 75 ? ' ⭐' : '';
      console.log(
        `${result.name.padEnd(28)}| ${result.correct.toString().padStart(8)} | ${result.total.toString().padStart(5)} | ${result.precision.padStart(6)}%${star}`
      );
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 CONCLUSÃO');
    console.log('='.repeat(80));
    
    const bestFilter = sortedResults[0];
    if (parseFloat(bestFilter.precision) >= 75) {
      console.log(`\n✅ CONFIRMADO: GetNaves usa Cycle Time P85 com filtro "${bestFilter.name}"!`);
      console.log(`   Precisão: ${bestFilter.precision}% (${bestFilter.correct}/${bestFilter.total})`);
    } else if (parseFloat(bestFilter.precision) >= 50) {
      console.log(`\n⚠️ Melhor filtro: "${bestFilter.name}" com ${bestFilter.precision}% de precisão`);
      console.log(`   Ainda não é conclusivo. Pode haver outros filtros ou configurações.`);
    } else {
      console.log(`\n⚠️ Nenhum filtro atingiu 50% de precisão.`);
      console.log(`   Melhor resultado: "${bestFilter.name}" com ${bestFilter.precision}%`);
      console.log(`\n💡 Possíveis causas:`);
      console.log(`   - Combinação de múltiplos filtros`);
      console.log(`   - Filtros por campos customizados`);
      console.log(`   - Diferentes períodos de análise`);
      console.log(`   - Estados específicos além de "Closed"`);
    }
    
    console.log('\n✅ Análise concluída!\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

testWorkItemTypeFilters();
