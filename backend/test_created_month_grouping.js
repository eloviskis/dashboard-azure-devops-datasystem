/**
 * Teste: Agrupar por MÊS DE CRIAÇÃO com Lead Time
 * Hipótese: A concorrente mostra itens criados no mês, não fechados no mês
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

async function testCreatedMonth() {
  console.log('🔍 TESTE: Agrupar por MÊS DE CRIAÇÃO (created_date) com Lead Time\n');

  try {
    const results = [];

    for (const [teamName, competitorMonths] of Object.entries(COMPETITOR_DATA)) {
      console.log(`\n${'='.repeat(90)}`);
      console.log(`🏢 TIME: ${teamName}`);
      console.log('='.repeat(90));

      for (const [monthName, competitorValue] of Object.entries(competitorMonths)) {
        const monthNum = monthName === 'JANEIRO' ? 1 : monthName === 'FEVEREIRO' ? 2 : 3;

        // Lead Time agrupado por MÊS DE CRIAÇÃO
        const ltCreatedQuery = `
          SELECT 
            ROUND(AVG(EXTRACT(EPOCH FROM (closed_date::timestamp - created_date::timestamp)) / 86400)) as avg_lt,
            COUNT(*) as count_items
          FROM work_items
          WHERE 
            team = $1
            AND state = 'Closed'
            AND created_date IS NOT NULL
            AND closed_date IS NOT NULL
            AND EXTRACT(YEAR FROM created_date::timestamp) = 2026
            AND EXTRACT(MONTH FROM created_date::timestamp) = $2
        `;

        const ltCreatedResult = await pool.query(ltCreatedQuery, [teamName, monthNum]);
        const avgLT = parseInt(ltCreatedResult.rows[0].avg_lt) || 0;
        const countLT = parseInt(ltCreatedResult.rows[0].count_items) || 0;

        // Lead Time agrupado por MÊS DE FECHAMENTO (baseline)
        const ltClosedQuery = `
          SELECT 
            ROUND(AVG(EXTRACT(EPOCH FROM (closed_date::timestamp - created_date::timestamp)) / 86400)) as avg_lt,
            COUNT(*) as count_items
          FROM work_items
          WHERE 
            team = $1
            AND state = 'Closed'
            AND created_date IS NOT NULL
            AND closed_date IS NOT NULL
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
        `;

        const ltClosedResult = await pool.query(ltClosedQuery, [teamName, monthNum]);
        const avgLTClosed = parseInt(ltClosedResult.rows[0].avg_lt) || 0;
        const countLTClosed = parseInt(ltClosedResult.rows[0].count_items) || 0;

        const diffCreated = Math.abs(avgLT - competitorValue);
        const diffClosed = Math.abs(avgLTClosed - competitorValue);
        const matchCreated = diffCreated <= 3;
        const matchClosed = diffClosed <= 3;

        console.log(`\n📅 ${monthName}:`);
        console.log(`   Concorrente:             ${String(competitorValue).padStart(3)}d`);
        console.log(`   LT (criados no mês):     ${String(avgLT).padStart(3)}d (diff: ${String(diffCreated).padStart(3)}d) ${matchCreated ? '✅' : '❌'} — ${countLT} itens`);
        console.log(`   LT (fechados no mês):    ${String(avgLTClosed).padStart(3)}d (diff: ${String(diffClosed).padStart(3)}d) ${matchClosed ? '✅' : '❌'} — ${countLTClosed} itens`);

        results.push({
          team: teamName,
          month: monthName,
          competitor: competitorValue,
          ltCreated: avgLT,
          ltClosed: avgLTClosed,
          matchCreated,
          matchClosed
        });
      }
    }

    // Resumo
    console.log('\n\n' + '='.repeat(90));
    console.log('📊 RESUMO FINAL');
    console.log('='.repeat(90));

    const totalMatchesCreated = results.filter(r => r.matchCreated).length;
    const totalMatchesClosed = results.filter(r => r.matchClosed).length;
    const total = results.length;

    const accuracyCreated = ((totalMatchesCreated / total) * 100).toFixed(1);
    const accuracyClosed = ((totalMatchesClosed / total) * 100).toFixed(1);

    console.log(`\n✅ Lead Time agrupado por MÊS DE CRIAÇÃO:   ${totalMatchesCreated}/${total} corretas (${accuracyCreated}%)`);
    console.log(`✅ Lead Time agrupado por MÊS DE FECHAMENTO: ${totalMatchesClosed}/${total} corretas (${accuracyClosed}%)\n`);

    // Conclusão
    console.log('='.repeat(90));
    console.log('💡 CONCLUSÃO');
    console.log('='.repeat(90));

    if (parseFloat(accuracyCreated) >= 75) {
      console.log('\n✅ DESCOBERTO! A concorrente usa Lead Time agrupado por MÊS DE CRIAÇÃO!');
      console.log('   Métrica: Tempo desde created_date até closed_date');
      console.log('   Agrupamento: Por mês de created_date, não closed_date\n');
      console.log('🎯 AÇÃO RECOMENDADA:');
      console.log('   1. Documentar que nossa ferramenta agrupa por mês de conclusão (closed_date)');
      console.log('   2. A concorrente agrupa por mês de criação (created_date)');
      console.log('   3. Nossa abordagem é mais correta para medir throughput real do período\n');
    } else if (parseFloat(accuracyCreated) > parseFloat(accuracyClosed) + 20) {
      console.log('\n⚠️ Agrupar por mês de criação melhora a precisão, mas não é conclusivo.');
      console.log('   Pode haver outros fatores envolvidos.\n');
    } else {
      console.log('\n❌ Agrupar por mês de criação não explica as discrepâncias.');
      console.log('   A diferença está em outro fator.\n');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testCreatedMonth()
  .then(() => {
    console.log('✅ Teste concluído!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha no teste:', error);
    process.exit(1);
  });
