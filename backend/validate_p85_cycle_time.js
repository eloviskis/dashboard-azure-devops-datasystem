/**
 * VALIDAÇÃO DEFINITIVA: Percentil 85 do Cycle Time
 * A concorrente (GetNaves) usa percentil 85, não média!
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

// Função para calcular percentil
function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (lower === upper) return Math.round(sorted[lower]);
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

async function validateP85() {
  console.log('🔍 VALIDAÇÃO COM PERCENTIL 85 DO CYCLE TIME\n');
  console.log('💡 GetNaves usa: "85% work items" completed within X days (percentil 85)\n');

  try {
    const results = [];

    for (const [teamName, competitorMonths] of Object.entries(COMPETITOR_DATA)) {
      console.log(`\n${'='.repeat(110)}`);
      console.log(`🏢 TIME: ${teamName}`);
      console.log('='.repeat(110));

      for (const [monthName, competitorValue] of Object.entries(competitorMonths)) {
        const monthNum = monthName === 'JANEIRO' ? 1 : monthName === 'FEVEREIRO' ? 2 : 3;

        // Buscar todos os cycle times do mês
        const query = `
          SELECT 
            EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400 as cycle_time
          FROM work_items
          WHERE 
            team = $1
            AND state = 'Closed'
            AND first_activation_date IS NOT NULL
            AND closed_date IS NOT NULL
            AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
            AND EXTRACT(MONTH FROM closed_date::timestamp) = $2
          ORDER BY cycle_time
        `;

        const result = await pool.query(query, [teamName, monthNum]);
        const cycleTimes = result.rows.map(r => r.cycle_time);

        if (cycleTimes.length === 0) {
          console.log(`\n📅 ${monthName}: Sem dados`);
          continue;
        }

        // Calcular estatísticas
        const avg = Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length);
        const p50 = calculatePercentile(cycleTimes, 50); // mediana
        const p75 = calculatePercentile(cycleTimes, 75);
        const p85 = calculatePercentile(cycleTimes, 85);
        const p90 = calculatePercentile(cycleTimes, 90);
        const p95 = calculatePercentile(cycleTimes, 95);

        const diffAvg = Math.abs(avg - competitorValue);
        const diffP50 = Math.abs(p50 - competitorValue);
        const diffP75 = Math.abs(p75 - competitorValue);
        const diffP85 = Math.abs(p85 - competitorValue);
        const diffP90 = Math.abs(p90 - competitorValue);
        const diffP95 = Math.abs(p95 - competitorValue);

        const matchAvg = diffAvg <= 3;
        const matchP50 = diffP50 <= 3;
        const matchP75 = diffP75 <= 3;
        const matchP85 = diffP85 <= 3;
        const matchP90 = diffP90 <= 3;
        const matchP95 = diffP95 <= 3;

        console.log(`\n📅 ${monthName} — ${cycleTimes.length} itens:`);
        console.log(`   Concorrente:  ${String(competitorValue).padStart(3)}d`);
        console.log(`   Média:        ${String(avg).padStart(3)}d (diff: ${String(diffAvg).padStart(3)}d) ${matchAvg ? '✅' : '❌'}`);
        console.log(`   P50 (median): ${String(p50).padStart(3)}d (diff: ${String(diffP50).padStart(3)}d) ${matchP50 ? '✅' : '❌'}`);
        console.log(`   P75:          ${String(p75).padStart(3)}d (diff: ${String(diffP75).padStart(3)}d) ${matchP75 ? '✅' : '❌'}`);
        console.log(`   P85:          ${String(p85).padStart(3)}d (diff: ${String(diffP85).padStart(3)}d) ${matchP85 ? '✅' : '❌'} ⭐`);
        console.log(`   P90:          ${String(p90).padStart(3)}d (diff: ${String(diffP90).padStart(3)}d) ${matchP90 ? '✅' : '❌'}`);
        console.log(`   P95:          ${String(p95).padStart(3)}d (diff: ${String(diffP95).padStart(3)}d) ${matchP95 ? '✅' : '❌'}`);

        results.push({
          team: teamName,
          month: monthName,
          competitor: competitorValue,
          avg, p50, p75, p85, p90, p95,
          matchAvg, matchP50, matchP75, matchP85, matchP90, matchP95
        });
      }
    }

    // Resumo final
    console.log('\n\n' + '='.repeat(110));
    console.log('📊 RESUMO FINAL — TAXAS DE PRECISÃO');
    console.log('='.repeat(110));

    const total = results.length;
    const matchesAvg = results.filter(r => r.matchAvg).length;
    const matchesP50 = results.filter(r => r.matchP50).length;
    const matchesP75 = results.filter(r => r.matchP75).length;
    const matchesP85 = results.filter(r => r.matchP85).length;
    const matchesP90 = results.filter(r => r.matchP90).length;
    const matchesP95 = results.filter(r => r.matchP95).length;

    console.log(`\nMétrica          | Corretas | Total | Precisão`);
    console.log('-'.repeat(55));
    console.log(`Média            | ${String(matchesAvg).padStart(8)} | ${String(total).padStart(5)} | ${((matchesAvg/total)*100).toFixed(1).padStart(6)}%`);
    console.log(`Percentil 50     | ${String(matchesP50).padStart(8)} | ${String(total).padStart(5)} | ${((matchesP50/total)*100).toFixed(1).padStart(6)}%`);
    console.log(`Percentil 75     | ${String(matchesP75).padStart(8)} | ${String(total).padStart(5)} | ${((matchesP75/total)*100).toFixed(1).padStart(6)}%`);
    console.log(`Percentil 85  ⭐ | ${String(matchesP85).padStart(8)} | ${String(total).padStart(5)} | ${((matchesP85/total)*100).toFixed(1).padStart(6)}%`);
    console.log(`Percentil 90     | ${String(matchesP90).padStart(8)} | ${String(total).padStart(5)} | ${((matchesP90/total)*100).toFixed(1).padStart(6)}%`);
    console.log(`Percentil 95     | ${String(matchesP95).padStart(8)} | ${String(total).padStart(5)} | ${((matchesP95/total)*100).toFixed(1).padStart(6)}%\n`);

    // Conclusão
    console.log('='.repeat(110));
    console.log('💡 CONCLUSÃO');
    console.log('='.repeat(110));

    const accuracyP85 = (matchesP85/total)*100;
    const accuracyAvg = (matchesAvg/total)*100;

    if (accuracyP85 >= 75) {
      console.log('\n✅ DESCOBERTO! GetNaves usa PERCENTIL 85 do Cycle Time!');
      console.log('   "85% work items" completed within X days\n');
      console.log('🎯 AÇÃO RECOMENDADA:');
      console.log('   1. Atualizar dashboard para mostrar Percentil 85 em vez de Média');
      console.log('   2. Adicionar tooltip explicando: "85% dos itens foram concluídos neste tempo ou menos"');
      console.log('   3. Isso alinha com a concorrente e é uma métrica mais robusta (menos afetada por outliers)\n');
    } else if (accuracyP85 > accuracyAvg) {
      console.log('\n⚠️ Percentil 85 melhora a precisão, mas não é conclusivo.');
      console.log(`   P85: ${accuracyP85.toFixed(1)}% vs Média: ${accuracyAvg.toFixed(1)}%\n`);
    } else {
      console.log('\n❌ Percentil 85 não explica as discrepâncias.');
      console.log(`   P85: ${accuracyP85.toFixed(1)}% vs Média: ${accuracyAvg.toFixed(1)}%\n`);
    }

    // Detalhamento
    console.log('\n📋 DETALHAMENTO POR TIME/MÊS:\n');
    console.log('Time'.padEnd(15), 'Mês'.padEnd(12), 'Concorrente'.padEnd(13), 'P85'.padEnd(13), 'Média'.padEnd(13));
    console.log('-'.repeat(110));

    results.forEach(r => {
      const p85Icon = r.matchP85 ? '✅' : '❌';
      const avgIcon = r.matchAvg ? '✅' : '❌';
      console.log(
        r.team.substring(0, 14).padEnd(15),
        r.month.padEnd(12),
        (r.competitor + 'd').padEnd(13),
        `${p85Icon} ${r.p85}d`.padEnd(13),
        `${avgIcon} ${r.avg}d`.padEnd(13)
      );
    });

  } catch (error) {
    console.error('❌ Erro na validação:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

validateP85()
  .then(() => {
    console.log('\n✅ Validação concluída!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha na validação:', error);
    process.exit(1);
  });
