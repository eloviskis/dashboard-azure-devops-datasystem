import React, { useState, useRef, useEffect } from 'react';

const STEP_LABELS = ['O que sincronizar', 'Conexão', 'Executar'];

type TestResult = { ok: boolean; error: string | null } | null;
type RunStatus = {
  run_id: number;
  source: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: string;
  finished_at: string | null;
  result_summary: Record<string, number> | null;
  error: string | null;
} | null;

// Wizard do assistente de sincronização de dado (Configurações → DSMetricsDotNet). Fala só com o backend
// novo (.NET) — em produção só funciona depois do Nginx rotear /api/settings/sync/* e /api/sync/* pro .NET
// (ver DEPLOY_AZURE.md no repositório DSMetricsDotNet). Estrutura de passos copiada de
// CeremoniesDashboard.tsx (NewRecordWizard).
const SyncWizard: React.FC<{ onClose: () => void; token: string; apiUrl: string }> = ({ onClose, token, apiUrl }) => {
  const [step, setStep] = useState(1);
  const [syncPostgres, setSyncPostgres] = useState(false);
  const [syncAzureDevOps, setSyncAzureDevOps] = useState(false);
  const [error, setError] = useState('');

  const [postgresConnString, setPostgresConnString] = useState('');
  const [postgresTestResult, setPostgresTestResult] = useState<TestResult>(null);
  const [postgresTesting, setPostgresTesting] = useState(false);

  const [azureOrg, setAzureOrg] = useState('');
  const [azureProject, setAzureProject] = useState('');
  const [azurePat, setAzurePat] = useState('');
  const [azureAutoSyncEnabled, setAzureAutoSyncEnabled] = useState(false);
  const [azureTestResult, setAzureTestResult] = useState<TestResult>(null);
  const [azureTesting, setAzureTesting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [postgresStatus, setPostgresStatus] = useState<RunStatus>(null);
  const [azureStatus, setAzureStatus] = useState<RunStatus>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Pré-preenche organização/projeto/toggle já salvos (não é segredo) — o PAT nunca volta por GET, fica
  // em branco de propósito (preencher de novo = trocar; deixar em branco = manter o já salvo).
  useEffect(() => {
    fetch(`${apiUrl}/api/settings/sync/azure-devops`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.organization) setAzureOrg(data.organization);
        if (data.project) setAzureProject(data.project);
        setAzureAutoSyncEnabled(!!data.auto_sync_enabled);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = async () => {
    setError('');
    if (step === 1) {
      if (!syncPostgres && !syncAzureDevOps) { setError('Selecione pelo menos uma fonte'); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      setSaving(true);
      try {
        if (syncPostgres) {
          if (!postgresConnString.trim()) { setError('Preencha a connection string do Postgres'); setSaving(false); return; }
          const res = await fetch(`${apiUrl}/api/settings/sync/postgres`, {
            method: 'PUT', headers: authHeaders, body: JSON.stringify({ connectionString: postgresConnString }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erro ao salvar conexão do Postgres'); }
        }
        if (syncAzureDevOps) {
          if (!azureOrg.trim() || !azureProject.trim()) { setError('Preencha organização e projeto do Azure DevOps'); setSaving(false); return; }
          const res = await fetch(`${apiUrl}/api/settings/sync/azure-devops`, {
            method: 'PUT', headers: authHeaders,
            body: JSON.stringify({ organization: azureOrg, project: azureProject, personalAccessToken: azurePat || null, autoSyncEnabled: azureAutoSyncEnabled }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erro ao salvar conexão do Azure DevOps'); }
        }
        setStep(3);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    }
  };
  const goBack = () => { setError(''); setStep(s => Math.max(1, s - 1)); };

  const testPostgres = async () => {
    setPostgresTesting(true); setPostgresTestResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/settings/sync/postgres/test-connection`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ connectionString: postgresConnString }),
      });
      setPostgresTestResult(await res.json());
    } catch (e: any) {
      setPostgresTestResult({ ok: false, error: e.message });
    } finally {
      setPostgresTesting(false);
    }
  };

  const testAzureDevOps = async () => {
    setAzureTesting(true); setAzureTestResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/settings/sync/azure-devops/test-connection`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ organization: azureOrg, project: azureProject, personalAccessToken: azurePat || null }),
      });
      setAzureTestResult(await res.json());
    } catch (e: any) {
      setAzureTestResult({ ok: false, error: e.message });
    } finally {
      setAzureTesting(false);
    }
  };

  const pollStatus = (source: string, setStatus: (s: RunStatus) => void) => {
    const check = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/sync/${source}/status`, { headers: authHeaders });
        if (res.ok) setStatus(await res.json());
      } catch { /* mantém o último status conhecido */ }
    };
    check();
    const interval = setInterval(check, 2000);
    pollRef.current = interval;
  };

  const startRun = async (source: 'postgres' | 'azure-devops', statusSource: string, setStatus: (s: RunStatus) => void) => {
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/sync/${source}/run`, { method: 'POST', headers: authHeaders });
      if (res.status === 409) { const d = await res.json(); setError(d.error); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erro ao iniciar sincronização'); }
      pollStatus(statusSource, setStatus);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const renderStatus = (status: RunStatus) => {
    if (!status) return null;
    if (status.status === 'running') {
      return <div className="flex items-center gap-2 text-ds-text text-sm"><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-ds-green" /> Rodando...</div>;
    }
    if (status.status === 'succeeded') {
      return (
        <div className="text-green-400 text-sm bg-green-500/10 rounded p-2">
          ✅ Concluído: {status.result_summary ? Object.entries(status.result_summary).map(([k, v]) => `${k}=${v}`).join(', ') : 'sem detalhes'}
        </div>
      );
    }
    return <div className="text-red-400 text-sm bg-red-500/10 rounded p-2">❌ Falhou: {status.error}</div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <h3 className="text-ds-light-text font-bold text-sm">🔄 Assistente de Sincronização de Dados</h3>
          <button onClick={onClose} className="text-ds-muted hover:text-white text-xl">&times;</button>
        </div>

        <div className="flex border-b border-ds-border">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className={`flex-1 text-center py-2 text-xs font-semibold border-b-2 ${step === i + 1 ? 'text-ds-green border-ds-green' : 'text-ds-muted border-transparent'}`}>
              {i + 1}. {label}
            </div>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && <div className="text-red-400 text-xs bg-red-500/10 rounded p-2">{error}</div>}

          {step === 1 && (
            <div className="space-y-3">
              <label className="flex items-start gap-2 p-3 border border-ds-border rounded-lg cursor-pointer hover:border-ds-green">
                <input type="checkbox" checked={syncPostgres} onChange={e => setSyncPostgres(e.target.checked)} className="mt-1 accent-ds-green" />
                <div>
                  <div className="text-sm text-ds-light-text font-medium">Usuários e DevTracker</div>
                  <div className="text-xs text-ds-text">Carga única do Postgres de produção — não repetível (já rodou uma vez para produção).</div>
                </div>
              </label>
              <label className="flex items-start gap-2 p-3 border border-ds-border rounded-lg cursor-pointer hover:border-ds-green">
                <input type="checkbox" checked={syncAzureDevOps} onChange={e => setSyncAzureDevOps(e.target.checked)} className="mt-1 accent-ds-green" />
                <div>
                  <div className="text-sm text-ds-light-text font-medium">Work Items e Pull Requests do Azure DevOps</div>
                  <div className="text-xs text-ds-text">Sincroniza direto da API do Azure DevOps (últimos 180 dias). Pode rodar de novo quando quiser.</div>
                </div>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {syncPostgres && (
                <div className="space-y-2">
                  <div className="text-sm text-ds-light-text font-medium">Postgres (produção)</div>
                  <input type="password" value={postgresConnString} onChange={e => setPostgresConnString(e.target.value)}
                    placeholder="postgresql://usuario:senha@host:5432/banco"
                    className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text font-mono focus:outline-none focus:border-ds-green" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={testPostgres} disabled={postgresTesting || !postgresConnString}
                      className="text-xs px-3 py-1.5 rounded-md border border-ds-border text-ds-text hover:bg-ds-border/50 disabled:opacity-50">
                      {postgresTesting ? 'Testando...' : 'Testar conexão'}
                    </button>
                    {postgresTestResult && (
                      <span className={`text-xs ${postgresTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {postgresTestResult.ok ? '✅ Conectou' : `❌ ${postgresTestResult.error}`}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {syncAzureDevOps && (
                <div className="space-y-2">
                  <div className="text-sm text-ds-light-text font-medium">Azure DevOps</div>
                  <input type="text" value={azureOrg} onChange={e => setAzureOrg(e.target.value)} placeholder="Organização"
                    className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
                  <input type="text" value={azureProject} onChange={e => setAzureProject(e.target.value)} placeholder="Projeto"
                    className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
                  <input type="password" value={azurePat} onChange={e => setAzurePat(e.target.value)} placeholder="Personal Access Token (deixe em branco para manter o já salvo)"
                    className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text font-mono focus:outline-none focus:border-ds-green" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={testAzureDevOps} disabled={azureTesting || !azureOrg || !azureProject}
                      className="text-xs px-3 py-1.5 rounded-md border border-ds-border text-ds-text hover:bg-ds-border/50 disabled:opacity-50">
                      {azureTesting ? 'Testando...' : 'Testar conexão'}
                    </button>
                    {azureTestResult && (
                      <span className={`text-xs ${azureTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {azureTestResult.ok ? '✅ Conectou' : `❌ ${azureTestResult.error}`}
                      </span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 pt-1">
                    <input type="checkbox" checked={azureAutoSyncEnabled} onChange={e => setAzureAutoSyncEnabled(e.target.checked)} className="accent-ds-green" />
                    <span className="text-xs text-ds-text">Habilitar sincronização automática (a cada 30 min, sem precisar abrir este assistente)</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              {syncPostgres && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ds-light-text font-medium">Usuários e DevTracker</span>
                    <button type="button" onClick={() => startRun('postgres', 'postgres_etl', setPostgresStatus)}
                      disabled={postgresStatus?.status === 'running'}
                      className="text-xs px-3 py-1.5 rounded-md bg-ds-green text-ds-dark-blue font-bold hover:bg-ds-green/80 disabled:opacity-50">
                      Iniciar sincronização
                    </button>
                  </div>
                  {renderStatus(postgresStatus)}
                </div>
              )}
              {syncAzureDevOps && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ds-light-text font-medium">Work Items e Pull Requests</span>
                    <button type="button" onClick={() => startRun('azure-devops', 'azure_devops', setAzureStatus)}
                      disabled={azureStatus?.status === 'running'}
                      className="text-xs px-3 py-1.5 rounded-md bg-ds-green text-ds-dark-blue font-bold hover:bg-ds-green/80 disabled:opacity-50">
                      Iniciar sincronização
                    </button>
                  </div>
                  {renderStatus(azureStatus)}
                </div>
              )}
              <p className="text-xs text-ds-muted">Fechar esta janela não interrompe a sincronização — ela continua rodando no servidor. Reabra o assistente para conferir o resultado.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-ds-border">
          <button onClick={goBack} disabled={step === 1}
            className="px-4 py-2 text-sm bg-ds-border/30 text-ds-text rounded-lg hover:bg-ds-border/50 disabled:opacity-40">
            Voltar
          </button>
          {step < 3 ? (
            <button onClick={goNext} disabled={saving}
              className="px-4 py-2 text-sm bg-ds-green text-ds-dark-blue font-bold rounded-lg hover:bg-ds-green/80 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Avançar'}
            </button>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-border/30 text-ds-text rounded-lg hover:bg-ds-border/50">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SyncWizard;
