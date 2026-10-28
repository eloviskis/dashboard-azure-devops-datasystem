// backend/services/painelPorTimeDigest.js
// E-mail quinzenal com o resumo do Painel por Time (frontend/?tab=painel-mensal): período atual vs
// anterior, por time, com insight de IA. Reaproveita services/painelMensal.js (port de
// frontend/src/utils/painelMensal.ts — ver esse arquivo pra entender por que é um port, não um import
// direto) pra não duplicar a conta de Fluxo de Eficiência/Cycle Time/etc.
const { calcularDiasUteis, diaBRT } = require('./businessDays');
const {
  TIMES_PADRAO_PAINEL, METAS_PADRAO, metricasDoTime, buildPainelMensal, faixaDoTime, textoFaixa, dentroDaFaixa,
} = require('./painelMensal');
const { generatePainelPorTimeInsight } = require('./ai');
const emailService = require('./email');
const { getReportRecipientsOrFallback } = require('./userMatch');

const REPORT_KEY = 'painel_por_time_quinzenal';
const FALLBACK_RECIPIENTS = ['eloi.santaroza@datasystem.com.br'];
const QUINZENA_MS = 15 * 24 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

// Nunca enviado (null) -> manda. Senão, só se já passaram ≥15 dias desde o último envio deste type.
function deveEnviar(lastSentAt, now = new Date()) {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= QUINZENA_MS;
}

// 2 janelas de 15 dias (anterior, atual) — hand-rolado, sem depender de periodGrouping.ts (que trabalha
// em baldes de 14 dias pro seletor "Quinzenal" da tela; aqui o pedido foi literalmente "a cada 15 dias").
function buildBuckets(now = new Date()) {
  const inicioAtual = new Date(now.getTime() - 15 * DIA_MS);
  const inicioAnterior = new Date(inicioAtual.getTime() - 15 * DIA_MS);
  const fmt = (d) => d.toLocaleDateString('pt-BR');
  return [
    { label: `${fmt(inicioAnterior)}–${fmt(inicioAtual)}`, start: inicioAnterior, end: inicioAtual },
    { label: `${fmt(inicioAtual)}–${fmt(now)}`, start: inicioAtual, end: now },
  ];
}

const calcularDiasEntre = (ini, fim) => (!ini || !fim ? null : Math.ceil((new Date(fim) - new Date(ini)) / DIA_MS));

// Mesmo merge que PainelMensalDashboard.tsx faz no frontend (data.map + ciclo.get(id)): só sobrescreve
// closedDate/cycleTimeBusinessDays quando existe transição pra Finished/Resolved/Closed (c.fim); senão,
// cai no mesmo fallback que /api/items já usa. cycleTime (dias corridos, usado no SLA P0) nunca é
// sobrescrito pelo "fim" — vem sempre de first_activation_date, igual a /api/items.
function montarWorkItem(row) {
  const effectiveClosedDate = row.effective_closed_date || row.closed_date || null;
  const cycleTime = calcularDiasEntre(row.first_activation_date, effectiveClosedDate);
  const temFim = row.fim != null;
  const closedDate = temFim ? row.fim : effectiveClosedDate;
  const cycleTimeBusinessDays = temFim
    ? calcularDiasUteis(`${row.created_date_str.slice(0, 10)}T12:00:00`, `${diaBRT(row.fim)}T12:00:00`)
    : calcularDiasUteis(row.first_activation_date || row.created_date, effectiveClosedDate);
  return {
    team: row.team, type: row.type, state: row.state, priority: row.priority,
    createdDate: row.created_date, closedDate, cycleTime, cycleTimeBusinessDays,
    timeInStatusDays: row.time_in_status_days || undefined,
  };
}

