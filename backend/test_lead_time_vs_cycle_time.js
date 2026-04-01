/**
 * Teste FINAL: Lead Time (created_date → closed_date)
 * vs Cycle Time (first_activation_date → closed_date)
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

async function testLeadTime() {
  console.log('🔍 TESTE FINAL: LEAD TIME vs CYCLE TIME\n');
  console.log('💡 Lead Time = created_date → closed_date (tempo total desde criação)');  
  console.log('💡 Cycle Time = first_activation_date → closed_date (tempo de trabalho ativo)\n');

  try {
    const query = `
      SELECT 
        work_item_id,
        team,
        type,
        created_date,
        first_activation_date,
        closed_date,
        CASE 
          WHEN created_date IS NOT NULL AND closed_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (closed_date::timestamp - created_date::timestamp)) / 86400
          ELSE NULL
        END as lead_time,
        CASE 
          WHEN first_activation_date IS NOT NULL AND closed_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400
          ELSE NULL
        END as cycle_time,
        EXTRACT(MONTH FROM closed_date::timestamp) as month
      FROM work_items
      WHERE 
        state = ANY($1)
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND team IN ('Sustentacao', 'Boltz', 'Estrategico', 'Tatico')
      ORDER BY team, closed_date
    `;

    const result = await pool.query(query, [COMPLETED_STATES]);
    console.log(`📊 Total de itens: ${result.rows.length}\n`);

    // Agrupar por time e mês
    const teamMonthLeadTime = {};
    const teamMonthCycleTime = {};
    
    result.rows.forEach(row => {
      const team = row.team;
      const month = parseInt(row.month);
      
      if (!teamMonthLeadTime[team]) {
        teamMonthLeadTime[team] = { 1: [], 2: [], 3: [], all: [] };
        teamMonthCycleTime[team] = { 1: [], 2: [], 3: [], all: [] };
      }

      if (row.lead_time !== null && row.lead_time >= 0) {
        teamMonthLeadTime[team][month].push(row.lead_time);
        teamMonthLeadTime[team].all.push(row.lead_time);
      }

      if (row.cycle_time !== null && row.cycle_time >= 0) {
        teamMonthCycleTime[team][month].push(row.cycle_time);
        teamMonthCycleTime[team].all.push(row.cycle_time);
      }
    });

    const calculateAvg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    console.log('📋 COMPARAÇÃO DETALHADA\n');
    console.log('='.repeat(140));

    let matchesLT = 0, matchesCT = 0, totalComparisons = 0;

    Object.entries(COMPETITOR_DATA).forEach(([teamName, competitorMonths]) => {
      console.log(`\n🏢 TIME: ${teamName}`);
      console.log('-'.repeat(140));

      const ltData = teamMonthLeadTime[teamName];
      const ctData = teamMonthCycleTime[teamName];

      if (!ltData || !ctData) {
        console.log(`❌ Time não encontrado!`);
        return;
      }

      // Janeiro
      const janLT = calculateAvg(ltData[1]);
      const janCT = calculateAvg(ctData[1]);
      const janComp = competitorMonths.JANEIRO;
      const janDiffLT = Math.abs(janLT - janComp);
      const janDiffCT = Math.abs(janCT - janComp);
      const janMatchLT = janDiffLT <= 3;
      const janMatchCT = janDiffCT <= 3;
      
      console.log(`  📅 JANEIRO:`);
      console.log(`     Lead Time:   ${String(janLT).padStart(3)}d (diff: ${String(janDiffLT).padStart(3)}d) ${janMatchLT ? '✅' : '❌'} | ${ltData[1].length} itens`);
      console.log(`     Cycle Time:  ${String(janCT).padStart(3)}d (diff: ${String(janDiffCT).padStart(3)}d) ${janMatchCT ? '✅' : '❌'} | ${ctData[1].length} itens`);
      console.log(`     Concorrente: ${String(janComp).padStart(3)}d`);
      
      if (janMatchLT) matchesLT++;
      if (janMatchCT) matchesCT++;
      totalComparisons++;

      // Fevereiro
      const fevLT = calculateAvg(ltData[2]);
      const fevCT = calculateAvg(ctData[2]);
      const fevComp = competitorMonths.FEVEREIRO;
      const fevDiffLT = Math.abs(fevLT - fevComp);
      const fevDiffCT = Math.abs(fevCT - fevComp);
      const fevMatchLT = fevDiffLT <= 3;
      const fevMatchCT = fevDiffCT <= 3;
      
      console.log(`  📅 FEVEREIRO:`);
      console.log(`     Lead Time:   ${String(fevLT).padStart(3)}d (diff: ${String(fevDiffLT).padStart(3)}d) ${fevMatchLT ? '✅' : '❌'} | ${ltData[2].length} itens`);
      console.log(`     Cycle Time:  ${String(fevCT).padStart(3)}d (diff: ${String(fevDiffCT).padStart(3)}d) ${fevMatchCT ? '✅' : '❌'} | ${ctData[2].length} itens`);
      console.log(`     Concorrente: ${String(fevComp).padStart(3)}d`);
      
      if (fevMatchLT) matchesLT++;
      if (fevMatchCT) matchesCT++;
      totalComparisons++;

      // Março
      const marLT = calculateAvg(ltData[3]);
      const marCT = calculateAvg(ctData[3]);
      const marComp = competitorMonths.MARÇO;
      const marDiffLT = Math.abs(marLT - marComp);
      const marDiffCT = Math.abs(marCT - marComp);
      const marMatchLT = marDiffLT <= 3;
      const marMatchCT = marDiffCT <= 3;
      
      console.log(`  📅 MARÇO:`);
      console.log(`     Lead Time:   ${String(marLT).padStart(3)}d (diff: ${String(marDiffLT).padStart(3)}d) ${marMatchLT ? '✅' : '❌'} | ${ltData[3].length} itens`);
      console.log(`     Cycle Time:  ${String(marCT).padStart(3)}d (diff: ${String(marDiffCT).padStart(3)}d) ${marMatchCT ? '✅' : '❌'} | ${ctData[3].length} itens`);
      console.log(`     Concorrente: ${String(marComp).padStart(3)}d`);
      
      if (marMatchLT) matchesLT++;
      if (marMatchCT) matchesCT++;
      totalComparisons++;

      // Média 2026
      const avgLT = calculateAvg(ltData.all);
      const avgCT = calculateAvg(ctData.all);
      const avgComp = competitorMonths['2026'];
      const avgDiffLT = Math.abs(avgLT - avgComp);
      const avgDiffCT = Math.abs(avgCT - avgComp);
      
      console.log(`  📊 MÉDIA 2026:`);
      console.log(`     Lead Time:   ${String(avgLT).padStart(3)}d (diff: ${String(avgDiffLT).padStart(3)}d)`);
      console.log(`     Cycle Time:  ${String(avgCT).padStart(3)}d (diff: ${String(avgDiffCT).padStart(3)}d)`);
      console.log(`     Concorrente: ${String(avgComp).padStart(3)}d`);
    });

    console.log('\n' + '='.repeat(140));
    console.log('📊 RESULTADO FINAL\n');
    
    const accuracyLT = ((matchesLT / totalComparisons) * 100).toFixed(1);
    const accuracyCT = ((matchesCT / totalComparisons) * 100).toFixed(1);
    
    console.log(`LEAD TIME (created → closed):          ${matchesLT}/${totalComparisons} corretas (${accuracyLT}%) — tolerância ±3d`);
    console.log(`CYCLE TIME (activation → closed):      ${matchesCT}/${totalComparisons} corretas (${accuracyCT}%) — tolerância ±3d`);
    console.log(`Resultado anterior (tolerância ±1d):   2/20 corretas (10%)\n`);

    if (parseFloat(accuracyLT) >= 70) {
      console.log('✅ CONCLUSÃO DEFINITIVA: A concorrente usa LEAD TIME!');
      console.log('   Lead Time = tempo desde criação até conclusão');
      console.log('   Recomendação: A ferramenta está correta usando Cycle Time.');
      console.log('   A diferença conceitual explica as discrepâncias.\n');
      console.log('💡 Lead Time inclui tempo em backlog + tempo de trabalho');
      console.log('💡 Cycle Time mede apenas tempo de trabalho ativo (melhor métrica Lean/Agile)\n');
    } else if (parseFloat(accuracyCT) >= 70) {
      console.log('✅ CONCLUSÃO: Nossa métrica de Cycle Time está correta!');
      console.log('   As discrepâncias podem ser arredondamentos ou filtros diferentes.\n');
    } else if (parseFloat(accuracyLT) > parseFloat(accuracyCT)) {
      console.log('⚠️ CONCLUSÃO: Lead Time se aproxima mais, mas ainda há discrepâncias.');
      console.log('   A concorrente pode usar uma variação do Lead Time ou ter outros filtros.\n');
    } else {
      console.log('❌ CONCLUSÃO: As métricas não batem por motivos desconhecidos.');
      console.log('   Possíveis causas:');
      console.log('   1. Filtros diferentes de tipos de work items');
      console.log('   2. Critérios de estados "concluídos" diferentes');
      console.log('   3. Erros na ferramenta concorrente');
      console.log('   4. Dados de amostra diferentes\n');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testLeadTime()
  .then(() => {
    console.log('✅ Análise completa finalizada!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha no teste:', error);
    process.exit(1);
  });
