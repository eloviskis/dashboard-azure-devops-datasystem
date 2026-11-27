// backend/services/email.js
// Wrapper around Resend for all outbound notification emails.
// Never throws — a failed send must not break the calling endpoint.

const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

if (!RESEND_API_KEY) {
  console.warn('⚠️ RESEND_API_KEY not set — emails will be logged to console instead of sent.');
}

function layout(title, bodyHtml) {
  return `
  <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <h2 style="color: #111827; margin-bottom: 4px;">${title}</h2>
    <div style="height: 1px; background: #e5e7eb; margin: 16px 0;"></div>
    ${bodyHtml}
    <div style="height: 1px; background: #e5e7eb; margin: 24px 0 12px;"></div>
    <p style="font-size: 12px; color: #9ca3af;">Este é um email automático do Dashboard. Não responda diretamente.</p>
    <p style="font-size: 12px; color: #9ca3af;">Essa mensagem foi gerada de https://dsmetrics.online</p>
  </div>`;
}

function button(href, label) {
  return `<a href="${href}" style="display:inline-block; padding:10px 20px; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:600;">${label}</a>`;
}

async function sendEmail({ to, subject, html, log }) {
  if (!to) {
    console.warn(`⚠️ sendEmail skipped (${log?.type || 'unknown'}): sem destinatário`);
    return { skipped: true };
  }
  if (!resend) {
    console.log(`📧 [EMAIL SIMULADO] to=${to} subject="${subject}"`);
    return { skipped: true };
  }
  try {
    const result = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    });
    if (log?.sql) {
      await log.sql`
        INSERT INTO notification_log (type, recipient_email, related_key)
        VALUES (${log.type}, ${to}, ${log.relatedKey || null})
      `.catch(err => console.error('❌ notification_log insert failed:', err.message));
    }
    return result;
  } catch (error) {
    console.error(`❌ Email send failed (${log?.type || subject}):`, error.message);
    return { error: error.message };
  }
}

// ---- Templates ----

const ROLE_LABELS = {
  admin: 'Administrador',
  QA: 'QA',
  PO: 'PO',
  DEV: 'Desenvolvedor(a)',
  GESTOR: 'Gestor(a)',
  user: 'Usuário',
};

function welcomeEmail({ username, email, tempPassword, role }) {
  return {
    subject: 'Bem-vindo(a) ao Dashboard',
    html: layout('Sua conta foi criada', `
      <p>Olá <strong>${username}</strong>,</p>
      <p>Uma conta foi criada para você no Dashboard, com o cargo de <strong>${ROLE_LABELS[role] || 'Usuário'}</strong>.</p>
      <p><strong>Usuário:</strong> ${username}<br/>
      <strong>Senha temporária:</strong> ${tempPassword}</p>
      <p>Recomendamos alterar sua senha após o primeiro acesso.</p>
      <p>${button(FRONTEND_URL, 'Acessar o Dashboard')}</p>
    `),
  };
}

function resendCredentialsEmail({ username, tempPassword, role }) {
  return {
    subject: 'Suas credenciais de acesso — Dashboard',
    html: layout('Credenciais de acesso', `
      <p>Olá <strong>${username}</strong>,</p>
      <p>Uma nova senha temporária foi gerada para sua conta no Dashboard (cargo: <strong>${ROLE_LABELS[role] || 'Usuário'}</strong>).</p>
      <p><strong>Usuário:</strong> ${username}<br/>
      <strong>Senha temporária:</strong> ${tempPassword}</p>
      <p>Recomendamos alterar sua senha após o próximo acesso. Se você não solicitou isso, entre em contato com um administrador.</p>
      <p>${button(FRONTEND_URL, 'Acessar o Dashboard')}</p>
    `),
  };
}

function passwordChangedEmail({ username }) {
  return {
    subject: 'Sua senha foi alterada',
    html: layout('Senha alterada', `
      <p>Olá <strong>${username}</strong>,</p>
      <p>Sua senha do Dashboard foi alterada em ${new Date().toLocaleString('pt-BR')}.</p>
      <p>Se você não fez essa alteração, entre em contato com um administrador imediatamente.</p>
    `),
  };
}

