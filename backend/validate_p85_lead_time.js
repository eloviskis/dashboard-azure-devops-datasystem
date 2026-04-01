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

async function validateP85LeadTime() {
  try {
    await client.connect();
    console.log('🔍 VALIDAÇÃO: LEAD TIME com PERCENTIL 85\n');
    console.log('💡 Lead Time = created_date → closed_date (tempo total desde criação)\n');
    console.log('='.repeat(80));
    
    const results = {
      mean: { correct: 0, total: 0 },
      p50: { correct: 0, total: 0 },
      p75: { correct: 0, total: 0 },
      p85: { correct: 0, total: 0 },
      p90: { correct: 0, total: 0 },
      p95: { correct: 0, total: 0 }
    };
    
    const detailedResults = [];

    for (const [teamName, months] of Object.entries(competitorData)) {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('='.repeat(80));
      
      for (const [monthName, expectedValue] of Object.entries(months)) {
        const monthMap = {
          'JANEIRO': 1,
          'FEVEREIRO': 2,
          'MARÇO': 3
        };
        const monthNumber = monthMap[monthName];
        
        // Mapear nomes de times para os nomes no banco
        const teamMapping = {
          'Sustentacao': 'Sustentação',
          'Boltz': ['Boitz', 'Boltz'],
          'Estrategico': ['Estratégico', 'Estrategico'],
          'Tatico': ['Idtico', 'Tatico']
        };
        
        let teamFilter = teamMapping[teamName];
        if (!Array.isArray(teamFilter)) {
          teamFilter = [teamFilter];
        }
        
        // Lead Time: created_date → closed_date
        const query = `
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
            AND area_path = ANY($1)
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND created_date IS NOT NULL
            AND closed_date IS NOT NULL
          ORDER BY lead_time_days;
        `;
        
        const result = await client.query(query, [teamFilter, monthNumber]);
        const items = result.rows;
        
        if (items.length === 0) {
          console.log(`\n📅 ${monthName} — 0 itens (sem dados)`);
          continue;
        }
        
        const leadTimes = items.map(item => parseFloat(item.lead_time_days)).filter(v => !isNaN(v) && v >= 0);
        
        if (leadTimes.length === 0) {
          console.log(`\n📅 ${monthName} — ${items.length} itens, mas todos com lead_time inválido`);
          continue;
        }
        
        const mean = calculateMean(leadTimes);
        const p50 = calculatePercentile(leadTimes, 50);
        const p75 = calculatePercentile(leadTimes, 75);
        const p85 = calculatePercentile(leadTimes, 85);
        const p90 = calculatePercentile(leadTimes, 90);
        const p95 = calculatePercentile(leadTimes, 95);
        
        const threshold = 3; // ±3 dias
        
        const metrics = [
          { name: 'Média', value: mean, key: 'mean' },
          { name: 'P50 (median)', value: p50, key: 'p50' },
          { name: 'P75', value: p75, key: 'p75' },
          { name: 'P85', value: p85, key: 'p85' },
          { name: 'P90', value: p90, key: 'p90' },
          { name: 'P95', value: p95, key: 'p95' }
        ];
        
        console.log(`\n📅 ${monthName} — ${leadTimes.length} itens:`);
        console.log(`   Concorrente: ${expectedValue.toString().padStart(4)}d`);
        
        metrics.forEach(metric => {
          if (metric.value === null || isNaN(metric.value)) {
            console.log(`   ${metric.name.padEnd(14)}: NaNd (diff: NaNd) ❌`);
            return;
          }
          
          const diff = Math.abs(Math.round(metric.value) - expectedValue);
          const isCorrect = diff <= threshold;
          const star = metric.key === 'p85' ? ' ⭐' : '';
          const icon = isCorrect ? '✅' : '❌';
          
          console.log(`   ${metric.name.padEnd(14)}: ${Math.round(metric.value).toString().padStart(4)}d (diff: ${diff.toString().padStart(3)}d) ${icon}${star}`);
          
          if (metric.value !== null && !isNaN(metric.value)) {
            results[metric.key].total++;
            if (isCorrect) {
              results[metric.key].correct++;
            }
          }
        });
        
        detailedResults.push({
          team: teamName,
          month: monthName,
          competitor: expectedValue,
          p85: p85 !== null ? Math.round(p85) : null,
          mean: mean !== null ? Math.round(mean) : null
        });
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMO FINAL — TAXAS DE PRECISÃO (LEAD TIME)');
    console.log('='.repeat(80));
    console.log('Métrica          | Corretas | Total | Precisão');
    console.log('-------------------------------------------------------');
    
    Object.entries(results).forEach(([key, data]) => {
      const precision = data.total > 0 ? ((data.correct / data.total) * 100).toFixed(1) : '0.0';
      const label = {
        mean: 'Média',
        p50: 'Percentil 50',
        p75: 'Percentil 75',
        p85: 'Percentil 85  ⭐',
        p90: 'Percentil 90',
        p95: 'Percentil 95'
      }[key];
      console.log(`${label.padEnd(17)}| ${data.correct.toString().padStart(8)} | ${data.total.toString().padStart(5)} | ${precision.padStart(6)}%`);
    });
    
    const p85Precision = results.p85.total > 0 ? ((results.p85.correct / results.p85.total) * 100).toFixed(1) : '0.0';
    const meanPrecision = results.mean.total > 0 ? ((results.mean.correct / results.mean.total) * 100).toFixed(1) : '0.0';
    
    console.log('\n' + '='.repeat(80));
    console.log('💡 CONCLUSÃO');
    console.log('='.repeat(80));
    
    if (parseFloat(p85Precision) >= 75) {
      console.log('✅ CONFIRMADO: Percentil 85 do LEAD TIME bate com a concorrente!');
      console.log(`   P85: ${p85Precision}% vs Média: ${meanPrecision}%`);
    } else if (parseFloat(p85Precision) > parseFloat(meanPrecision) && parseFloat(p85Precision) >= 50) {
      console.log('⚠️ Percentil 85 do LEAD TIME melhora significativamente a precisão.');
      console.log(`   P85: ${p85Precision}% vs Média: ${meanPrecision}%`);
    } else {
      console.log('⚠️ Percentil 85 do LEAD TIME melhora a precisão, mas não é conclusivo.');
      console.log(`   P85: ${p85Precision}% vs Média: ${meanPrecision}%`);
    }
    
    console.log('\n\n📋 DETALHAMENTO POR TIME/MÊS:\n');
    console.log('Time            Mês          Concorrente   P85 (LT)      Média (LT)');
    console.log('-'.repeat(80));
    
    detailedResults.forEach(r => {
      const p85Str = r.p85 !== null ? `${r.p85}d` : 'N/A';
      const meanStr = r.mean !== null ? `${r.mean}d` : 'NaNd';
      const p85Match = r.p85 !== null && Math.abs(r.p85 - r.competitor) <= 3 ? '✅' : '❌';
      const meanMatch = r.mean !== null && Math.abs(r.mean - r.competitor) <= 3 ? '✅' : '❌';
      
      console.log(
        `${r.team.padEnd(16)}${r.month.padEnd(13)}${r.competitor}d`.padEnd(28) +
        `${p85Match} ${p85Str.padStart(6)}`.padEnd(18) +
        `${meanMatch} ${meanStr}`
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

validateP85LeadTime();
