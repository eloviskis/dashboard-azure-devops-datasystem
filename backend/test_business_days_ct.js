/**
 * Teste: Calcular Cycle Time em DIAS ÚTEIS (excluindo fins de semana)
 * para ver se aproxima dos valores da concorrente
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard',
  ssl: false,
});

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const COMPETITOR_DATA = {
  'Sustentacao': { 'JANEIRO': 21, 'FEVEREIRO': 7, 'MARÇO': 9, '2026': 12, 'MEDIA': 12 },
  'Boltz': { 'JANEIRO': 59, 'FEVEREIRO': 20, 'MARÇO': 30, '2026': 20, 'MEDIA': 36 },
  'Estrategico': { 'JANEIRO': 46, 'FEVEREIRO': 34, 'MARÇO': 34, '2026': 36, 'MEDIA': 38 },
  'Tatico': { 'JANEIRO': 92, 'FEVEREIRO': 102, 'MARÇO': 14, '2026': 97, 'MEDIA': 69 }
};

// Função para calcular dias úteis entre duas datas
function calcularDiasUteis(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  
  let diasUteis = 0;
  let atual = new Date(inicio);
  
  while (atual <= fim) {
    const diaSemana = atual.getDay();
    // 0 = Domingo, 6 = Sábado
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasUteis++;
    }
    atual.setDate(atual.getDate() + 1);
  }
  
  return diasUteis;
}

async function testBusinessDays() {
  console.log('🔍 TESTE: Cycle Time com DIAS ÚTEIS (excluindo fins de semana)\n');

  try {
    const query = `
      SELECT 
        work_item_id,
        team,
        state,
        first_activation_date,
        closed_date,
        EXTRACT(MONTH FROM closed_date::timestamp) as month,
        EXTRACT(YEAR FROM closed_date::timestamp) as year
      FROM work_items
      WHERE 
        state = ANY($1)
        AND first_activation_date IS NOT NULL
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND team IN ('Sustentacao', 'Boltz', 'Estrategico', 'Tatico')
      ORDER BY team, closed_date
    `;

    const result = await pool.query(query, [COMPLETED_STATES]);
    console.log(`📊 Total de itens: ${result.rows.length}\n`);

    // Agrupar por time e mês
    const teamMonthData = {};
    
    result.rows.forEach(row => {
      const team = row.team;
      const month = parseInt(row.month);
      
      // Calcular CT em dias úteis
      const ctBusinessDays = calcularDiasUteis(row.first_activation_date, row.closed_date);

      if (!teamMonthData[team]) {
        teamMonthData[team] = {
          1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
          7: [], 8: [], 9: [], 10: [], 11: [], 12: [],
          all: []
        };
      }

      teamMonthData[team][month].push(ctBusinessDays);
      teamMonthData[team].all.push(ctBusinessDays);
    });

    // Calcular médias
    const calculateAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    console.log('📋 COMPARAÇÃO - DIAS ÚTEIS vs CONCORRENTE\n');
    console.log('='.repeat(120));

    let totalMatches = 0;
    let totalComparisons = 0;

    Object.entries(COMPETITOR_DATA).forEach(([teamName, competitorMonths]) => {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('-'.repeat(120));

      const ourData = teamMonthData[teamName];

      if (!ourData) {
        console.log(`❌ Time não encontrado!`);
        return;
      }

      // Janeiro
      const jan = calculateAvg(ourData[1]);
      const janCompetitor = competitorMonths.JANEIRO;
      const janDiff = Math.abs(jan - janCompetitor);
      const janMatch = janDiff <= 2; // tolerância de 2 dias
      console.log(`  📅 JANEIRO:    Dias úteis: ${jan}d | Concorrente: ${janCompetitor}d | Diff: ${janDiff}d ${janMatch ? '✅' : '❌'}`);
      if (janMatch) totalMatches++;
      totalComparisons++;

      // Fevereiro
      const fev = calculateAvg(ourData[2]);
      const fevCompetitor = competitorMonths.FEVEREIRO;
      const fevDiff = Math.abs(fev - fevCompetitor);
      const fevMatch = fevDiff <= 2;
      console.log(`  📅 FEVEREIRO:  Dias úteis: ${fev}d | Concorrente: ${fevCompetitor}d | Diff: ${fevDiff}d ${fevMatch ? '✅' : '❌'}`);
      if (fevMatch) totalMatches++;
      totalComparisons++;

      // Março
      const mar = calculateAvg(ourData[3]);
      const marCompetitor = competitorMonths.MARÇO;
      const marDiff = Math.abs(mar - marCompetitor);
      const marMatch = marDiff <= 2;
      console.log(`  📅 MARÇO:      Dias úteis: ${mar}d | Concorrente: ${marCompetitor}d | Diff: ${marDiff}d ${marMatch ? '✅' : '❌'}`);
      if (marMatch) totalMatches++;
      totalComparisons++;

      // Média 2026
      const avg2026 = calculateAvg(ourData.all);
      const avg2026Competitor = competitorMonths['2026'];
      const avg2026Diff = Math.abs(avg2026 - avg2026Competitor);
      const avg2026Match = avg2026Diff <= 2;
      console.log(`  📊 2026 (avg): Dias úteis: ${avg2026}d | Concorrente: ${avg2026Competitor}d | Diff: ${avg2026Diff}d ${avg2026Match ? '✅' : '❌'}`);
      if (avg2026Match) totalMatches++;
      totalComparisons++;

      const accuracy = ((totalMatches / totalComparisons) * 100).toFixed(1);
    });

    console.log('\n' + '='.repeat(120));
    console.log('📊 RESULTADO COM DIAS ÚTEIS\n');
    const overallAccuracy = ((totalMatches / totalComparisons) * 100).toFixed(1);
    console.log(`✅ Comparações corretas (tolerância ±2d): ${totalMatches}/${totalComparisons}`);
    console.log(`📈 Precisão geral: ${overallAccuracy}%\n`);

    // Comparar com resultado anterior (dias corridos)
    console.log('💡 COMPARAÇÃO:');
    console.log(`  Dias CORRIDOS (cálculo atual): 10% de precisão (2/20)`);
    console.log(`  Dias ÚTEIS (este teste): ${overallAccuracy}% de precisão (${totalMatches}/${totalComparisons})`);
    
    if (parseFloat(overallAccuracy) > 50) {
      console.log('\n✅ CONCLUSÃO: Usar DIAS ÚTEIS melhora significativamente a precisão!');
      console.log('   A ferramenta concorrente provavelmente usa dias úteis (excluindo fins de semana).');
    } else if (parseFloat(overallAccuracy) > 20) {
      console.log('\n⚠️ CONCLUSÃO: Dias úteis melhoram, mas ainda há discrepâncias.');
      console.log('   Pode haver outros fatores além de dias úteis vs corridos.');
    } else {
      console.log('\n❌ CONCLUSÃO: Dias úteis não explicam as discrepâncias.');
      console.log('   A diferença deve estar em outro critério.');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testBusinessDays()
  .then(() => {
    console.log('\n✅ Teste concluído!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha no teste:', error);
    process.exit(1);
  });
