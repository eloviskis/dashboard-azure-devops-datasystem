// backend/services/painelPorTimeDigest.js
// E-mail quinzenal com o resumo do Painel por Time (frontend/?tab=painel-mensal): período atual vs
// anterior, por time, com insight de IA. Reaproveita services/painelMensal.js (port de
// frontend/src/utils/painelMensal.ts — ver esse arquivo pra entender por que é um port, não um import
// direto) pra não duplicar a conta de Fluxo de Eficiência/Cycle Time/etc.
const {
  TIMES_PADRAO_PAINEL, METAS_PADRAO, metricasDoTime, buildPainelMensal, faixaDoTime, textoFaixa, dentroDaFaixa,
} = require('./painelMensal');
const { generatePainelPorTimeInsight } = require('./ai');
const emailService = require('./email');
const { getReportRecipientsOrFallback } = require('./userMatch');

const REPORT_KEY = 'painel_por_time_quinzenal';
// Até alguém configurar um cargo pela tela de Notificações por Cargo, vai só pra essa lista fixa
// (pedido explícito do usuário em 2026-10-29).
const FALLBACK_RECIPIENTS = [
  'walter.gima@datasystem.com.br',
  'felipe.cagnin@datasystem.com.br',
  'huxley.ruanis@datasystem.com.br',
  'vinicius.ferreira@datasystem.com.br',
];
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

// Cycle Time do Painel por Time, na configuração da GetNaves (decisão do usuário em 2026-11-24, config da aba
// "conf e Filtros Tatico" da planilha): dias corridos completos entre a primeira entrada no Doing e a primeira
// conclusão. Item que nunca passou pelo Doing (fechado direto, cancelado) fica sem Cycle Time. Usado também pelo
// endpoint /api/painel-time/ciclo (server.js), de onde a tela tira o mesmo número.
const ESTADOS_DOING = ['Active', 'Aguardando code review', 'Fazendo code review', 'Aguardando QA', 'Testando QA', 'Testing', 'CodeReview'];
function cicloDias(inicio, fim) {
  if (!inicio || !fim) return null;
  const ms = new Date(fim) - new Date(inicio);
  return Number.isNaN(ms) || ms < 0 ? null : Math.floor(ms / DIA_MS);
}

// Mesmo merge que PainelMensalDashboard.tsx faz no frontend (data.map + ciclo.get(id)): só sobrescreve
// closedDate quando existe transição pra Finished/Resolved/Closed (c.fim); senão, cai no mesmo fallback que
// /api/items já usa. cycleTime (dias corridos, usado no SLA P0) nunca é sobrescrito pelo "fim" — vem sempre de
// first_activation_date, igual a /api/items.
function montarWorkItem(row) {
  const effectiveClosedDate = row.effective_closed_date || row.closed_date || null;
  const cycleTime = calcularDiasEntre(row.first_activation_date, effectiveClosedDate);
  const closedDate = row.fim != null ? row.fim : effectiveClosedDate;
  return {
    team: row.team, type: row.type, state: row.state, priority: row.priority,
    createdDate: row.created_date, closedDate, cycleTime, cicloDias: cicloDias(row.inicio, row.fim),
    timeInStatusDays: row.time_in_status_days || undefined,
    baseVersion: row.base_version, deliveredVersion: row.delivered_version, rootCauseVersion: row.root_cause_version,
    tags: row.tags,
    customType: row.custom_type, tipoCliente: row.tipo_cliente, // critério da gestão de Bugs Produção
  };
}

async function buscarItensDoPainel(sql, times) {
  const rows = await sql`
    WITH ciclo AS (
      SELECT t.work_item_id AS id,
        MIN(t.entered_at) FILTER (WHERE t.state IN ('Finished', 'Resolved', 'Closed')) AS fim,
        MIN(t.entered_at) FILTER (WHERE t.state = ANY(${ESTADOS_DOING})) AS inicio
      FROM work_item_state_transitions t
      GROUP BY t.work_item_id
    )
    SELECT
      w.team, w.type, w.state, w.priority,
      w.created_date,
      w.first_activation_date, w.closed_date, w.effective_closed_date,
      w.time_in_status_days,
      w.base_version, w.delivered_version, w.root_cause_version, w.tags,
      w.custom_type, w.tipo_cliente,
      c.fim, c.inicio
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
    // Primeiro bloco: Índice do Departamento de Engenharia (mesmo formato dos blocos por time)
    times: [{
      nome: 'Departamento de Engenharia',
      metricas: [{
        label: 'Índice do Departamento (Issues abertas)', unidade: '',
        anterior: painel.departamento.total[0], atual: painel.departamento.total[1], cor: 'cinza', metaTexto: 'sem meta',
      }, {
        label: 'Bugs — critério da gestão', unidade: '',
        anterior: painel.departamento.gestao[0], atual: painel.departamento.gestao[1], cor: 'cinza', metaTexto: 'sem meta',
      }],
    }, ...montarDadosEmail(painel)],
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
  ESTADOS_DOING,
  cicloDias,
  REPORT_KEY,
  deveEnviar,
  buildBuckets,
  runPainelPorTimeDigest,
  runPainelPorTimeDigestIfDue,
};
