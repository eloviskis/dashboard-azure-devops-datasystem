import React, { useState, useEffect } from 'react';
import { useAuth, UserRole } from '../contexts/AuthContext';

interface NotificationRoleConfigModalProps {
  onClose: () => void;
}

const SETTINGS_KEY = 'notification_role_mapping';

const REPORT_TYPES: { key: string; label: string; description: string }[] = [
  { key: 'admin_overview_digest', label: 'Resumo diário', description: 'Impedimentos, times e fluxo — todo dia útil às 8h' },
  { key: 'weekly_team_report', label: 'Informativo semanal dos times', description: 'Ranking, composição, cycle/lead time por time — toda segunda às 8h' },
  { key: 'painel_por_time_quinzenal', label: 'Resumo do Painel por Time', description: 'Comparação quinzenal por time, com insight de IA — a cada 15 dias. Sem cargo marcado, vai só pro e-mail padrão configurado no servidor' },
  { key: 'sync_failure', label: 'Alerta de falha de sincronização', description: 'Quando o sync com o Azure DevOps falha repetidamente' },
];

const ROLE_COLUMNS: { role: UserRole; label: string }[] = [
  { role: 'QA', label: 'QA' },
  { role: 'PO', label: 'PO' },
  { role: 'DEV', label: 'DEV' },
  { role: 'GESTOR', label: 'Gestor' },
  { role: 'admin', label: 'Admin' },
];

type Mapping = Record<string, UserRole[]>;

const DEFAULT_MAPPING: Mapping = {
  admin_overview_digest: ['admin'],
  weekly_team_report: ['admin'],
  sync_failure: ['admin'],
};

const NotificationRoleConfigModal: React.FC<NotificationRoleConfigModalProps> = ({ onClose }) => {
  const { token } = useAuth();
  const [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    const fetchMapping = async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/${SETTINGS_KEY}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.value) {
            setMapping({ ...DEFAULT_MAPPING, ...data.value });
          }
        }
      } catch {
        setError('Erro ao carregar configuração');
      } finally {
        setLoading(false);
      }
    };
    fetchMapping();
  }, [API_URL, token]);

  const toggleRole = (reportKey: string, role: UserRole) => {
    setMapping(prev => {
      const current = prev[reportKey] || [];
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
      return { ...prev, [reportKey]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/settings/${SETTINGS_KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ value: mapping }),
      });
      if (res.ok) {
        onClose();
      } else {
        setError('Erro ao salvar configuração');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-ds-border flex items-center justify-between">
          <h2 className="text-ds-light-text font-bold text-lg">🔔 Notificações por Cargo</h2>
          <button onClick={onClose} className="text-ds-text hover:text-ds-light-text text-xl">&times;</button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <p className="text-xs text-ds-text mb-4">Marque quais cargos recebem cada relatório automático por email.</p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ds-border">
                    <th className="text-left py-2 pr-2 text-ds-text font-medium">Relatório</th>
                    {ROLE_COLUMNS.map(col => (
                      <th key={col.role} className="px-2 py-2 text-center text-ds-text font-medium">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {REPORT_TYPES.map(report => (
                    <tr key={report.key} className="border-b border-ds-border/50">
                      <td className="py-3 pr-2">
                        <p className="text-ds-light-text font-medium">{report.label}</p>
                        <p className="text-xs text-ds-text mt-0.5">{report.description}</p>
                      </td>
                      {ROLE_COLUMNS.map(col => (
                        <td key={col.role} className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={(mapping[report.key] || []).includes(col.role)}
                            onChange={() => toggleRole(report.key, col.role)}
                            className="accent-ds-green w-4 h-4"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-ds-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-muted/20 text-ds-text rounded-md hover:bg-ds-muted/30">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm bg-ds-green text-ds-dark-blue rounded-md font-semibold hover:bg-ds-green/80 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationRoleConfigModal;
