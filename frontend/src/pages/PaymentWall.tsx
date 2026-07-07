import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

interface PaymentWallProps {
  tenantSlug: string;
  companyName?: string;
  token: string;
  onLogout: () => void;
}

const PaymentWall: React.FC<PaymentWallProps> = ({ tenantSlug, companyName, token, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubscribe() {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/billing/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ payer_email: '' })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao gerar link de pagamento');
      window.open(d.init_point, '_blank');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-ds-dark-blue flex items-center justify-center p-4">
      <div className="bg-ds-navy border border-ds-border rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4 text-3xl">⏰</div>

        <h2 className="text-xl font-bold text-ds-light-text mb-2">
          Trial encerrado
        </h2>
        <p className="text-ds-text text-sm mb-1">
          {companyName && <span className="font-medium text-ds-light-text">{companyName}</span>}
        </p>
        <p className="text-ds-text text-sm mb-6">
          Seu período gratuito acabou. Assine para continuar acessando todos os dashboards.
        </p>

        {/* Plano */}
        <div className="bg-ds-dark-blue border border-ds-border rounded-xl p-5 mb-6 text-left">
          <div className="text-2xl font-bold text-ds-light-text mb-0.5">R$ 299<span className="text-sm font-normal text-ds-text">/mês</span></div>
          <p className="text-xs text-ds-text mb-3">Plano Starter · até 10 usuários</p>
          <ul className="space-y-1.5 text-sm text-ds-text">
            {['28 dashboards', 'QA Tracker', 'DevTracker + Cerimônias', 'Sync Azure DevOps', 'Suporte por e-mail'].map(i => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-ds-green">✓</span> {i}
              </li>
            ))}
          </ul>
        </div>

        {error && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg p-2 mb-3">{error}</p>}

        <button
          onClick={handleSubscribe} disabled={loading}
          className="w-full py-3 rounded-xl bg-ds-green text-ds-dark-blue font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 mb-3"
        >
          {loading ? '⏳ Gerando link...' : '💳 Assinar com Mercado Pago'}
        </button>

        <p className="text-xs text-ds-text/50 mb-4">
          Você será redirecionado para o checkout seguro do Mercado Pago.
          Após o pagamento, o acesso é liberado automaticamente.
        </p>

        <button onClick={onLogout} className="text-xs text-ds-text/50 hover:text-ds-text transition-colors">
          Sair da conta
        </button>
      </div>
    </div>
  );
};

export default PaymentWall;
