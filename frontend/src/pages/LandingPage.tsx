import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const FEATURES = [
  { icon: '📈', title: 'Performance em tempo real', desc: '28 dashboards prontos: cycle time, throughput, DORA, Monte Carlo e muito mais.' },
  { icon: '🧪', title: 'QA Tracker', desc: 'Controle de testes por versão entregue, evidências, status por responsável.' },
  { icon: '🔀', title: 'Pull Requests & DORA', desc: 'Métricas DevOps adaptadas: deploy frequency, lead time, change failure rate, MTTR.' },
  { icon: '🎲', title: 'Monte Carlo', desc: 'Previsão probabilística de prazo baseada em histórico real de throughput.' },
  { icon: '🗓️', title: 'Ritos & Cerimônias', desc: 'Registro e acompanhamento de plannings, reviews e retrospectivas.' },
  { icon: '🗂️', title: 'DevTracker', desc: 'Gestão de alocação de desenvolvedores por projeto e capacidade.' },
];

interface LandingPageProps {
  onStartTrial: () => void;
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTrial, onLogin }) => {
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-screen bg-ds-dark-blue text-ds-light-text font-sans">
      {/* NAV */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-ds-border">
        <div className="flex items-center gap-3">
          {/* Ícone azul Fluxometria — setas de fluxo */}
          <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="#1A6EBD" opacity="0.15"/>
            <circle cx="24" cy="24" r="22" stroke="#1A6EBD" strokeWidth="2"/>
            <path d="M12 20 Q24 10 36 20" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M30 16 L36 20 L30 24" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M36 28 Q24 38 12 28" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M18 32 L12 28 L18 24" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="text-xl font-bold tracking-wide">
            <span className="text-ds-light-text">FLUXO</span><span style={{color:'#4BA3E3'}}>METRIA</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onLogin} className="text-sm text-ds-text hover:text-ds-light-text transition-colors">Entrar</button>
          <button onClick={() => window.location.href = '/login'} className="text-sm text-ds-text hover:text-ds-light-text transition-colors hidden" aria-hidden />
          <button onClick={onStartTrial} className="px-4 py-2 rounded-lg bg-ds-green text-ds-dark-blue text-sm font-bold hover:brightness-110 transition-all">
            Começar grátis
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-5xl mx-auto px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-ds-green/10 text-ds-green text-xs font-semibold px-4 py-1.5 rounded-full border border-ds-green/20 mb-6">
          ✦ 30 dias grátis, sem cartão de crédito
        </div>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
          Inteligência operacional para<br/>
          <span className="text-ds-green">equipes Azure DevOps</span>
        </h1>
        <p className="text-lg text-ds-text max-w-2xl mx-auto mb-10">
          Transforme dados brutos do Azure DevOps em dashboards acionáveis. Cycle time, DORA, Monte Carlo,
          QA Tracker e 28 módulos prontos para o seu time.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-72 px-4 py-3 rounded-lg bg-ds-navy border border-ds-border text-ds-light-text placeholder:text-ds-text/50 focus:outline-none focus:border-ds-green text-sm"
          />
          <button
            onClick={onStartTrial}
            className="px-6 py-3 rounded-lg bg-ds-green text-ds-dark-blue font-bold text-sm hover:brightness-110 transition-all whitespace-nowrap"
          >
            Iniciar trial gratuito →
          </button>
        </div>
        <p className="text-xs text-ds-text/50 mt-3">30 dias grátis · Cancele quando quiser · Dados isolados por empresa</p>
      </section>

      {/* FEATURES */}
      <section className="max-w-5xl mx-auto px-8 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Tudo que seu time precisa</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-ds-navy border border-ds-border rounded-xl p-5 hover:border-ds-green/30 transition-colors">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-ds-light-text font-semibold mb-1">{f.title}</h3>
              <p className="text-ds-text text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="max-w-lg mx-auto px-8 py-16 text-center">
        <h2 className="text-2xl font-bold mb-3">Plano simples</h2>
        <p className="text-ds-text mb-8">Sem surpresas. Um plano com tudo incluso.</p>
        <div className="bg-ds-navy border-2 border-ds-green/40 rounded-2xl p-8 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-ds-green text-ds-dark-blue text-xs font-bold px-4 py-1 rounded-full">
            30 dias grátis
          </div>
          <div className="text-4xl font-bold text-ds-light-text mb-1">
            R$ 299<span className="text-lg font-normal text-ds-text">/mês</span>
          </div>
          <p className="text-ds-text text-sm mb-6">por empresa · até 10 usuários</p>
          <ul className="text-left space-y-2 text-sm text-ds-text mb-8">
            {['28 dashboards completos', 'QA Tracker', 'DevTracker + Cerimônias', 'Dados do Azure DevOps em tempo real', 'Suporte por e-mail', 'Acesso a todas as atualizações'].map(item => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-ds-green font-bold">✓</span> {item}
              </li>
            ))}
          </ul>
          <button
            onClick={onStartTrial}
            className="w-full py-3 rounded-xl bg-ds-green text-ds-dark-blue font-bold hover:brightness-110 transition-all"
          >
            Começar 30 dias grátis
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-ds-border px-8 py-6 text-center text-ds-text/50 text-xs">
        © {new Date().getFullYear()} Fluxometria
      </footer>
    </div>
  );
};

export default LandingPage;