function forgotPasswordEmail({ username, resetUrl }) {
  return {
    subject: 'Redefinição de senha',
    html: layout('Redefinir senha', `
      <p>Olá <strong>${username}</strong>,</p>
      <p>Recebemos uma solicitação para redefinir sua senha. Este link expira em 30 minutos.</p>
      <p>${button(resetUrl, 'Redefinir minha senha')}</p>
      <p>Se você não solicitou isso, pode ignorar este email com segurança.</p>
    `),
  };
}

function qaBlockedEmail({ recipientName, workItemTitle, workItemId, version, obs }) {
  return {
    subject: `[QA] Item bloqueado — #${workItemId}`,
    html: layout('Item bloqueado no QA Tracker', `
      <p>Olá ${recipientName ? '<strong>' + recipientName + '</strong>' : ''},</p>
      <p>O item <strong>#${workItemId} — ${workItemTitle}</strong> foi marcado como <strong>bloqueado</strong> na versão <strong>${version}</strong>.</p>
      ${obs ? `<p><strong>Observação:</strong> ${obs}</p>` : ''}
      <p>${button(FRONTEND_URL, 'Ver no Dashboard')}</p>
    `),
  };
}

function qaAssignedEmail({ recipientName, workItemTitle, workItemId, version }) {
  return {
    subject: `[QA] Novo item atribuído — #${workItemId}`,
    html: layout('Item atribuído a você', `
      <p>Olá <strong>${recipientName}</strong>,</p>
      <p>O item <strong>#${workItemId} — ${workItemTitle}</strong> foi atribuído a você para testes na versão <strong>${version}</strong>.</p>
      <p>${button(FRONTEND_URL, 'Ver no Dashboard')}</p>
    `),
  };
}

function qaVersionReadyEmail({ version, doneCount, blockedCount, totalCount }) {
  return {
    subject: `[QA] Versão ${version} concluída pelo QA`,
    html: layout('Versão pronta', `
      <p>Todos os itens da versão <strong>${version}</strong> foram testados.</p>
      <p><strong>${doneCount}</strong> concluídos, <strong>${blockedCount}</strong> bloqueados, de um total de <strong>${totalCount}</strong> itens.</p>
      <p>${button(FRONTEND_URL, 'Ver detalhes')}</p>
    `),
  };
}

function dailyDigestEmail({ username, pendingCount, blockedCount, items }) {
  const rows = items.slice(0, 10).map(i =>
    `<li>#${i.work_item_id} — ${i.title || 'sem título'} <span style="color:#6b7280;">(${i.status})</span></li>`
  ).join('');
  return {
    subject: `Resumo diário do QA — ${pendingCount + blockedCount} pendências`,
    html: layout('Seu resumo diário', `
      <p>Olá <strong>${username}</strong>,</p>
      <p>Você tem <strong>${pendingCount}</strong> itens pendentes e <strong>${blockedCount}</strong> bloqueados no QA Tracker.</p>
      <ul>${rows}</ul>
      <p>${button(FRONTEND_URL, 'Ver no Dashboard')}</p>
    `),
  };
}

