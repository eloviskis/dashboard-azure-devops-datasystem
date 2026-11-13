// backend/services/userMatch.js
// Matches free-text names (qa_person, work_items.qa/dev/po) to registered users,
// since those fields have no foreign key to the users table.

function normalize(text) {
  if (!text) return '';
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .trim();
}

// Finds a user whose username (or email local-part) matches the given free-text name.
// Returns the user row or null. Never throws.
async function findUserByName(sql, name) {
  if (!name) return null;
  const target = normalize(name);
  if (!target) return null;

  try {
    const users = await sql`SELECT id, username, email, role FROM users`;
    const exact = users.find(u => normalize(u.username) === target);
    if (exact) return exact;

    const emailLocalPart = users.find(u => normalize((u.email || '').split('@')[0]) === target);
    if (emailLocalPart) return emailLocalPart;

    // loose match: name contained in username or vice-versa (handles "joao.silva" vs "João Silva")
    const loose = users.find(u => {
      const uname = normalize(u.username);
      return uname && (uname.includes(target) || target.includes(uname));
    });
    if (loose) return loose;

    console.warn(`⚠️ userMatch: nenhum usuário encontrado para "${name}"`);
    return null;
  } catch (err) {
    console.error('❌ userMatch.findUserByName error:', err.message);
    return null;
  }
}

async function getAdminEmails(sql) {
  try {
    const admins = await sql`SELECT email FROM users WHERE role = 'admin' AND notifications_enabled != FALSE`;
    return admins.map(a => a.email).filter(Boolean);
  } catch (err) {
    console.error('❌ userMatch.getAdminEmails error:', err.message);
    return [];
  }
}

// Emails de segurança (senha, boas-vindas) ignoram essa preferência — só vale para notificações do QA Tracker.
async function isNotifiable(sql, email) {
  if (!email) return false;
  try {
    const rows = await sql`SELECT notifications_enabled FROM users WHERE email = ${email}`;
    if (!rows.length) return true; // destinatário sem cadastro (não deveria acontecer) — não bloqueia
    return rows[0].notifications_enabled !== false;
  } catch (err) {
    console.error('❌ userMatch.isNotifiable error:', err.message);
    return true;
  }
}

async function getUsersByRole(sql, roles) {
  if (!roles?.length) return [];
  try {
    const users = await sql`SELECT email FROM users WHERE role = ANY(${roles}) AND notifications_enabled != FALSE`;
    return users.map(u => u.email).filter(Boolean);
  } catch (err) {
    console.error('❌ userMatch.getUsersByRole error:', err.message);
    return [];
  }
}

// Preserva o comportamento atual (só admins) até o admin configurar o mapeamento pela tela de notificações.
const DEFAULT_REPORT_ROLES = ['admin'];

// reportKey: 'admin_overview_digest' | 'weekly_team_report' | 'sync_failure'
// Lê o mapeamento relatório -> cargos em app_settings (key='notification_role_mapping', configurável pela UI).
async function getReportRecipients(sql, reportKey) {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'notification_role_mapping'`;
    let roles = DEFAULT_REPORT_ROLES;
    if (rows.length) {
      const mapping = JSON.parse(rows[0].value);
      if (Array.isArray(mapping[reportKey]) && mapping[reportKey].length) {
        roles = mapping[reportKey];
      }
    }
    return await getUsersByRole(sql, roles);
  } catch (err) {
    console.error('❌ userMatch.getReportRecipients error:', err.message);
    return getUsersByRole(sql, DEFAULT_REPORT_ROLES);
  }
}

// Mesma leitura de app_settings.notification_role_mapping que getReportRecipients, mas sem cair no
// default ['admin'] quando não há cargo configurado — usa fallbackEmails (lista fixa do chamador) em
// vez disso. Pra relatórios novos que, antes de alguém configurar um cargo pela UI, devem ir só pra um
// e-mail específico, não pra todos os admins.
async function getReportRecipientsOrFallback(sql, reportKey, fallbackEmails) {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'notification_role_mapping'`;
    if (rows.length) {
      const mapping = JSON.parse(rows[0].value);
      if (Array.isArray(mapping[reportKey]) && mapping[reportKey].length) {
        const emails = await getUsersByRole(sql, mapping[reportKey]);
        if (emails.length) return emails;
      }
    }
    return fallbackEmails;
  } catch (err) {
    console.error('❌ userMatch.getReportRecipientsOrFallback error:', err.message);
    return fallbackEmails;
  }
}

module.exports = { findUserByName, getAdminEmails, isNotifiable, getUsersByRole, getReportRecipients, getReportRecipientsOrFallback };
