import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface EntraIdSettings {
  enabled: boolean;
  tenantId: string;
  clientId: string;
}

const EMPTY_SETTINGS: EntraIdSettings = { enabled: false, tenantId: '', clientId: '' };

// Settings do novo backend .NET (DSMetricsDotNet) — enquanto a migração não cobre o domínio de
// Settings do Node (Fase 2 do plano), essa tela só fala com o backend novo. Em produção, isso só
// funciona depois que o Nginx rotear /api/settings/entra-id e /api/auth/entra-login pro .NET.
const SettingsPage: React.FC = () => {
  const { token } = useAuth();
  const [settings, setSettings] = useState<EntraIdSettings>(EMPTY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '';

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings/entra-id`);
      if (response.ok) {
        const data = await response.json();
        setSettings({ enabled: !!data.enabled, tenantId: data.tenant_id ?? '', clientId: data.client_id ?? '' });
      }
    } catch {
      setError('Erro de conexão ao carregar configuração');
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (settings.enabled && (!settings.tenantId.trim() || !settings.clientId.trim())) {
      setError('Tenant ID e Client ID são obrigatórios para habilitar o login com Microsoft');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/settings/entra-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ enabled: settings.enabled, tenantId: settings.tenantId || null, clientId: settings.clientId || null }),
      });
      if (response.ok) {
        setSuccess('Configuração salva com sucesso.');
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Erro ao salvar configuração');
      }
    } catch {
      setError('Erro de conexão ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-ds-light-text mb-1">Configurações</h1>
      <p className="text-xs text-ds-text mb-6">Conector de login com Microsoft Entra ID (Azure AD). Só autentica usuários que já têm conta cadastrada aqui com o mesmo email da conta Microsoft — não cria usuário novo.</p>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg">{success}</div>
      )}

      <div className="bg-ds-navy rounded-lg p-6 mb-4 border border-ds-border">
        <h2 className="text-sm font-semibold text-ds-light-text mb-3">Microsoft Entra ID</h2>
        <p className="text-xs text-ds-text mb-4">
          No Azure Portal, crie uma "App registration" do tipo <strong>SPA (public client, sem secret)</strong> com
          Redirect URI igual à URL desta ferramenta, e cole o Tenant ID e Application (client) ID abaixo. Veja
          DEPLOY_AZURE.md no repositório do backend pro passo a passo completo.
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
              className="accent-ds-green"
            />
            <span className="text-sm text-ds-light-text">Habilitar login com Microsoft</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Tenant ID</span>
            <input
              type="text"
              value={settings.tenantId}
              onChange={e => setSettings(prev => ({ ...prev, tenantId: e.target.value }))}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Application (client) ID</span>
            <input
              type="text"
              value={settings.clientId}
              onChange={e => setSettings(prev => ({ ...prev, clientId: e.target.value }))}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text font-mono"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="mt-4 px-4 py-2 bg-ds-green hover:bg-ds-green/80 text-ds-dark-blue font-medium rounded-md text-sm transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
