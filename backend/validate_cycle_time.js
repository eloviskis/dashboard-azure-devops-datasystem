/**
 * Script de validação de Cycle Time
 * Compara os dados do nosso sistema com os dados da ferramenta concorrente
 */

const { Pool } = require('pg');

// Dados da ferramenta concorrente (da imagem fornecida)
// Mapeando para os nomes reais no banco de dados
const COMPETITOR_DATA = {
  'Sustentacao': { 'JANEIRO': 21, 'FEVEREIRO': 7, 'MARÇO': 9, '2026': 12, 'MEDIA': 12 },
  'Boltz': { 'JANEIRO': 59, 'FEVEREIRO': 20, 'MARÇO': 30, '2026': 20, 'MEDIA': 36 },
  'Estrategico': { 'JANEIRO': 46, 'FEVEREIRO': 34, 'MARÇO': 34, '2026': 36, 'MEDIA': 38 },
  'Tatico': { 'JANEIRO': 92, 'FEVEREIRO': 102, 'MARÇO': 14, '2026': 97, 'MEDIA': 69 }
};

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard',
  ssl: false,
});

async function validateCycleTime() {
  console.log('🔍 Iniciando validação de Cycle Time...\n');

  try {
    // Buscar todos os itens concluídos de 2026 e calcular cycle time
    // Cycle Time = closed_date - first_activation_date (em dias)
    const query = `
      SELECT 
        work_item_id,
        title,
        team,
        state,
        closed_date,
        first_activation_date,
        CASE 
          WHEN closed_date IS NOT NULL AND first_activation_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400
          ELSE NULL
        END as cycle_time,
        EXTRACT(MONTH FROM closed_date::timestamp) as month,
        EXTRACT(YEAR FROM closed_date::timestamp) as year
      FROM work_items
      WHERE 
        state = ANY($1)
        AND closed_date IS NOT NULL
        AND first_activation_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
      ORDER BY team, closed_date
    `;

    const result = await pool.query(query, [COMPLETED_STATES]);
    console.log(`📊 Total de itens concluídos em 2026 com CT: ${result.rows.length}\n`);

    // Agrupar por time e mês
    const teamMonthData = {};
    
    result.rows.forEach(row => {
      const team = row.team || 'Sem Time';
      const month = parseInt(row.month);
      const ct = parseFloat(row.cycle_time);

      if (!teamMonthData[team]) {
        teamMonthData[team] = {
          1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
          7: [], 8: [], 9: [], 10: [], 11: [], 12: [],
          all: []
        };
      }

      teamMonthData[team][month].push(ct);
      teamMonthData[team].all.push(ct);
    });

    // Calcular médias
    const calculateAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const monthNames = {
      1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL',
      5: 'MAIO', 6: 'JUNHO', 7: 'JULHO', 8: 'AGOSTO',
      9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO'
    };

    console.log('📋 COMPARAÇÃO - NOSSO SISTEMA vs CONCORRENTE\n');
    console.log('='.repeat(120));

    const results = [];
    let totalDiscrepancies = 0;
    let totalComparisons = 0;

    // Para cada time na concorrente
    Object.entries(COMPETITOR_DATA).forEach(([teamName, competitorMonths]) => {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('-'.repeat(120));

      const ourData = teamMonthData[teamName];

      if (!ourData) {
        console.log(`❌ Time não encontrado no nosso sistema!`);
        results.push({ team: teamName, status: 'MISSING', discrepancies: 'N/A' });
        return;
      }

      let teamDiscrepancies = 0;
      let teamComparisons = 0;

      // Janeiro
      const jan = calculateAvg(ourData[1]);
      const janCompetitor = competitorMonths.JANEIRO;
      const janDiff = Math.abs(jan - janCompetitor);
      const janMatch = janDiff <= 1; // tolerância de 1 dia
      console.log(`  📅 JANEIRO:    Nosso: ${jan}d | Concorrente: ${janCompetitor}d | Diff: ${janDiff}d ${janMatch ? '✅' : '❌'}`);
      if (!janMatch) teamDiscrepancies++;
      teamComparisons++;

      // Fevereiro
      const fev = calculateAvg(ourData[2]);
      const fevCompetitor = competitorMonths.FEVEREIRO;
      const fevDiff = Math.abs(fev - fevCompetitor);
      const fevMatch = fevDiff <= 1;
      console.log(`  📅 FEVEREIRO:  Nosso: ${fev}d | Concorrente: ${fevCompetitor}d | Diff: ${fevDiff}d ${fevMatch ? '✅' : '❌'}`);
      if (!fevMatch) teamDiscrepancies++;
      teamComparisons++;

      // Março
      const mar = calculateAvg(ourData[3]);
      const marCompetitor = competitorMonths.MARÇO;
      const marDiff = Math.abs(mar - marCompetitor);
      const marMatch = marDiff <= 1;
      console.log(`  📅 MARÇO:      Nosso: ${mar}d | Concorrente: ${marCompetitor}d | Diff: ${marDiff}d ${marMatch ? '✅' : '❌'}`);
      if (!marMatch) teamDiscrepancies++;
      teamComparisons++;

      // Média 2026
      const avg2026 = calculateAvg(ourData.all);
      const avg2026Competitor = competitorMonths['2026'];
      const avg2026Diff = Math.abs(avg2026 - avg2026Competitor);
      const avg2026Match = avg2026Diff <= 1;
      console.log(`  📊 2026 (avg): Nosso: ${avg2026}d | Concorrente: ${avg2026Competitor}d | Diff: ${avg2026Diff}d ${avg2026Match ? '✅' : '❌'}`);
      if (!avg2026Match) teamDiscrepancies++;
      teamComparisons++;

      // Média geral (mesmo que 2026 no contexto)
      const avgGeral = calculateAvg(ourData.all);
      const avgGeralCompetitor = competitorMonths.MEDIA;
      const avgGeralDiff = Math.abs(avgGeral - avgGeralCompetitor);
      const avgGeralMatch = avgGeralDiff <= 1;
      console.log(`  📊 MÉDIA:      Nosso: ${avgGeral}d | Concorrente: ${avgGeralCompetitor}d | Diff: ${avgGeralDiff}d ${avgGeralMatch ? '✅' : '❌'}`);
      if (!avgGeralMatch) teamDiscrepancies++;
      teamComparisons++;

      totalDiscrepancies += teamDiscrepancies;
      totalComparisons += teamComparisons;

      const accuracy = ((teamComparisons - teamDiscrepancies) / teamComparisons * 100).toFixed(1);
      console.log(`  📈 Precisão do time: ${accuracy}% (${teamComparisons - teamDiscrepancies}/${teamComparisons} ok)`);

      results.push({
        team: teamName,
        status: teamDiscrepancies === 0 ? 'PERFECT' : teamDiscrepancies <= 1 ? 'GOOD' : 'DISCREPANCY',
        discrepancies: `${teamDiscrepancies}/${teamComparisons}`,
        accuracy: accuracy
      });
    });

    console.log('\n' + '='.repeat(120));
    console.log('📊 RESULTADO FINAL DA VALIDAÇÃO\n');

    const overallAccuracy = ((totalComparisons - totalDiscrepancies) / totalComparisons * 100).toFixed(1);
    console.log(`✅ Comparações corretas: ${totalComparisons - totalDiscrepancies}/${totalComparisons}`);
    console.log(`❌ Discrepâncias: ${totalDiscrepancies}/${totalComparisons}`);
    console.log(`📈 Precisão geral: ${overallAccuracy}%\n`);

    console.log('📋 RESUMO POR TIME:');
    results.forEach(r => {
      const icon = r.status === 'PERFECT' ? '✅' : r.status === 'GOOD' ? '⚠️' : r.status === 'MISSING' ? '❌' : '⚠️';
      console.log(`  ${icon} ${r.team.padEnd(20)} | Discrepâncias: ${r.discrepancies || 'N/A'} | Precisão: ${r.accuracy || 'N/A'}%`);
    });

    console.log('\n💡 NOTAS:');
    console.log('  • Tolerância de ±1 dia é considerada aceitável (arredondamentos)');
    console.log('  • Cycle Time calculado apenas para itens em estados concluídos');
    console.log('  • Data de fechamento (closed_date) usada para agrupar por mês');

    // Análise de possíveis causas de discrepâncias
    if (totalDiscrepancies > 0) {
      console.log('\n🔍 POSSÍVEIS CAUSAS DE DISCREPÂNCIAS:');
      console.log('  1. Diferentes critérios de estados "concluídos"');
      console.log('  2. Método de arredondamento diferente');
      console.log('  3. Considerar ou não finais de semana no cálculo');
      console.log('  4. Itens com datas missing/null tratados diferente');
      console.log('  5. Fuso horário da data de conclusão');
    }

  } catch (error) {
    console.error('❌ Erro na validação:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Executar validação
validateCycleTime()
  .then(() => {
    console.log('\n✅ Validação concluída com sucesso!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha na validação:', error);
    process.exit(1);
  });
