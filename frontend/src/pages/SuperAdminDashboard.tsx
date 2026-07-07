import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';

interface Tenant {
  id: number; slug: string; company_name: string; owner_email: string; owner_name: string;
  subscription_status: string; trial_ends_at: string; created_at: string;
  plan_name: string; price_brl: number; user_count: number; last_sync: string;
}

interface Stats {
  total: number; trial: number; active: number; expired: number; manual: number; mrr: number;
}

interface Plan {
  id: number; name: string; price_brl: number; max_users: number; trial_days: number;
  mp_plan_id: string; active: boolean;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  trial:     { label: 'Trial',     cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  active:    { label: 'Ativo',     cls: 'bg-green-500/10 text-green-400 border-green-500/20'   },
  expired:   { label: 'Expirado',  cls: 'bg-red-500/10 text-red-400 border-red-500/20'          },
  cancelled: { label: 'Cancelado', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20'       },
  manual:    { label: 'Manual',    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'        },
};

const SuperAdminDashboard: React.FC<{ onLogout: () => void; adminToken?: string }> = ({ onLogout, adminToken }) => {
  const [token, setToken]         = useState(adminToken || '');
  const [masterKey, setMasterKey] = useState('');
  const [loginErr, setLoginErr]   = useState('');
  const [tab, setTab]             = useState<'tenants' | 'plans' | 'revenue' | 'degustacao'>('tenants');
  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [plans, setPlans]         = useState<Plan[]>([]);
  const [revenue, setRevenue]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState<Tenant | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editTrialDays, setEditTrialDays] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Degustação: criar conta
  const [degEmail, setDegEmail]     = useState('');
  const [degEmpresa, setDegEmpresa] = useState('');
  const [degNome, setDegNome]       = useState('');
  const [degPassword, setDegPassword] = useState('');
  const [degDays, setDegDays]       = useState('30');
  const [degLoading, setDegLoading] = useState(false);
  const [degResult, setDegResult]   = useState<{login:string; slug:string; trial_ends_at:string} | null>(null);
  const [degError, setDegError]     = useState('');

  // Edição de plano
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanPrice, setEditPlanPrice] = useState('');
  const [editPlanMaxUsers, setEditPlanMaxUsers] = useState('');
  const [editPlanTrialDays, setEditPlanTrialDays] = useState('');
  const [editPlanActive, setEditPlanActive] = useState(true);

  function openEditPlan(p: Plan) {
    setEditPlan(p);
    setEditPlanName(p.name);
    setEditPlanPrice(String(p.price_brl));
    setEditPlanMaxUsers(String(p.max_users));
    setEditPlanTrialDays(String(p.trial_days));
    setEditPlanActive(p.active);
  }

  async function savePlan() {
    if (!editPlan) return;
    await fetch(`${API}/api/superadmin/plans/${editPlan.id}`, {
      method: 'PATCH', headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editPlanName,
        price_brl: parseFloat(editPlanPrice),
        max_users: parseInt(editPlanMaxUsers),
        trial_days: parseInt(editPlanTrialDays),
        active: editPlanActive,
      })
    });
    setEditPlan(null);
    fetchAll(token);
  }

  const authHeader = { Authorization: `Bearer ${token}` };

  async function login() {
    setLoginErr('');
    const r = await fetch(`${API}/api/superadmin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_key: masterKey })
    });
    const d = await r.json();
    if (!r.ok) return setLoginErr(d.error || 'Chave inválida');
    setToken(d.token);
    fetchAll(d.token);
  }

  const fetchAll = useCallback(async (t: string) => {
    setLoading(true);
    try {
    const headers = { Authorization: `Bearer ${t}` };
    const [tr, pr, rr] = await Promise.all([
      fetch(`${API}/api/superadmin/tenants`, { headers }).then(r => r.json()),
      fetch(`${API}/api/superadmin/plans`, { headers }).then(r => r.json()),
      fetch(`${API}/api/superadmin/revenue`, { headers }).then(r => r.json()),
    ]);
    setTenants(Array.isArray(tr.tenants) ? tr.tenants : []);
    setStats(tr.stats || null);
    setPlans(Array.isArray(pr) ? pr : []);
    setRevenue(Array.isArray(rr) ? rr : []);
    setLoading(false);
  } catch (err) {
    console.error('SuperAdmin fetchAll error:', err);
    setLoading(false);
  }
  }, []);

  // Auto-carrega quando token admin é fornecido diretamente
  useEffect(() => {
    if (adminToken && !tenants.length && !loading) {
      setToken(adminToken);
      fetchAll(adminToken);
    }
  }, [adminToken, fetchAll]);

  async function grantDegustacao(tenantId: number, days: number | null) {
    await fetch(`${API}/api/superadmin/tenant/${tenantId}/degustacao`, {
      method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ days })
    });
    setSelected(null);
    fetchAll(token);
  }

  async function createFreeAccount() {
    if (!degEmail || !degEmpresa || !degPassword) return;
    setDegLoading(true); setDegError(''); setDegResult(null);
    try {
      const r = await fetch(`${API}/api/superadmin/create-free-account`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: degEmpresa, owner_email: degEmail, owner_name: degNome, password: degPassword, days: degDays || null })
      });
      const d = await r.json();
      if (!r.ok) return setDegError(d.error || 'Erro ao criar conta');
      setDegResult(d);
      setDegEmail(''); setDegEmpresa(''); setDegNome(''); setDegPassword('');
      fetchAll(token);
    } catch(e: any) { setDegError(e.message); }
    finally { setDegLoading(false); }
  }

  async function patchTenant() {
    if (!selected) return;
    const body: any = {};
    if (editStatus)    body.subscription_status = editStatus;
    if (editNotes)     body.notes = editNotes;
    if (editTrialDays) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(editTrialDays));
      body.trial_ends_at = d.toISOString();
      body.subscription_status = 'trial';
    }
    await fetch(`${API}/api/superadmin/tenant/${selected.id}`, {
      method: 'PATCH', headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    setSelected(null);
    fetchAll(token);
  }

  async function createMPPlan(planId: number) {
    const r = await fetch(`${API}/api/superadmin/mp-create-plan`, {
      method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId })
    });
    const d = await r.json();
    alert(d.mp_plan_id ? `Plano criado no MP: ${d.mp_plan_id}` : d.error);
    fetchAll(token);
  }

  const inputCls = 'w-full bg-white/5 border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green';

  // LOGIN SCREEN
  if (!token) return (
    <div className="min-h-screen bg-ds-dark-blue flex items-center justify-center p-4">
      <div className="bg-ds-navy border border-ds-border rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔐</div>
          <h1 className="text-xl font-bold text-ds-light-text">Super Admin</h1>
          <p className="text-xs text-ds-text mt-1">Acesso exclusivo — insira a chave mestre</p>
        </div>
        {loginErr && <p className="text-red-400 text-xs bg-red-500/10 rounded p-2 mb-3">{loginErr}</p>}
        <input type="password" className={inputCls} placeholder="Chave mestre (MASTER_KEY)" value={masterKey}
          onChange={e => setMasterKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        <button onClick={login} className="w-full mt-4 py-2.5 rounded-lg bg-ds-green text-ds-dark-blue font-bold text-sm hover:brightness-110">
          Entrar
        </button>
        <button onClick={onLogout} className="w-full mt-2 text-xs text-ds-text/50 hover:text-ds-text">← Voltar</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ds-dark-blue text-ds-light-text">
      {/* Header */}
      <div className="bg-ds-navy border-b border-ds-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔐</span>
          <div>
            <h1 className="font-bold text-sm">Super Admin</h1>
            <p className="text-xs text-ds-text">Painel de controle da plataforma</p>
          </div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 text-xs text-ds-text hover:text-ds-light-text px-3 py-1.5 border border-ds-border rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Voltar ao Dashboard
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, cls: 'text-ds-light-text' },
            { label: 'Trial', value: stats.trial, cls: 'text-yellow-400' },
            { label: 'Ativos', value: stats.active, cls: 'text-green-400' },
            { label: 'Expirados', value: stats.expired, cls: 'text-red-400' },
            { label: 'Manual', value: stats.manual, cls: 'text-blue-400' },
            { label: 'MRR', value: `R$${stats.mrr.toFixed(0)}`, cls: 'text-ds-green' },
          ].map(s => (
            <div key={s.label} className="bg-ds-navy border border-ds-border rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-xs text-ds-text mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 flex gap-1 border-b border-ds-border">
        {(['tenants', 'plans', 'revenue', 'degustacao'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-ds-green text-ds-green' : 'border-transparent text-ds-text hover:text-ds-light-text'}`}>
            { t === 'tenants' ? '🏢 Clientes' : t === 'plans' ? '📋 Planos' : t === 'revenue' ? '💰 Receita' : '🎁 Degustação' }
          </button>
        ))}
      </div>

      <div className="px-6 py-4">
        {loading && <p className="text-ds-text text-sm">Carregando...</p>}

        {/* TENANTS */}
        {tab === 'tenants' && !loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ds-text border-b border-ds-border">
                  <th className="pb-2 pr-4">Empresa</th>
                  <th className="pb-2 pr-4">E-mail</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Trial até</th>
                  <th className="pb-2 pr-4">Usuários</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => {
                  const cfg = STATUS_CFG[t.subscription_status] || STATUS_CFG.expired;
                  return (
                    <tr key={t.id} className="border-b border-ds-border/50 hover:bg-ds-muted/10">
                      <td className="py-3 pr-4 font-medium">{t.company_name}<span className="text-ds-text text-xs ml-1">/{t.slug}</span></td>
                      <td className="py-3 pr-4 text-ds-text">{t.owner_email}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cfg.cls}`}>{cfg.label}</span>
                      </td>
                      <td className="py-3 pr-4 text-ds-text text-xs">{t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="py-3 pr-4 text-ds-text">{t.user_count}</td>
                      <td className="py-3">
                        <button onClick={() => { setSelected(t); setEditStatus(t.subscription_status); setEditNotes(''); setEditTrialDays(''); }}
                          className="text-xs px-2 py-1 border border-ds-border rounded hover:border-ds-green/40 text-ds-text hover:text-ds-light-text">
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PLANS */}
        {tab === 'plans' && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.id} className="bg-ds-navy border border-ds-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded border ${p.active ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                    <button onClick={() => openEditPlan(p)}
                      className="text-xs px-2 py-0.5 border border-ds-border rounded hover:border-ds-green/40 text-ds-text hover:text-ds-light-text">
                      Editar
                    </button>
                  </div>
                </div>
                <div className="text-2xl font-bold text-ds-green mb-1">R$ {parseFloat(String(p.price_brl)).toFixed(2)}</div>
                <div className="text-xs text-ds-text space-y-0.5">
                  <div>Trial: {p.trial_days} dias</div>
                  <div>Max usuários: {p.max_users}</div>
                  <div>MP Plan ID: {p.mp_plan_id || <span className="text-red-400">Não configurado</span>}</div>
                </div>
                {!p.mp_plan_id && (
                  <button onClick={() => createMPPlan(p.id)}
                    className="mt-3 w-full py-1.5 text-xs rounded bg-ds-green/10 text-ds-green border border-ds-green/20 hover:bg-ds-green/20 transition-colors">
                    Criar plano no Mercado Pago
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* DEGUSTAÇÃO */}
        {tab === 'degustacao' && !loading && (
          <div className="max-w-lg space-y-6">
            <div className="bg-ds-navy border border-ds-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4">🎁 Criar nova conta de degustação</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ds-text">Empresa *</label>
                    <input value={degEmpresa} onChange={e=>setDegEmpresa(e.target.value)} className={inputCls+' mt-1'} placeholder="Nome da empresa" />
                  </div>
                  <div>
                    <label className="text-xs text-ds-text">Responsável</label>
                    <input value={degNome} onChange={e=>setDegNome(e.target.value)} className={inputCls+' mt-1'} placeholder="Nome completo" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-ds-text">E-mail * (será o usuário de login)</label>
                  <input type="email" value={degEmail} onChange={e=>setDegEmail(e.target.value)} className={inputCls+' mt-1'} placeholder="email@empresa.com" />
                </div>
                <div>
                  <label className="text-xs text-ds-text">Senha inicial *</label>
                  <input type="text" value={degPassword} onChange={e=>setDegPassword(e.target.value)} className={inputCls+' mt-1'} placeholder="Senha temporária" />
                </div>
                <div>
                  <label className="text-xs text-ds-text">Período gratuito</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {[['7','7 dias'],['15','15 dias'],['30','30 dias'],['60','60 dias'],['90','90 dias'],['','Ilimitado']].map(([v,l])=>(
                      <button key={l} onClick={()=>setDegDays(v)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${degDays===v ? 'bg-ds-green text-ds-dark-blue border-ds-green font-bold' : 'border-ds-border text-ds-text hover:border-ds-green/40'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {degError && <p className="text-red-400 text-xs bg-red-500/10 rounded p-2">{degError}</p>}
                {degResult && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs">
                    <p className="text-green-400 font-semibold mb-1">✅ Conta criada com sucesso!</p>
                    <p className="text-ds-text">Login: <span className="text-ds-light-text font-mono">{degResult.login}</span></p>
                    <p className="text-ds-text">Slug: <span className="text-ds-light-text font-mono">{degResult.slug}</span></p>
                    <p className="text-ds-text">Válido até: <span className="text-ds-light-text">{degResult.trial_ends_at === '2099-01-01T00:00:00.000Z' ? 'Ilimitado' : new Date(degResult.trial_ends_at).toLocaleDateString('pt-BR')}</span></p>
                  </div>
                )}
                <button onClick={createFreeAccount} disabled={degLoading || !degEmail || !degEmpresa || !degPassword}
                  className="w-full py-2.5 bg-ds-green text-ds-dark-blue rounded-lg font-bold text-sm hover:brightness-110 disabled:opacity-50">
                  {degLoading ? 'Criando...' : '🎁 Criar conta gratuita'}
                </button>
              </div>
            </div>

            {/* Liberar degustação em clientes existentes */}
            {tenants.length > 0 && (
              <div className="bg-ds-navy border border-ds-border rounded-xl p-5">
                <h3 className="font-semibold text-sm mb-3">⚡ Liberar degustação para cliente existente</h3>
                <div className="space-y-2">
                  {tenants.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-ds-dark-blue/50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{t.company_name}</p>
                        <p className="text-xs text-ds-text">{t.owner_email}</p>
                      </div>
                      <div className="flex gap-1">
                        {[['30','30d'],['90','90d'],['','∞']].map(([d,l])=>(
                          <button key={l} onClick={()=>grantDegustacao(t.id, d ? parseInt(d) : null)}
                            className="px-2 py-1 text-xs rounded bg-ds-green/10 text-ds-green border border-ds-green/20 hover:bg-ds-green/20 font-medium">
                            🎁 {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* REVENUE */}
        {tab === 'revenue' && !loading && (
          <div className="max-w-lg">
            <h3 className="text-sm font-semibold text-ds-text mb-3">Pagamentos aprovados por mês</h3>
            <div className="space-y-2">
              {revenue.length === 0 && <p className="text-ds-text text-sm">Nenhum pagamento registrado ainda.</p>}
              {revenue.map((r: any) => (
                <div key={r.month} className="flex items-center justify-between bg-ds-navy border border-ds-border rounded-lg px-4 py-3 text-sm">
                  <span className="text-ds-text">{new Date(r.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                  <div className="text-right">
                    <div className="font-semibold text-ds-green">R$ {parseFloat(r.total).toFixed(2)}</div>
                    <div className="text-xs text-ds-text">{r.count} pagamento(s)</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de edição de plano */}
      {editPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-ds-navy border border-ds-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-4">✏️ Editar Plano: {editPlan.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-ds-text">Nome do plano</label>
                <input value={editPlanName} onChange={e=>setEditPlanName(e.target.value)} className={inputCls+' mt-1'} />
              </div>
              <div>
                <label className="text-xs text-ds-text">Preço (R$/mês)</label>
                <input type="number" step="0.01" min="0" value={editPlanPrice} onChange={e=>setEditPlanPrice(e.target.value)} className={inputCls+' mt-1'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ds-text">Trial (dias)</label>
                  <input type="number" min="0" value={editPlanTrialDays} onChange={e=>setEditPlanTrialDays(e.target.value)} className={inputCls+' mt-1'} />
                </div>
                <div>
                  <label className="text-xs text-ds-text">Max usuários</label>
                  <input type="number" min="1" value={editPlanMaxUsers} onChange={e=>setEditPlanMaxUsers(e.target.value)} className={inputCls+' mt-1'} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editPlanActive} onChange={e=>setEditPlanActive(e.target.checked)} className="accent-green-500" />
                <span className="text-xs text-ds-text">Plano ativo (visível na landing page)</span>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditPlan(null)} className="flex-1 py-2 border border-ds-border rounded-lg text-ds-text text-sm">Cancelar</button>
              <button onClick={savePlan} className="flex-1 py-2 bg-ds-green text-ds-dark-blue rounded-lg font-bold text-sm hover:brightness-110">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição de tenant */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-ds-navy border border-ds-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold mb-4">✏️ {selected.company_name}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-ds-text">Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                  className="w-full mt-1 bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text">
                  {['trial','active','expired','cancelled','manual'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-ds-text">Estender trial (dias a partir de hoje)</label>
                <input type="number" min="1" max="365" value={editTrialDays} onChange={e => setEditTrialDays(e.target.value)}
                  className="w-full mt-1 bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text" placeholder="ex: 30" />
              </div>
              <div>
                <label className="text-xs text-ds-text">Notas internas</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  className="w-full mt-1 bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text resize-none" rows={2} />
              </div>
              {/* Degustação rápida */}
              <div>
                <label className="text-xs text-ds-text">🎁 Degustação rápida (libera acesso manual)</label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {[['7','7 dias'],['15','15 dias'],['30','30 dias'],['60','60 dias'],['90','90 dias'],['','Ilimitado']].map(([d,l])=>(
                    <button key={l} onClick={() => grantDegustacao(selected!.id, d ? parseInt(d) : null)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-ds-green/10 text-ds-green border border-ds-green/20 hover:bg-ds-green/20 font-medium transition-colors">
                      🎁 {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setSelected(null)} className="flex-1 py-2 border border-ds-border rounded-lg text-ds-text text-sm hover:border-ds-green/30">Cancelar</button>
              <button onClick={patchTenant} className="flex-1 py-2 bg-ds-green text-ds-dark-blue rounded-lg font-bold text-sm hover:brightness-110">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