function adminOverviewDigestEmail({ impediments, totalImpediments, newImpediments, externalBlocks, resolvedImpediments, resolvedImpedimentsPeriodLabel, teamSummaries, flowMetrics, insight, engagementLeaderboard, teamEngagement, throughputAnalysisText }) {
  const formatWorkItemRow = (i, extra) =>
    `<li>#${i.work_item_id} — ${i.title || 'sem título'} <span style="color:#6b7280;">(${i.team || 'sem time'}, ${i.assigned_to || 'sem responsável'}${extra ? ', ' + extra : ''})</span></li>`;

  const newImpedimentosRows = newImpediments.length
    ? newImpediments.map(i => formatWorkItemRow(i, `aberto há ${i.days_stopped}d`)).join('')
    : '<li style="color:#6b7280;">Sem impedimentos abertos nesta semana.</li>';

  const impedimentosRows = impediments.length
    ? impediments.map(i => formatWorkItemRow(i, `parado há ${i.days_stopped}d`)).join('')
    : '<li style="color:#6b7280;">Nenhum impedimento em aberto.</li>';

  const externalBlockRows = externalBlocks.length
    ? externalBlocks.map(i => formatWorkItemRow(i)).join('')
    : '<li style="color:#6b7280;">Nenhuma tarefa com bloqueio externo.</li>';

  const resolvedRows = (resolvedImpediments || []).length
    ? resolvedImpediments.map(i => `<li>#${i.work_item_id} — ${i.title || 'sem título'} <span style="color:#6b7280;">(${i.team || 'sem time'}, ${i.kind === 'bloqueio' ? 'bloqueio externo' : 'impedimento'}, resolvido em ${new Date(i.resolved_at).toLocaleDateString('pt-BR')})</span></li>`).join('')
    : `<li style="color:#6b7280;">Nenhum impedimento ou bloqueio resolvido (${resolvedImpedimentsPeriodLabel}).</li>`;

  const teamRows = teamSummaries.map(t => `
    <tr>
      <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">${t.team}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${t.in_progress}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${t.delivered_7d}</td>
      <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${t.open_bugs}</td>
    </tr>`).join('');

  const insightBlock = insight ? `
    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:14px 16px; margin-bottom:20px;">
      <strong style="color:#0369a1;">🤖 Análise da semana</strong>
      <p style="margin:8px 0 0; color:#0c4a6e;">${insight}</p>
    </div>` : '';

  const flowBlock = flowMetrics ? `
    <h3 style="color:#111827; margin: 20px 0 8px;">📈 Fluxo da semana (últimos 7 dias)</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <tbody>
        <tr>
          <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">Itens entregues</td>
          <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:right;"><strong>${flowMetrics.deliveredCount}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">Cycle time médio / P85</td>
          <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:right;"><strong>${flowMetrics.cycleTimeAvg}d / ${flowMetrics.cycleTimeP85}d</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">Lead time médio</td>
          <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:right;"><strong>${flowMetrics.leadTimeAvg}d</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 10px;">WIP atual (itens em andamento)</td>
          <td style="padding:6px 10px; text-align:right;"><strong>${flowMetrics.totalWip}</strong></td>
        </tr>
      </tbody>
    </table>` : '';

  const throughputAnalysisBlock = throughputAnalysisText ? `
    <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px 16px; margin: 20px 0;">
      <strong style="color:#111827;">📊 PRs Abertos vs Tempo Médio de Atendimento (semanal)</strong>
      <p style="margin:8px 0 0; color:#374151;">${throughputAnalysisText}</p>
    </div>` : '';

  const engagementRows = (engagementLeaderboard || []).length
    ? engagementLeaderboard.map(e => `
      <tr>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">${e.name}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${e.approvals}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${e.totalVotes}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:6px 10px; color:#6b7280;">Sem atividade de revisão de código registrada nos últimos 7 dias.</td></tr>`;

  const engagementBlock = `
    <h3 style="color:#111827; margin: 20px 0 8px;">🏅 Quem mais ajudou na revisão de código (últimos 7 dias)</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:6px 10px; text-align:left;">Nome</th>
          <th style="padding:6px 10px;">Aprovações</th>
          <th style="padding:6px 10px;">Total de votos</th>
        </tr>
      </thead>
      <tbody>${engagementRows}</tbody>
    </table>`;

  const teamEngagementRows = (teamEngagement || []).length
    ? teamEngagement.map(t => `
      <tr>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">${t.team}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${t.activeReviewers}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${t.approvals}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">${t.totalVotes}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:6px 10px; color:#6b7280;">Sem atividade de revisão de código por time nos últimos 7 dias.</td></tr>`;

  const teamEngagementBlock = `
    <h3 style="color:#111827; margin: 20px 0 8px;">👥 Engajamento em Code Review por Time (últimos 7 dias)</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:6px 10px; text-align:left;">Time</th>
          <th style="padding:6px 10px;">Pessoas ativas</th>
          <th style="padding:6px 10px;">Aprovações</th>
          <th style="padding:6px 10px;">Total de votos</th>
        </tr>
      </thead>
      <tbody>${teamEngagementRows}</tbody>
    </table>`;

  return {
    subject: `Resumo diário — Impedimentos, Times e Fluxo`,
    html: layout('Visão geral da operação', `
      ${insightBlock}
      <h3 style="color:#111827; margin-bottom:8px;">🆕 Impedimentos abertos esta semana</h3>
      <ul>${newImpedimentosRows}</ul>
      <h3 style="color:#111827; margin: 20px 0 8px;">🚧 Impedimentos (${totalImpediments} no total, top ${impediments.length} mais antigos)</h3>
      <ul>${impedimentosRows}</ul>
      <h3 style="color:#111827; margin: 20px 0 8px;">🔒 Tarefas com Bloqueio Externo</h3>
      <ul>${externalBlockRows}</ul>
      <h3 style="color:#111827; margin: 20px 0 8px;">✅ Impedimentos e bloqueios resolvidos (${resolvedImpedimentsPeriodLabel})</h3>
      <ul>${resolvedRows}</ul>
      <h3 style="color:#111827; margin: 20px 0 8px;">👥 Visão geral por time</h3>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:6px 10px; text-align:left;">Time</th>
            <th style="padding:6px 10px;">Em andamento</th>
            <th style="padding:6px 10px;">Entregues (7d)</th>
            <th style="padding:6px 10px;">Bugs abertos</th>
          </tr>
        </thead>
        <tbody>${teamRows}</tbody>
      </table>
      ${flowBlock}
      ${throughputAnalysisBlock}
      ${engagementBlock}
      ${teamEngagementBlock}
      <p style="margin-top:20px;">${button(FRONTEND_URL, 'Ver no Dashboard')}</p>
    `),
  };
}

function formatComposition(composition) {
  const entries = Object.entries(composition).filter(([, n]) => n > 0);
  if (!entries.length) return 'nenhuma entrega';
  return entries.map(([type, n]) => `${n} ${type}`).join(', ');
}

function weeklyTeamReportEmail({ closedWeekLabel, currentWeekLabel, ranking, teams, generalReading }) {
  const rankingRows = ranking.map((r, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}º`;
    return `<li>${medal} <strong>${r.team}</strong> — ${r.closedWeekCount} entregas</li>`;
  }).join('');

  const teamBlocks = teams.map(t => {
    const bottleneckLine = t.bottleneck
      ? `<li>Gargalo principal em <strong>${t.bottleneck.state}</strong>, com média de ${t.bottleneck.avgDays} dias.</li>`
      : '<li>Sem gargalo identificado nos itens em aberto.</li>';
    return `
      <div style="margin: 24px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h3 style="color:#111827; margin: 0 0 10px;">${t.team}</h3>
        <p style="margin: 4px 0;"><strong>Semana fechada:</strong> ${t.closedWeek.count} entregas (${formatComposition(t.closedWeek.composition)})</p>
        <p style="margin: 4px 0; color:#4b5563;">Cycle Time ${t.closedWeek.cycleTimeAvg}d (P85 ${t.closedWeek.cycleTimeP85}d) · Lead Time ${t.closedWeek.leadTimeAvg}d</p>
        <p style="margin: 12px 0 4px;"><strong>Semana atual:</strong> projeção de ~${t.currentWeek.projected} entregas até sexta</p>
        <ul style="margin: 8px 0;">
          <li>WIP atual: ${t.wip}</li>
          <li>${t.impediments} impedimento(s) ativo(s)</li>
          <li>${t.resolvedImpediments} impedimento(s) resolvido(s) essa semana</li>
          <li>${t.resolvedBlocks} bloqueio(s) externo(s) resolvido(s) essa semana</li>
          <li>${t.awaitingVersion} tarefa(s) aguardando versão (fechada, sem Delivered Version)</li>
          <li>Retrabalho: ${t.reworkPct}%</li>
          ${bottleneckLine}
        </ul>
        ${t.recommendation ? `<p style="margin: 10px 0 4px;"><strong>Recomendação para o PO:</strong> ${t.recommendation}</p>` : ''}
        ${t.suggestedMessage ? `<p style="margin: 4px 0; font-style: italic; color:#4b5563;">"${t.suggestedMessage}"</p>` : ''}
      </div>`;
  }).join('');

  return {
    subject: `📰 Informativo Semanal dos Times`,
    html: layout('Informativo Semanal dos Times', `
      <p style="color:#4b5563;">O volume de entregas considera apenas User Story, Issue, Bug e Eventuality. ${closedWeekLabel} · ${currentWeekLabel}.</p>
      <h3 style="color:#111827; margin: 20px 0 8px;">📈 Ranking de entregas da semana fechada</h3>
      <ul>${rankingRows}</ul>
      ${generalReading ? `
      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:14px 16px; margin: 20px 0;">
        <strong style="color:#0369a1;">📌 Leitura geral da semana</strong>
        <p style="margin:8px 0 0; color:#0c4a6e;">${generalReading}</p>
      </div>` : ''}
      ${teamBlocks}
      <p style="margin-top:20px;">${button(FRONTEND_URL, 'Ver no Dashboard')}</p>
    `),
  };
}

// times: [{ nome, metricas: [{ label, anterior, atual, unidade, cor: 'verde'|'vermelho'|'cinza', metaTexto }] }]
// Cor/meta já calculadas em painelPorTimeDigest.js (via faixaDoTime/dentroDaFaixa de services/painelMensal.js)
// — este template só formata, não decide nada de domínio (mesmo papel dos outros templates do arquivo).
function painelPorTimeDigestEmail({ periodoAnteriorLabel, periodoAtualLabel, times, insight }) {
  const CORES = { verde: '#16a34a', vermelho: '#dc2626', cinza: '#6b7280' };
  const formatar = (v, unidade) => (v === null || v === undefined ? '—' : `${v}${unidade}`);

  const insightBlock = insight ? `
    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:14px 16px; margin-bottom:20px;">
      <strong style="color:#0369a1;">🤖 Análise do período</strong>
      <p style="margin:8px 0 0; color:#0c4a6e;">${insight}</p>
    </div>` : '';

  const teamBlocks = times.map(t => {
    const rows = t.metricas.map(m => `
      <tr>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb;">${m.label}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:right; color:#6b7280;">${formatar(m.anterior, m.unidade)}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:right; font-weight:600; color:${CORES[m.cor] || CORES.cinza};">${formatar(m.atual, m.unidade)}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #e5e7eb; text-align:right; color:#9ca3af; font-size:12px;">${m.metaTexto}</td>
      </tr>`).join('');
    return `
      <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h3 style="color:#111827; margin: 0 0 10px;">${t.nome}</h3>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px 10px; text-align:left;">Métrica</th>
              <th style="padding:6px 10px; text-align:right;">Período anterior</th>
              <th style="padding:6px 10px; text-align:right;">Período atual</th>
              <th style="padding:6px 10px; text-align:right;">Meta</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return {
    subject: '📅 Resumo quinzenal — Painel por Time',
    html: layout('Resumo quinzenal do Painel por Time', `
      <p style="color:#4b5563;">Período anterior: ${periodoAnteriorLabel} · Período atual: ${periodoAtualLabel}.</p>
      ${insightBlock}
      ${teamBlocks}
      <p style="margin-top:20px;">${button(`${FRONTEND_URL}/?tab=painel-mensal`, 'Ver Painel por Time completo')}</p>
    `),
  };
}

function syncFailureEmail({ failureCount, lastError }) {
  return {
    subject: `⚠️ Falha na sincronização com Azure DevOps`,
    html: layout('Falha de sincronização', `
      <p>A sincronização com o Azure DevOps falhou <strong>${failureCount}</strong> vezes consecutivas.</p>
      <p><strong>Último erro:</strong> ${lastError}</p>
      <p>Verifique a configuração do Azure DevOps (PAT, organização, projeto) no servidor.</p>
    `),
  };
}

module.exports = {
  sendEmail,
  welcomeEmail,
  resendCredentialsEmail,
  passwordChangedEmail,
  forgotPasswordEmail,
  qaBlockedEmail,
  qaAssignedEmail,
  qaVersionReadyEmail,
  dailyDigestEmail,
  adminOverviewDigestEmail,
  weeklyTeamReportEmail,
  painelPorTimeDigestEmail,
  syncFailureEmail,
  FRONTEND_URL,
};
