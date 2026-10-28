import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface HistoryEntry {
  type: string;
  recipient_email: string;
  related_key: string | null;
  sent_at: string;
}

interface UserOption {
  id: number;
  username: string;
  email: string;
}

const TYPE_LABELS: Record<string, string> = {
  admin_overview_digest: 'Resumo diário',
  weekly_team_report: 'Informativo semanal',
  painel_por_time_quinzenal: 'Resumo do Painel por Time',
  sync_failure: 'Alerta de falha de sync',
  daily_digest: 'Resumo pessoal de QA',
  qa_blocked: 'Item bloqueado (QA)',
  qa_assigned: 'Item atribuído (QA)',
  qa_version_ready: 'Versão pronta (QA)',
  welcome: 'Boas-vindas',
  resend_credentials: 'Reenvio de credenciais',
  password_changed: 'Senha alterada',
  password_reset: 'Redefinição de senha',
  password_reset_requested: 'Solicitação de redefinição',
};

const REPORTS = [
  { key: 'admin-overview-digest', typeKey: 'admin_overview_digest', label: 'Resumo Diário', hint: 'Impedimentos, times e fluxo — envia em segundos' },
  { key: 'weekly-team-report', typeKey: 'weekly_team_report', label: 'Informativo Semanal dos Times', hint: 'Ranking, composição e narrativa por IA — leva ~2 minutos' },
  { key: 'painel-por-time-quinzenal', typeKey: 'painel_por_time_quinzenal', label: 'Resumo do Painel por Time', hint: 'Comparação quinzenal com insight de IA — envia em segundos' },
];

const NotificationHistoryPage: React.FC = () => {
  const { token } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendingKey, setResendingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, string[]>>({});

  const API_URL = import.meta.env.VITE_API_URL || '';

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/history`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        setHistory(await response.json());
      } else {
        setError('Erro ao carregar histórico');
      }
    } catch {
      setError('Erro de conexão ao carregar histórico');
    }
  }, [token, API_URL]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        setUsers(await response.json());
      }
    } catch {
      // silencioso — só afeta a seleção de destinatários específicos
    }
  }, [token, API_URL]);

  useEffect(() => {
    Promise.all([fetchHistory(), fetchUsers()]).finally(() => setIsLoading(false));
  }, [fetchHistory, fetchUsers]);

  // Último recebimento de cada relatório, por pessoa — ajuda a ver quem ficou de fora.
  const lastReceivedByEmailAndType = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const h of history) {
      if (!map[h.recipient_email]) map[h.recipient_email] = {};
      if (!map[h.recipient_email][h.type] || h.sent_at > map[h.recipient_email][h.type]) {
        map[h.recipient_email][h.type] = h.sent_at;
      }
    }
    return map;
  }, [history]);

  const toggleRecipient = (reportKey: string, email: string) => {
    setSelectedRecipients(prev => {
      const current = prev[reportKey] || [];
      const next = current.includes(email) ? current.filter(e => e !== email) : [...current, email];
      return { ...prev, [reportKey]: next };
    });
  };

  const handleResend = async (report: typeof REPORTS[number]) => {
    setError('');
    setSuccess('');
    setResendingKey(report.key);
    const recipients = selectedRecipients[report.key] || [];
    try {
      const response = await fetch(`${API_URL}/api/notifications/resend/${report.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(recipients.length ? { recipients } : {}),
      });
      const data = await response.json();
      if (response.ok) {
        const who = recipients.length ? `para ${recipients.length} pessoa(s) selecionada(s)` : 'para os destinatários configurados';
        setSuccess(`${report.label} reenviado com sucesso ${who}.`);
        fetchHistory();
      } else {
        setError(data.error || `Erro ao reenviar ${report.label}`);
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setResendingKey(null);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-ds-light-text mb-6">Histórico e Reenvio de Notificações</h1>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg">{success}</div>
      )}

      <div className="bg-ds-navy rounded-lg p-6 mb-6 border border-ds-border">
        <h2 className="text-lg font-semibold text-ds-light-text mb-1">Reenviar relatório agora</h2>
        <p className="text-xs text-ds-text mb-4">Gera o relatório de novo com os dados atuais. Por padrão envia pros destinatários configurados em "Notificações por Cargo" — escolha pessoas específicas se alguém não recebeu.</p>
        <div className="flex flex-col gap-3">
          {REPORTS.map(report => {
            const selected = selectedRecipients[report.key] || [];
            const isExpanded = expandedKey === report.key;
            return (
              <div key={report.key} className="bg-ds-dark-blue border border-ds-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-ds-light-text">{report.label}</span>
                    <p className="text-xs text-ds-text mt-0.5">{report.hint}</p>
                    {selected.length > 0 && (
                      <p className="text-xs text-ds-green mt-0.5">{selected.length} destinatário(s) específico(s) selecionado(s)</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : report.key)}
                      className="text-xs px-3 py-2 rounded-md border border-ds-border text-ds-text hover:bg-ds-border/50 transition-colors"
                    >
                      {isExpanded ? 'Fechar' : 'Escolher destinatários'}
                    </button>
                    <button
                      onClick={() => handleResend(report)}
                      disabled={resendingKey !== null}
                      className="text-xs px-3 py-2 rounded-md bg-ds-green text-ds-dark-blue font-semibold hover:bg-ds-green/80 disabled:opacity-50 flex items-center gap-2"
                    >
                      {resendingKey === report.key && (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      Reenviar
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-ds-border px-4 py-3 bg-ds-navy/50">
                    <p className="text-xs text-ds-text mb-2">Marque quem deve receber (deixe tudo desmarcado pra usar os destinatários configurados por cargo):</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {users.map(u => {
                        const lastReceived = lastReceivedByEmailAndType[u.email]?.[report.typeKey];
                        return (
                          <label
                            key={u.id}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                              selected.includes(u.email)
                                ? 'bg-ds-green/10 border-ds-green/30 text-ds-light-text'
                                : 'bg-ds-dark-blue border-ds-border text-ds-text'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={selected.includes(u.email)}
                                onChange={() => toggleRecipient(report.key, u.email)}
                                className="accent-ds-green w-4 h-4 shrink-0"
                              />
                              <span className="text-xs truncate">{u.username}</span>
                            </span>
                            <span className={`text-[10px] shrink-0 ${lastReceived ? 'text-ds-text' : 'text-yellow-400'}`} title={u.email}>
                              {lastReceived ? formatDate(lastReceived) : 'nunca recebeu'}
                            </span>
                          </label>
                        );
                      })}
                      {users.length === 0 && (
                        <p className="text-xs text-ds-text col-span-2 text-center py-2">Nenhum usuário cadastrado.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
        <div className="px-4 py-3 border-b border-ds-border">
          <h2 className="text-sm font-semibold text-ds-light-text">Últimos envios (quem recebeu o quê e quando)</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-ds-dark-blue">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-ds-text">Pessoa</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-ds-text">Relatório</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-ds-text">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border">
              {history.map((h, i) => (
                <tr key={i} className="hover:bg-ds-dark-blue/50 transition-colors">
                  <td className="px-4 py-2 text-ds-light-text text-sm">{h.recipient_email}</td>
                  <td className="px-4 py-2 text-ds-text text-sm">{TYPE_LABELS[h.type] || h.type}</td>
                  <td className="px-4 py-2 text-ds-text text-sm">{formatDate(h.sent_at)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-ds-text">Nenhum envio registrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default NotificationHistoryPage;
