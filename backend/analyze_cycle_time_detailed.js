/**
 * Análise detalhada de Cycle Time para identificar discrepâncias
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://devops_dash:D3v0ps_D4sh_2026_Str0ng@localhost:5432/devops_dashboard',
  ssl: false,
});

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

async function analyzeDetails() {
  console.log('🔍 ANÁLISE DETALHADA DE CYCLE TIME\n');

  try {
    // Analisar Fevereiro de Sustentacao (bateu perfeitamente: 6d vs 7d)
    console.log('=' .repeat(100));
    console.log('📅 FEVEREIRO - SUSTENTACAO (BATEU PERFEITAMENTE: 6d vs 7d)');
    console.log('=' .repeat(100));

    const fevSustQuery = `
      SELECT 
        work_item_id,
        title,
        type,
        state,
        first_activation_date,
        closed_date,
        done_date,
        EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400 as ct_closed,
        CASE 
          WHEN done_date IS NOT NULL AND first_activation_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (done_date::timestamp - first_activation_date::timestamp)) / 86400
          ELSE NULL
        END as ct_done
      FROM work_items
      WHERE 
        team = 'Sustentacao'
        AND state = ANY($1)
        AND first_activation_date IS NOT NULL
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND EXTRACT(MONTH FROM closed_date::timestamp) = 2
      ORDER BY closed_date
      LIMIT 20
    `;

    const fevSust = await pool.query(fevSustQuery, [COMPLETED_STATES]);
    
    console.log(`\n📊 Amostra de ${Math.min(fevSust.rows.length, 20)} itens de Fevereiro/Sustentacao:\n`);
    console.log('ID'.padEnd(10), 'Tipo'.padEnd(12), 'CT(closed)'.padEnd(12), 'CT(done)'.padEnd(12), 'Ativação'.padEnd(12), 'Fechamento');
    console.log('-'.repeat(100));

    let sumClosed = 0, sumDone = 0, countDone = 0;
    fevSust.rows.forEach(row => {
      const ctClosed = Math.round(row.ct_closed);
      const ctDone = row.ct_done ? Math.round(row.ct_done) : null;
      console.log(
        String(row.work_item_id).padEnd(10),
        String(row.type).substring(0, 11).padEnd(12),
        String(ctClosed + 'd').padEnd(12),
        String(ctDone ? ctDone + 'd' : '—').padEnd(12),
        row.first_activation_date ? row.first_activation_date.substring(0, 10).padEnd(12) : '—'.padEnd(12),
        row.closed_date ? row.closed_date.substring(0, 10) : '—'
      );
      sumClosed += ctClosed;
      if (ctDone !== null) {
        sumDone += ctDone;
        countDone++;
      }
    });

    const avgClosed = Math.round(sumClosed / fevSust.rows.length);
    const avgDone = countDone > 0 ? Math.round(sumDone / countDone) : 0;

    console.log('\n📈 MÉDIAS:');
    console.log(`  CT usando closed_date: ${avgClosed}d`);
    console.log(`  CT usando done_date: ${avgDone}d (${countDone} itens com done_date)`);
    console.log(`  ✅ Concorrente: 7d`);
    console.log(`  ✅ Nosso sistema (atual): 6d usando closed_date`);

    // Agora analisar Janeiro de Sustentacao (não bateu: 12d vs 21d)
    console.log('\n\n' + '='.repeat(100));
    console.log('📅 JANEIRO - SUSTENTACAO (NÃO BATEU: 12d vs 21d - Diferença de 9 dias)');
    console.log('='.repeat(100));

    const janSustQuery = `
      SELECT 
        work_item_id,
        title,
        type,
        state,
        first_activation_date,
        closed_date,
        done_date,
        ready_date,
        EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400 as ct_closed,
        CASE 
          WHEN done_date IS NOT NULL AND first_activation_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (done_date::timestamp - first_activation_date::timestamp)) / 86400
          ELSE NULL
        END as ct_done,
        CASE 
          WHEN ready_date IS NOT NULL AND closed_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (closed_date::timestamp - ready_date::timestamp)) / 86400
          ELSE NULL
        END as ct_ready_to_closed
      FROM work_items
      WHERE 
        team = 'Sustentacao'
        AND state = ANY($1)
        AND first_activation_date IS NOT NULL
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND EXTRACT(MONTH FROM closed_date::timestamp) = 1
      ORDER BY closed_date
    `;

    const janSust = await pool.query(janSustQuery, [COMPLETED_STATES]);
    
    console.log(`\n📊 Total de ${janSust.rows.length} itens de Janeiro/Sustentacao\n`);
    console.log('ID'.padEnd(10), 'Tipo'.padEnd(20), 'CT(closed)'.padEnd(12), 'CT(done)'.padEnd(12), 'Dif.');
    console.log('-'.repeat(100));

    sumClosed = 0; sumDone = 0; countDone = 0;
    let difSum = 0, difCount = 0;

    janSust.rows.slice(0, 25).forEach(row => {
      const ctClosed = Math.round(row.ct_closed);
      const ctDone = row.ct_done ? Math.round(row.ct_done) : null;
      const dif = ctDone !== null ? ctDone - ctClosed : null;
      
      console.log(
        String(row.work_item_id).padEnd(10),
        String(row.type).substring(0, 19).padEnd(20),
        String(ctClosed + 'd').padEnd(12),
        String(ctDone ? ctDone + 'd' : '—').padEnd(12),
        dif !== null ? `${dif > 0 ? '+' : ''}${dif}d` : '—'
      );
      
      sumClosed += ctClosed;
      if (ctDone !== null) {
        sumDone += ctDone;
        countDone++;
        if (dif !== null) {
          difSum += dif;
          difCount++;
        }
      }
    });

    const avgClosedJan = Math.round(sumClosed / Math.min(janSust.rows.length, 25));
    const avgDoneJan = countDone > 0 ? Math.round(sumDone / countDone) : 0;
    const avgDif = difCount > 0 ? Math.round(difSum / difCount) : 0;

    console.log('\n📈 MÉDIAS (amostra de 25 itens):');
    console.log(`  CT usando closed_date: ${avgClosedJan}d`);
    console.log(`  CT usando done_date: ${avgDoneJan}d (${countDone} itens com done_date)`);
    console.log(`  Diferença média (done - closed): ${avgDif}d`);
    console.log(`  ❌ Concorrente: 21d`);
    console.log(`  ❌ Nosso sistema (atual): 12d usando closed_date`);

    // Verificar se usar done_date aproximaria
    console.log('\n💡 HIPÓTESE: Se usarmos done_date em vez de closed_date...');

    const fullJanSustQuery = `
      SELECT 
        AVG(EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400) as avg_ct_closed,
        AVG(CASE 
          WHEN done_date IS NOT NULL AND first_activation_date IS NOT NULL THEN
            EXTRACT(EPOCH FROM (done_date::timestamp - first_activation_date::timestamp)) / 86400
          ELSE NULL
        END) as avg_ct_done
      FROM work_items
      WHERE 
        team = 'Sustentacao'
        AND state = ANY($1)
        AND first_activation_date IS NOT NULL
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND EXTRACT(MONTH FROM closed_date::timestamp) = 1
    `;

    const fullJan = await pool.query(fullJanSustQuery, [COMPLETED_STATES]);
    console.log(`  Com closed_date: ${Math.round(fullJan.rows[0].avg_ct_closed)}d`);
    console.log(`  Com done_date: ${fullJan.rows[0].avg_ct_done ? Math.round(fullJan.rows[0].avg_ct_done) : 'N/A'}d`);

    // Analisar distribuição de tipos em Janeiro vs Fevereiro
    console.log('\n\n' + '='.repeat(100));
    console.log('📊 ANÁLISE DE TIPOS DE WORK ITEMS');
    console.log('='.repeat(100));

    const typeAnalysisQuery = `
      SELECT 
        EXTRACT(MONTH FROM closed_date::timestamp) as month,
        type,
        COUNT(*) as count,
        ROUND(AVG(EXTRACT(EPOCH FROM (closed_date::timestamp - first_activation_date::timestamp)) / 86400)) as avg_ct
      FROM work_items
      WHERE 
        team = 'Sustentacao'
        AND state = ANY($1)
        AND first_activation_date IS NOT NULL
        AND closed_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
        AND EXTRACT(MONTH FROM closed_date::timestamp) IN (1, 2, 3)
      GROUP BY month, type
      ORDER BY month, count DESC
    `;

    const typeAnalysis = await pool.query(typeAnalysisQuery, [COMPLETED_STATES]);
    
    console.log('\nJANEIRO:');
    typeAnalysis.rows.filter(r => r.month === 1).forEach(r => {
      console.log(`  ${String(r.type).padEnd(30)} ${String(r.count).padStart(4)} itens | CT médio: ${r.avg_ct}d`);
    });

    console.log('\nFEVEREIRO:');
    typeAnalysis.rows.filter(r => r.month === 2).forEach(r => {
      console.log(`  ${String(r.type).padEnd(30)} ${String(r.count).padStart(4)} itens | CT médio: ${r.avg_ct}d`);
    });

    console.log('\nMARÇO:');
    typeAnalysis.rows.filter(r => r.month === 3).forEach(r => {
      console.log(`  ${String(r.type).padEnd(30)} ${String(r.count).padStart(4)} itens | CT médio: ${r.avg_ct}d`);
    });

    // Verificar se há diferença entre usar closed_date vs done_date para o cálculo do mês
    console.log('\n\n' + '='.repeat(100));
    console.log('🔍 VERIFICAÇÃO: Agrupamento por mês de DONE_DATE vs CLOSED_DATE');
    console.log('='.repeat(100));

    const monthComparisonQuery = `
      SELECT 
        'Sustentacao' as team,
        EXTRACT(MONTH FROM closed_date::timestamp) as month_closed,
        EXTRACT(MONTH FROM done_date::timestamp) as month_done,
        COUNT(*) as count
      FROM work_items
      WHERE 
        team = 'Sustentacao'
        AND state = ANY($1)
        AND first_activation_date IS NOT NULL
        AND closed_date IS NOT NULL
        AND done_date IS NOT NULL
        AND EXTRACT(YEAR FROM closed_date::timestamp) = 2026
      GROUP BY month_closed, month_done
      ORDER BY month_closed, month_done
    `;

    const monthComp = await pool.query(monthComparisonQuery, [COMPLETED_STATES]);
    
    console.log('\nItens que mudaram de mês entre done_date e closed_date:');
    monthComp.rows.forEach(r => {
      if (r.month_closed !== r.month_done) {
        console.log(`  ⚠️ ${r.count} itens: done em mês ${r.month_done}, closed em mês ${r.month_closed}`);
      } else {
        console.log(`  ✅ ${r.count} itens: mesmo mês (${r.month_closed})`);
      }
    });

  } catch (error) {
    console.error('❌ Erro na análise:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

analyzeDetails()
  .then(() => {
    console.log('\n\n' + '='.repeat(100));
    console.log('✅ Análise concluída!');
    console.log('='.repeat(100));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Falha na análise:', error);
    process.exit(1);
  });
