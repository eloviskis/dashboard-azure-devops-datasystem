import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

interface AzureConfigModalProps {
  token: string;
  onClose: () => void;
}

const AzureConfigModal: React.FC<AzureConfigModalProps> = ({ token, onClose }) => {
  const [org, setOrg] = useState('');
  const [project, setProject] = useState('');
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean; message: string} | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API}/api/admin/azure-settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setOrg(d.organization || ''); setProject(d.project || ''); })
      .catch(() => {});
  }, [token]);

  async function testConnection() {
    if (!org || !project || !pat) return;
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/api/public/test-azure`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, project, pat }),
      });
      const d = await r.json();
      setTestResult({ ok: d.ok, message: d.ok ? `✅ Conexão OK — ${d.count ?? 0} itens encontrados` : `❌ ${d.error}` });
    } catch {
      setTestResult({ ok: false, message: '❌ Erro de rede' });
    }
    setTesting(false);
  }

  async function handleSave() {
    if (!org || !project || !pat) { setError('Todos os campos são obrigatórios'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/admin/azure-settings`, {
        method: 'PUT', headers,
        body: JSON.stringify({ organization: org, project, pat }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Erro ao salvar'); return; }
      setSaved(true);
      setTimeout(() => { onClose(); }, 2000);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  const inputCls = 'w-full bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2.5 text-sm text-ds-light-text placeholder:text-ds-text/40 focus:outline-none focus:border-ds-green transition-colors';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-ds-navy border border-ds-border rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-ds-light-text">⚙️ Configurações Azure DevOps</h2>
            <p className="text-xs text-ds-text mt-0.5">Atualize as credenciais de integração</p>
          </div>
          <button onClick={onClose} className="text-ds-text hover:text-ds-light-text text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ds-text block mb-1">Organização Azure DevOps</label>
            <input value={org} onChange={e => setOrg(e.target.value)} className={inputCls}
              placeholder="ex: datasystemsoftwares" />
            <p className="text-xs text-ds-text/50 mt-0.5">dev.azure.com/<strong>{org || 'organização'}</strong></p>
          </div>
          <div>
            <label className="text-xs text-ds-text block mb-1">Projeto</label>
            <input value={project} onChange={e => setProject(e.target.value)} className={inputCls}
              placeholder="ex: USE" />
          </div>
          <div>
            <label className="text-xs text-ds-text block mb-1">
              Personal Access Token (PAT)
              <a href="https://dev.azure.com" target="_blank" rel="noopener noreferrer"
                className="ml-2 text-ds-green hover:underline">Gerar PAT ↗</a>
            </label>
            <input type="password" value={pat} onChange={e => setPat(e.target.value)} className={inputCls}
              placeholder="Cole seu PAT aqui" />
            <p className="text-xs text-ds-text/50 mt-0.5">Permissões mínimas: Work Items (Read), Code (Read), Graph (Read)</p>
          </div>

          {testResult && (
            <p className={`text-xs rounded p-2 ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {testResult.message}
            </p>
          )}
          {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
          {saved && <p className="text-xs text-green-400 bg-green-500/10 rounded p-2">✅ Configurações salvas! Sincronização iniciada...</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={testConnection} disabled={testing || !org || !project || !pat}
            className="flex-1 py-2 border border-ds-border rounded-lg text-ds-text text-sm hover:border-ds-green/40 transition-colors disabled:opacity-40">
            {testing ? 'Testando...' : '🔌 Testar'}
          </button>
          <button onClick={handleSave} disabled={loading || !org || !project || !pat}
            className="flex-2 flex-grow py-2 bg-ds-green text-ds-dark-blue rounded-lg font-bold text-sm hover:brightness-110 disabled:opacity-40">
            {loading ? 'Salvando...' : '💾 Salvar e Sincronizar'}
          </button>
        </div>

        <p className="text-xs text-ds-text/50 mt-3 text-center">
          O PAT é criptografado antes de ser armazenado. A sincronização inicia imediatamente após salvar.
        </p>
      </div>
    </div>
  );
};

export default AzureConfigModal;
