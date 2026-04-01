/**
 * Teste: Usar READY_DATE como início do Cycle Time
 * (em vez de first_activation_date)
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

async function testReadyDate() {
  console.log('🔍 TESTE: Cycle Time usando READY_DATE como início\n');
  console.log('💡 Lógica: CT = closed_date - ready_date (DOR)\n');

  try {
    // Primeiro, verificar quantos itens têm ready_date
    const checkQuery = `
      SELECT 
        team,
        COUNT(*) as total,
        COUNT(ready_date) as with_ready_date,
        ROUND(COUNT(ready_date)::numeric / COUNT(*)::numeric * 100, 1) as percentage
      FROM work_items
      WHERE 
        state = ANY($1)
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND team IN ('Sustentacao', 'Boltz', 'Estrategico', 'Tatico')
      GROUP BY team
      ORDER BY team
    `;

    const checkResult = await pool.query(checkQuery, [COMPLETED_STATES]);
    
    console.log('📊 Disponibilidade de ready_date por time:\n');
    checkResult.rows.forEach(row => {
      console.log(`  ${row.team.padEnd(20)} ${row.with_ready_date}/${row.total} (${row.percentage}%)`);
    });
    console.log('');

    // Calcular com ready_date
    const query = `
      SELECT 
        work_item_id,
        team,
        state,
        type,
        ready_date,
        closed_date,
        first_activation_date,
        CASE 
          WHEN ready_date IS NOT NULL AND closed_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (closed_date::timestamp - ready_date::timestamp)) / 86400
          ELSE NULL
        END as ct_ready,
        CASE 
          WHEN first_activation_date IS NOT NULL AND closed_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400
          ELSE NULL
        END as ct_activation,
        EXTRACT(MONTH FROM closed_date::timestamp) as month,
        EXTRACT(YEAR FROM closed_date::timestamp) as year
      FROM work_items
      WHERE 
        state = ANY($1)
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND team IN ('Sustentacao', 'Boltz', 'Estrategico', 'Tatico')
      ORDER BY team, closed_date
    `;

    const result = await pool.query(query, [COMPLETED_STATES]);
    console.log(`📊 Total de itens concluídos: ${result.rows.length}\n`);

    // Agrupar por time e mês
    const teamMonthData = {};
    const teamMonthDataActivation = {};
    
    result.rows.forEach(row => {
      const team = row.team;
      const month = parseInt(row.month);
      
      if (!teamMonthData[team]) {
        teamMonthData[team] = {
          1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
          7: [], 8: [], 9: [], 10: [], 11: [], 12: [],
          all: []
        };
        teamMonthDataActivation[team] = {
          1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
          7: [], 8: [], 9: [], 10: [], 11: [], 12: [],
          all: []
        };
      }

      if (row.ct_ready !== null) {
        teamMonthData[team][month].push(row.ct_ready);
        teamMonthData[team].all.push(row.ct_ready);
      }

      if (row.ct_activation !== null) {
        teamMonthDataActivation[team][month].push(row.ct_activation);
        teamMonthDataActivation[team].all.push(row.ct_activation);
      }
    });

    // Calcular médias
    const calculateAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    console.log('📋 COMPARAÇÃO: READY_DATE vs ACTIVATION_DATE vs CONCORRENTE\n');
    console.log('='.repeat(140));

    let totalMatchesReady = 0;
    let totalMatchesActivation = 0;
    let totalComparisons = 0;

    Object.entries(COMPETITOR_DATA).forEach(([teamName, competitorMonths]) => {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('-'.repeat(140));

      const dataReady = teamMonthData[teamName];
      const dataActivation = teamMonthDataActivation[teamName];

      if (!dataReady || !dataActivation) {
        console.log(`❌ Time não encontrado!`);
        return;
      }

      // Janeiro
      const janReady = calculateAvg(dataReady[1]);
      const janActivation = calculateAvg(dataActivation[1]);
      const janCompetitor = competitorMonths.JANEIRO;
      const janDiffReady = Math.abs(janReady - janCompetitor);
      const janDiffActivation = Math.abs(janActivation - janCompetitor);
      const janMatchReady = janDiffReady <= 2;
      const janMatchActivation = janDiffActivation <= 2;
      
      console.log(`  📅 JANEIRO:`);
      console.log(`     Ready:      ${janReady}d (diff: ${janDiffReady}d) ${janMatchReady ? '✅' : '❌'} | ${dataReady[1].length} itens`);
      console.log(`     Activation: ${janActivation}d (diff: ${janDiffActivation}d) ${janMatchActivation ? '✅' : '❌'} | ${dataActivation[1].length} itens`);
      console.log(`     Concorrente: ${janCompetitor}d`);
      
      if (janMatchReady) totalMatchesReady++;
      if (janMatchActivation) totalMatchesActivation++;
      totalComparisons++;

      // Fevereiro
      const fevReady = calculateAvg(dataReady[2]);
      const fevActivation = calculateAvg(dataActivation[2]);
      const fevCompetitor = competitorMonths.FEVEREIRO;
      const fevDiffReady = Math.abs(fevReady - fevCompetitor);
      const fevDiffActivation = Math.abs(fevActivation - fevCompetitor);
      const fevMatchReady = fevDiffReady <= 2;
      const fevMatchActivation = fevDiffActivation <= 2;
      
      console.log(`  📅 FEVEREIRO:`);
      console.log(`     Ready:      ${fevReady}d (diff: ${fevDiffReady}d) ${fevMatchReady ? '✅' : '❌'} | ${dataReady[2].length} itens`);
      console.log(`     Activation: ${fevActivation}d (diff: ${fevDiffActivation}d) ${fevMatchActivation ? '✅' : '❌'} | ${dataActivation[2].length} itens`);
      console.log(`     Concorrente: ${fevCompetitor}d`);
      
      if (fevMatchReady) totalMatchesReady++;
      if (fevMatchActivation) totalMatchesActivation++;
      totalComparisons++;

      // Março
      const marReady = calculateAvg(dataReady[3]);
      const marActivation = calculateAvg(dataActivation[3]);
      const marCompetitor = competitorMonths.MARÇO;
      const marDiffReady = Math.abs(marReady - marCompetitor);
      const marDiffActivation = Math.abs(marActivation - marCompetitor);
      const marMatchReady = marDiffReady <= 2;
      const marMatchActivation = marDiffActivation <= 2;
      
      console.log(`  📅 MARÇO:`);
      console.log(`     Ready:      ${marReady}d (diff: ${marDiffReady}d) ${marMatchReady ? '✅' : '❌'} | ${dataReady[3].length} itens`);
      console.log(`     Activation: ${marActivation}d (diff: ${marDiffActivation}d) ${marMatchActivation ? '✅' : '❌'} | ${dataActivation[3].length} itens`);
      console.log(`     Concorrente: ${marCompetitor}d`);
      
      if (marMatchReady) totalMatchesReady++;
      if (marMatchActivation) totalMatchesActivation++;
      totalComparisons++;
    });

    console.log('\n' + '='.repeat(140));
    console.log('📊 RESULTADO FINAL\n');
    
    const accuracyReady = ((totalMatchesReady / totalComparisons) * 100).toFixed(1);
    const accuracyActivation = ((totalMatchesActivation / totalComparisons) * 100).toFixed(1);
    
    console.log(`Com READY_DATE (DOR):          ${totalMatchesReady}/${totalComparisons} corretas (${accuracyReady}%)`);
    console.log(`Com ACTIVATION_DATE (atual):   ${totalMatchesActivation}/${totalComparisons} corretas (${accuracyActivation}%)`);
    console.log(`Resultado anterior (corridos): 2/20 corretas (10%)\n`);

    if (parseFloat(accuracyReady) > parseFloat(accuracyActivation) && parseFloat(accuracyReady) > 50) {
      console.log('✅ CONCLUSÃO: Usar READY_DATE melhora significativamente a precisão!');
      console.log('   Recomendação: Alterar o cálculo para usar ready_date como início do cycle time.\n');
      console.log('   Novo cálculo: Cycle Time = closed_date - ready_date');
    } else if (parseFloat(accuracyActivation) > parseFloat(accuracyReady)) {
      console.log('✅ CONCLUSÃO: ACTIVATION_DATE continua sendo a melhor escolha.');
      console.log('   As discrepâncias devem ter outra causa.\n');
    } else {
      console.log('⚠️ CONCLUSÃO: Nenhuma das duas datas resolve completamente as discrepâncias.');
      console.log('   Pode haver outros fatores em jogo.\n');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testReadyDate()
  .then(() => {
    console.log('✅ Teste concluído!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha no teste:', error);
    process.exit(1);
  });
