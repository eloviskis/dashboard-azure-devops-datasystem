import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Branding {
  company_name: string;
  logo_url: string;
  footer_text: string;
  cover_url: string;
}

const DEFAULT_BRANDING: Branding = {
  company_name: 'Fluxometria',
  logo_url: '',
  footer_text: '',
  cover_url: '',
};

async function fetchBranding(): Promise<Branding> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/public/branding`);
    if (!res.ok) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...(await res.json()) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function generateCaptcha() {
  const ops = ['+', '-', '×'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  switch (op) {
    case '+':
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
      answer = a + b;
      break;
    case '-':
      a = Math.floor(Math.random() * 20) + 5;
      b = Math.floor(Math.random() * a) + 1;
      answer = a - b;
      break;
    case '×':
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * 10) + 1;
      answer = a * b;
      break;
  }
  return { question: `${a} ${op} ${b} = ?`, answer };
}

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const { login } = useAuth();

  useEffect(() => { fetchBranding().then(setBranding); }, []);

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
  }, []);

  // Renovar captcha após cada tentativa falha
  useEffect(() => {
    if (failCount > 0) refreshCaptcha();
  }, [failCount, refreshCaptcha]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validar captcha
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      setError('Resposta do captcha incorreta');
      setFailCount(f => f + 1);
      return;
    }

    setLoading(true);

    try {
      const success = await login(username, password);
      if (!success) {
        setError('Usuário ou senha inválidos');
        setFailCount(f => f + 1);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
      setFailCount(f => f + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex login-bg">
      <div className="flex min-h-screen w-full">
        {/* Left side - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8">
          <div className="max-w-md w-full">
            {/* Logo/Header */}
            <div className="text-center mb-8">
              {branding.logo_url
                ? <img src={branding.logo_url} alt={branding.company_name} className="mx-auto mb-4 h-20 object-contain" />
                : <div className="mx-auto mb-4 flex flex-col items-center justify-center">
                    <svg width="56" height="56" viewBox="0 0 48 48" fill="none" className="mb-2">
                      <circle cx="24" cy="24" r="22" fill="#1A6EBD" opacity="0.15"/>
                      <circle cx="24" cy="24" r="22" stroke="#1A6EBD" strokeWidth="2"/>
                      <path d="M12 20 Q24 10 36 20" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                      <path d="M30 16 L36 20 L30 24" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      <path d="M36 28 Q24 38 12 28" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                      <path d="M18 32 L12 28 L18 24" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                    <span className="text-3xl font-bold text-ds-green tracking-tight">{branding.company_name}</span>
                  </div>
              }
              <p className="text-ds-text mt-2">Azure DevOps Analytics</p>
            </div>

            {/* Login Form */}
            <div className="login-card rounded-2xl shadow-2xl p-8">
              <h2 className="text-xl font-semibold text-white mb-6 text-center">Entrar na sua conta</h2>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-ds-light-text mb-2">
                    Usuário
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="login-input w-full px-4 py-3 rounded-lg"
                    placeholder="Digite seu usuário"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-ds-light-text mb-2">
                    Senha
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="login-input w-full px-4 py-3 rounded-lg"
                    placeholder="Digite sua senha"
                    required
                    disabled={loading}
                  />
                </div>

                {/* Captcha */}
                <div>
                  <label htmlFor="captcha" className="block text-sm font-medium text-ds-light-text mb-2">
                    Verificação de Segurança
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-shrink-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg px-4 py-3 select-none" style={{ fontFamily: 'monospace', letterSpacing: '2px' }}>
                      <span className="text-blue-300 text-lg font-bold">{captcha.question}</span>
                    </div>
                    <input
                      id="captcha"
                      type="text"
                      inputMode="numeric"
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value.replace(/[^0-9-]/g, ''))}
                      className="login-input w-24 px-4 py-3 rounded-lg text-center"
                      placeholder="?"
                      required
                      disabled={loading}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={refreshCaptcha}
                      className="text-ds-muted hover:text-blue-400 transition-colors p-2"
                      title="Novo captcha"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                    <p className="text-red-400 text-sm text-center">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn w-full py-3 px-4 shadow-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Entrando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </form>
            </div>

            {/* Solicitar acesso */}
            <p className="text-center text-sm mt-4 text-ds-text/60">
              Entre em contato com o administrador para solicitar acesso.
            </p>

            {/* Footer */}
            <p className="text-center text-ds-muted text-sm mt-6">
              {branding.footer_text || `© ${new Date().getFullYear()} ${branding.company_name}. Todos os direitos reservados.`}
            </p>
          </div>
        </div>

        {/* Right side - Image */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden">
          <img
            src={branding.cover_url || '/imagem-fluxometria.png'}
            alt={branding.company_name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-ds-dark-blue/20 to-ds-dark-blue/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-ds-dark-blue/50 via-transparent to-ds-dark-blue/30" />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
