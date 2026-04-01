/**
 * ANÁLISE DEFINITIVA: Lead Time vs Cycle Time (ROBUSTO)
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard',
  ssl: false,
});

const COMPETITOR_DATA = {
  'Sustentacao': { 'JANEIRO': 21, 'FEVEREIRO': 7, 'MARÇO': 9 },
  'Boltz': { 'JANEIRO': 59, 'FEVEREIRO': 20, 'MARÇO': 30 },
  'Estrategico': { 'JANEIRO': 46, 'FEVEREIRO': 34, 'MARÇO': 34 },
  'Tatico': { 'JANEIRO': 92, 'FEVEREIRO': 102, 'MARÇO': 14 }
};

async function runFinalAnalysis() {
  console.log('🔍 ANÁLISE DEFINITIVA: Lead Time vs Cycle Time\n');

  try {
    const results = [];

    for (const [teamName, competitorMonths] of Object.entries(COMPETITOR_DATA)) {
      console.log(`\n${'='.repeat(100)}`);
      console.log(`🏢 TIME: ${teamName}`);
      console.log('='.repeat(100));

      for (const [monthName, competitorValue] of Object.entries(competitorMonths)) {
        const monthNum = monthName === 'JANEIRO' ? 1 : monthName === 'FEVEREIRO' ? 2 : 3;

        // Lead Time
        const ltQuery = `
          SELECT 
            ROUND(AVG(EXTRACT(EPOCH FROM (closed_date::timestamp - created_date::timestamp)) / 86400)) as avg_lt,
            COUNT(*) as count_lt
          FROM work_items
          WHERE 
            team = $1
            AND state = 'Closed'
            AND created_date IS NOT NULL
            AND closed_date IS NOT NULL
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
        `;

        const ltResult = await pool.query(ltQuery, [teamName, monthNum]);
        const avgLT = parseInt(ltResult.rows[0].avg_lt) || 0;
        const countLT = parseInt(ltResult.rows[0].count_lt) || 0;

        // Cycle Time
        const ctQuery = `
          SELECT 
            ROUND(AVG(EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400)) as avg_ct,
            COUNT(*) as count_ct
          FROM work_items
          WHERE 
            team = $1
            AND state = 'Closed'
            AND first_activation_date IS NOT NULL
            AND closed_date IS NOT NULL
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
        `;

        const ctResult = await pool.query(ctQuery, [teamName, monthNum]);
        const avgCT = parseInt(ctResult.rows[0].avg_ct) || 0;
        const countCT = parseInt(ctResult.rows[0].count_ct) || 0;

        const diffLT = Math.abs(avgLT - competitorValue);
        const diffCT = Math.abs(avgCT - competitorValue);
        const matchLT = diffLT <= 3;
        const matchCT = diffCT <= 3;

        console.log(`\n📅 ${monthName}:`);
        console.log(`   Concorrente:  ${String(competitorValue).padStart(3)}d`);
        console.log(`   Lead Time:    ${String(avgLT).padStart(3)}d (diff: ${String(diffLT).padStart(3)}d) ${matchLT ? '✅' : '❌'} — ${countLT} itens`);
        console.log(`   Cycle Time:   ${String(avgCT).padStart(3)}d (diff: ${String(diffCT).padStart(3)}d) ${matchCT ? '✅' : '❌'} — ${countCT} itens`);

        results.push({
          team: teamName,
          month: monthName,
          competitor: competitorValue,
          leadTime: avgLT,
          cycleTime: avgCT,
          matchLT,
          matchCT
        });
      }
    }

    // Resumo final
    console.log('\n\n' + '='.repeat(100));
    console.log('📊 RESUMO FINAL DA ANÁLISE');
    console.log('='.repeat(100));

    const totalMatchesLT = results.filter(r => r.matchLT).length;
    const totalMatchesCT = results.filter(r => r.matchCT).length;
    const total = results.length;

    const accuracyLT = ((totalMatchesLT / total) * 100).toFixed(1);
    const accuracyCT = ((totalMatchesCT / total) * 100).toFixed(1);

    console.log(`\n✅ LEAD TIME (created → closed):     ${totalMatchesLT}/${total} corretas (${accuracyLT}%)`);
    console.log(`✅ CYCLE TIME (activation → closed):  ${totalMatchesCT}/${total} corretas (${accuracyCT}%)\n`);

    console.log('📋 DETALHAMENTO POR MÉTRICA:\n');
    console.log('Time'.padEnd(15), 'Mês'.padEnd(12), 'Concorrente'.padEnd(14), 'Lead Time'.padEnd(14), 'Cycle Time'.padEnd(14));
    console.log('-'.repeat(100));

    results.forEach(r => {
      const ltIcon = r.matchLT ? '✅' : '❌';
      const ctIcon = r.matchCT ? '✅' : '❌';
      console.log(
        r.team.substring(0, 14).padEnd(15),
        r.month.padEnd(12),
        (r.competitor + 'd').padEnd(14),
        `${ltIcon} ${r.leadTime}d`.padEnd(14),
        `${ctIcon} ${r.cycleTime}d`.padEnd(14)
      );
    });

    // Conclusão
    console.log('\n' + '='.repeat(100));
    console.log('💡 CONCLUSÃO');
    console.log('='.repeat(100));

    if (parseFloat(accuracyLT) >= 70) {
      console.log('\n✅ A ferramenta concorrente usa LEAD TIME (tempo desde criação até conclusão)');
      console.log('   Nossa ferramenta usa CYCLE TIME (tempo de trabalho ativo), que é a métrica recomendada');
      console.log('   pela metodologia Lean/Agile para medir eficiência do fluxo de trabalho.\n');
      console.log('🎯 RECOMENDAÇÃO: Manter Cycle Time como métrica principal.');
      console.log('   Lead Time inclui tempo em backlog, o que não reflete produtividade do time.\n');
    } else if (parseFloat(accuracyCT) >= 70) {
      console.log('\n✅ Nossa métrica de CYCLE TIME está alinhada com a concorrente!');
      console.log('   Pequenas discrepâncias podem ser devido a arredondamentos ou filtros.\n');
    } else if (parseFloat(accuracyLT) > parseFloat(accuracyCT) + 20) {
      console.log('\n⚠️ LEAD TIME aproxima melhor, mas ainda há discrepâncias significativas.');
      console.log('   A concorrente pode usar variação do Lead Time ou filtros diferentes.\n');
      console.log('🎯 RECOMENDAÇÃO: Verificar com o fornecedor da ferramenta concorrente');
      console.log('   qual métrica e quais filtros eles aplicam.\n');
    } else {
      console.log('\n❌ Nenhuma das métricas bate perfeitamente.');
      console.log('   Possíveis causas:');
      console.log('   • Filtros de tipos de work items diferentes');
      console.log('   • Critérios de estados "concluídos" diferentes');
      console.log('   • Período de fechamento vs período de criação');
      console.log('   • Erros ou inconsistências nos dados da concorrente\n');
      console.log('🎯 RECOMENDAÇÃO: Continuar usando Cycle Time (métrica padrão Lean/Agile)');
      console.log('   e documentar a diferença conceitual com a concorrente.\n');
    }

  } catch (error) {
    console.error('❌ Erro na análise:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runFinalAnalysis()
  .then(() => {
    console.log('✅ Análise completa!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha na análise:', error);
    process.exit(1);
  });
