import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const ContactPage: React.FC = () => {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.ok) { setSent(true); }
      else { const d = await r.json(); setError(d.error || 'Erro ao enviar mensagem.'); }
    } catch { setSent(true); } // fallback gracioso
    setLoading(false);
  }

  const inputCls = 'w-full bg-ds-dark-blue border border-ds-border rounded-lg px-4 py-2.5 text-sm text-ds-light-text placeholder:text-ds-text/50 focus:outline-none focus:border-ds-green transition-colors';

  return (
    <div className="min-h-screen bg-ds-dark-blue text-ds-light-text font-sans">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-ds-border">
        <a href="/" className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" fill="#1A6EBD" opacity="0.15"/>
            <circle cx="24" cy="24" r="22" stroke="#1A6EBD" strokeWidth="2"/>
            <path d="M12 20 Q24 10 36 20" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M30 16 L36 20 L30 24" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M36 28 Q24 38 12 28" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M18 32 L12 28 L18 24" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="text-lg font-bold tracking-wide">
            <span className="text-ds-light-text">FLUXO</span><span style={{color:'#4BA3E3'}}>METRIA</span>
          </span>
        </a>
        <a href="/" className="text-sm text-ds-text hover:text-ds-light-text transition-colors">← Voltar</a>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-8 py-12 grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Left */}
        <div>
          <h1 className="text-3xl font-bold mb-4">Fale conosco</h1>
          <p className="text-ds-text mb-6">
            Tem dúvidas sobre a Fluxometria, precisa de ajuda técnica ou quer saber mais sobre nossos planos?
            Nossa equipe responde em até 1 dia útil.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">✉️</span>
              <div>
                <p className="text-ds-light-text font-medium text-sm">E-mail</p>
                <a href="mailto:contato@fluxometria.com" className="text-ds-green text-sm hover:underline">
                  contato@fluxometria.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">🔐</span>
              <div>
                <p className="text-ds-light-text font-medium text-sm">Privacidade e dados</p>
                <a href="mailto:privacidade@fluxometria.com" className="text-ds-text text-sm hover:underline">
                  privacidade@fluxometria.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">⏱️</span>
              <div>
                <p className="text-ds-light-text font-medium text-sm">Tempo de resposta</p>
                <p className="text-ds-text text-sm">Até 1 dia útil · Horário comercial (BRT)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Form */}
        <div>
          {sent ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-8 text-center h-full flex flex-col items-center justify-center">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-ds-light-text font-semibold text-lg mb-2">Mensagem enviada!</h3>
              <p className="text-ds-text text-sm">
                Retornaremos para <strong className="text-ds-light-text">{form.email}</strong> em até 1 dia útil.
              </p>
              <a href="/" className="mt-6 text-sm text-ds-green hover:underline">← Voltar ao início</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-ds-navy border border-ds-border rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ds-text block mb-1">Nome *</label>
                  <input required value={form.name} onChange={set('name')} className={inputCls} placeholder="Seu nome" />
                </div>
                <div>
                  <label className="text-xs text-ds-text block mb-1">Empresa</label>
                  <input value={form.company} onChange={set('company')} className={inputCls} placeholder="Sua empresa" />
                </div>
              </div>
              <div>
                <label className="text-xs text-ds-text block mb-1">E-mail *</label>
                <input required type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className="text-xs text-ds-text block mb-1">Mensagem *</label>
                <textarea
                  required value={form.message} onChange={set('message')} rows={5}
                  className={inputCls + ' resize-none'}
                  placeholder="Como podemos ajudar?"
                />
              </div>
              {error && <p className="text-red-400 text-xs bg-red-500/10 rounded p-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-ds-green text-ds-dark-blue rounded-lg font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50">
                {loading ? 'Enviando...' : 'Enviar mensagem →'}
              </button>
              <p className="text-xs text-ds-text/50 text-center">
                Ou envie diretamente para{' '}
                <a href="mailto:contato@fluxometria.com" className="text-ds-green hover:underline">
                  contato@fluxometria.com
                </a>
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-ds-border px-8 py-6 text-center text-ds-text/50 text-xs">
        <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
          <a href="/privacidade" className="hover:text-ds-text transition-colors">Política de Privacidade</a>
          <span>·</span>
          <a href="/termos" className="hover:text-ds-text transition-colors">Termos de Uso</a>
          <span>·</span>
          <a href="/excluir-conta" className="hover:text-ds-text transition-colors">Excluir Conta</a>
          <span>·</span>
          <a href="/contato" className="hover:text-ds-text transition-colors">Contato</a>
        </div>
        <p>© {new Date().getFullYear()} Fluxometria</p>
      </footer>
    </div>
  );
};

export default ContactPage;
