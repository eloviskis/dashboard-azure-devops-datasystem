import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

interface SignupWizardProps {
  onSuccess: (token: string, tenantSlug: string) => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

const SignupWizard: React.FC<SignupWizardProps> = ({ onSuccess, onCancel }) => {
  const [step, setStep]       = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Step 1 — Empresa
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName]     = useState('');
  const [ownerEmail, setOwnerEmail]   = useState('');
  const [password, setPassword]       = useState('');
  const [phone, setPhone]             = useState('');

  // Step 2 — Azure DevOps
  const [azureOrg, setAzureOrg]         = useState('');
  const [azureProject, setAzureProject] = useState('');
  const [azurePat, setAzurePat]         = useState('');
  const [azureOk, setAzureOk]           = useState<boolean | null>(null);
  const [testingAzure, setTestingAzure] = useState(false);

  const inputCls = 'w-full bg-white/5 border border-ds-border rounded-lg px-3 py-2.5 text-sm text-ds-light-text focus:outline-none focus:border-ds-green placeholder:text-ds-text/40';
  const labelCls = 'block text-xs font-medium text-ds-text mb-1';

  async function testAzure() {
    setTestingAzure(true); setAzureOk(null); setError('');
    try {
      const r = await fetch(`${API}/api/public/test-azure`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: azureOrg, project: azureProject, pat: azurePat })
      });
      const d = await r.json();
      setAzureOk(d.ok === true);
      if (!d.ok) setError(d.error || 'Conexão falhou');
    } catch { setAzureOk(false); setError('Erro ao testar conexão'); }
    setTestingAzure(false);
  }

  async function handleSubmit() {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/public/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName, owner_name: ownerName, owner_email: ownerEmail,
          password, phone, azure_org: azureOrg, azure_project: azureProject, azure_pat: azurePat
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro no cadastro');
      onSuccess(d.token, d.tenant_slug);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  const steps: { num: Step; label: string }[] = [
    { num: 1, label: 'Sua empresa' },
    { num: 2, label: 'Azure DevOps' },
    { num: 3, label: 'Revisão' },
  ];

  return (
    <div className="fixed inset-0 z-[300] bg-ds-dark-blue/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-ds-navy border border-ds-border rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ds-border flex items-center justify-between">
          <div>
            <h2 className="text-ds-light-text font-bold">Criar conta gratuita</h2>
            <p className="text-xs text-ds-text mt-0.5">30 dias grátis, sem cartão de crédito</p>
          </div>
          <button onClick={onCancel} className="text-ds-text hover:text-ds-light-text text-xl">✕</button>
        </div>

        {/* Progress */}
        <div className="flex items-center px-6 py-4 gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s.num}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= s.num ? 'text-ds-green' : 'text-ds-text/50'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${step >= s.num ? 'bg-ds-green text-ds-dark-blue border-ds-green' : 'border-ds-text/30 text-ds-text/40'}`}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-px ${step > s.num ? 'bg-ds-green' : 'bg-ds-border'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="px-6 pb-6 space-y-4">
          {error && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nome da empresa *</label>
                <input className={inputCls} placeholder="Acme Corp" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Seu nome *</label>
                <input className={inputCls} placeholder="João Silva" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>E-mail *</label>
                <input type="email" className={inputCls} placeholder="joao@empresa.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Senha *</label>
                <input type="password" className={inputCls} placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Telefone (opcional)</label>
                <input className={inputCls} placeholder="(11) 99999-9999" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <button
                disabled={!companyName || !ownerEmail || password.length < 8}
                onClick={() => { setError(''); setStep(2); }}
                className="w-full py-2.5 rounded-lg bg-ds-green text-ds-dark-blue font-bold text-sm disabled:opacity-40 hover:brightness-110 transition-all mt-2"
              >
                Próximo →
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-ds-text">
                Conecte ao Azure DevOps para sincronizar seus dados.{' '}
                <a href="https://learn.microsoft.com/pt-br/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate" target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline">
                  Como gerar um PAT?
                </a>
              </p>
              <div>
                <label className={labelCls}>Organização Azure DevOps</label>
                <input className={inputCls} placeholder="ex: minhaempresa" value={azureOrg} onChange={e => { setAzureOrg(e.target.value); setAzureOk(null); }} />
              </div>
              <div>
                <label className={labelCls}>Projeto</label>
                <input className={inputCls} placeholder="ex: MeuProjeto" value={azureProject} onChange={e => { setAzureProject(e.target.value); setAzureOk(null); }} />
              </div>
              <div>
                <label className={labelCls}>Personal Access Token (PAT)</label>
                <input type="password" className={inputCls} placeholder="PAT do Azure DevOps" value={azurePat} onChange={e => { setAzurePat(e.target.value); setAzureOk(null); }} />
              </div>
              {azureOrg && azureProject && azurePat && (
                <button onClick={testAzure} disabled={testingAzure}
                  className="w-full py-2 rounded-lg border border-ds-border text-ds-text text-sm hover:border-ds-green/40 transition-colors">
                  {testingAzure ? '⏳ Testando...' : azureOk === true ? '✅ Conectado!' : azureOk === false ? '❌ Falhou — testar novamente' : '🔗 Testar conexão'}
                </button>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-lg border border-ds-border text-ds-text text-sm hover:border-ds-green/30 transition-colors">← Voltar</button>
                <button
                  onClick={() => { setError(''); setStep(3); }}
                  className="flex-1 py-2.5 rounded-lg bg-ds-green text-ds-dark-blue font-bold text-sm hover:brightness-110 transition-all"
                >
                  {!azureOrg ? 'Pular por agora →' : 'Próximo →'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-ds-dark-blue rounded-xl border border-ds-border p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ds-text">Empresa</span><span className="text-ds-light-text font-medium">{companyName}</span></div>
                <div className="flex justify-between"><span className="text-ds-text">E-mail</span><span className="text-ds-light-text">{ownerEmail}</span></div>
                {azureOrg && <div className="flex justify-between"><span className="text-ds-text">Azure Org</span><span className="text-ds-light-text">{azureOrg}</span></div>}
                {azureProject && <div className="flex justify-between"><span className="text-ds-text">Projeto</span><span className="text-ds-light-text">{azureProject}</span></div>}
                <div className="flex justify-between"><span className="text-ds-text">Trial</span><span className="text-ds-green font-semibold">30 dias grátis</span></div>
              </div>
              <p className="text-xs text-ds-text/60">
                Ao criar sua conta você concorda com os termos de uso. Nenhum cartão de crédito necessário agora.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-lg border border-ds-border text-ds-text text-sm hover:border-ds-green/30 transition-colors">← Voltar</button>
                <button
                  onClick={handleSubmit} disabled={loading}
                  className="flex-1 py-2.5 rounded-lg bg-ds-green text-ds-dark-blue font-bold text-sm disabled:opacity-50 hover:brightness-110 transition-all"
                >
                  {loading ? '⏳ Criando conta...' : '🚀 Criar conta e começar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignupWizard;
