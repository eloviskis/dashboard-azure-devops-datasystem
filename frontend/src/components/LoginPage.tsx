import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
  const { login } = useAuth();

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
              <img src="/logo-datasystem.png" alt="Data System" className="mx-auto mb-4 h-20 object-contain" />
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
            <p className="text-center text-sm mt-4">
              <a
                href="mailto:eloi.santaroza@datasystem.com.br?subject=Solicitação de novo usuário - Performance Dashboard&body=Olá, gostaria de solicitar a criação de um novo usuário para o Performance Dashboard.%0A%0ANome: %0AE-mail: %0AEquipe: "
                className="text-blue-400 hover:text-blue-300 transition-colors underline"
              >
                Solicitar acesso
              </a>
            </p>

            {/* Footer */}
            <p className="text-center text-ds-muted text-sm mt-6">
              © 2026 Data System. Todos os direitos reservados.
            </p>
          </div>
        </div>

        {/* Right side - Image */}
        <div className="hidden lg:flex w-1/2 relative overflow-hidden">
          <img src="/fotofachada.jpg" alt="Data System - Fachada" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-ds-dark-blue/20 to-ds-dark-blue/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-ds-dark-blue/50 via-transparent to-ds-dark-blue/30" />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