async function buscarItensDoPainel(sql, times) {
  const rows = await sql`
    WITH ciclo AS (
      SELECT t.work_item_id AS id, MIN(t.entered_at) AS fim
      FROM work_item_state_transitions t
      WHERE t.state IN ('Finished', 'Resolved', 'Closed')
      GROUP BY t.work_item_id
    )
    SELECT
      w.team, w.type, w.state, w.priority,
      w.created_date, w.created_date::text AS created_date_str,
      w.first_activation_date, w.closed_date, w.effective_closed_date,
      w.time_in_status_days,
      c.fim
    FROM work_items w
    LEFT JOIN ciclo c ON c.id = w.work_item_id
    WHERE w.team = ANY(${times}) AND w.created_date IS NOT NULL
  `;
  return rows.map(montarWorkItem);
}

// Números atual vs anterior por time, só as métricas do perfil de cada um, com meta e se está dentro dela.
function montarContextoIA(painel, buckets) {
  const [labelAnterior, labelAtual] = painel.labels;
  return {
    periodoAnterior: labelAnterior,
    periodoAtual: labelAtual,
    times: painel.times.map(team => ({
      time: team,
      metricas: Object.fromEntries(metricasDoTime(team).map(key => {
        const faixa = faixaDoTime(METAS_PADRAO[key], team);
        const atual = painel.porTime[key][team][1];
        return [METAS_PADRAO[key].label, {
          anterior: painel.porTime[key][team][0],
          atual,
          meta: textoFaixa(faixa, METAS_PADRAO[key].unidade),
          dentroDaMeta: dentroDaFaixa(atual, faixa),
        }];
      })),
    })),
  };
}

// Mesma forma de dados que a tela usa pra colorir célula (corCelula), traduzida pro e-mail.
function corDaCelula(dentro) {
  return dentro === true ? 'verde' : dentro === false ? 'vermelho' : 'cinza';
}

function montarDadosEmail(painel) {
  return painel.times.map(team => ({
    nome: team,
    metricas: metricasDoTime(team).map(key => {
      const meta = METAS_PADRAO[key];
      const faixa = faixaDoTime(meta, team);
      const atual = painel.porTime[key][team][1];
      return {
        label: meta.label,
        unidade: meta.unidade,
        anterior: painel.porTime[key][team][0],
        atual,
        cor: corDaCelula(dentroDaFaixa(atual, faixa)),
        metaTexto: textoFaixa(faixa, meta.unidade),
      };
    }),
  }));
}

async function runPainelPorTimeDigest(sql, overrideRecipients) {
  const destinatarios = overrideRecipients?.length
    ? overrideRecipients
    : await getReportRecipientsOrFallback(sql, REPORT_KEY, FALLBACK_RECIPIENTS);
  if (!destinatarios.length) return;

  const buckets = buildBuckets();
  const itens = await buscarItensDoPainel(sql, TIMES_PADRAO_PAINEL);
  const painel = buildPainelMensal(itens, buckets, TIMES_PADRAO_PAINEL);
  if (!painel.times.length) return; // sem dados no período — não grava log, gate tenta de novo amanhã

  const insight = await generatePainelPorTimeInsight(montarContextoIA(painel, buckets))
    .catch(err => { console.error('❌ generatePainelPorTimeInsight error:', err.message); return null; });

  const { subject, html } = emailService.painelPorTimeDigestEmail({
    periodoAnteriorLabel: painel.labels[0],
    periodoAtualLabel: painel.labels[1],
    times: montarDadosEmail(painel),
    insight,
  });

  for (const to of destinatarios) {
    await emailService.sendEmail({ to, subject, html, log: { sql, type: REPORT_KEY } });
  }
}

async function runPainelPorTimeDigestIfDue(sql) {
  const rows = await sql`SELECT MAX(sent_at) AS last_sent FROM notification_log WHERE type = ${REPORT_KEY}`;
  const lastSent = rows[0]?.last_sent ? new Date(rows[0].last_sent) : null;
  if (!deveEnviar(lastSent)) return;
  await runPainelPorTimeDigest(sql);
}

module.exports = {
  REPORT_KEY,
  deveEnviar,
  buildBuckets,
  runPainelPorTimeDigest,
  runPainelPorTimeDigestIfDue,
};
