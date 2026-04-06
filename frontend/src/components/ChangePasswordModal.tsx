import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ChangePasswordModalProps {
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'https://dsmetrics.online';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('A nova senha e a confirmação não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao alterar senha.');
        return;
      }

      setSuccess(true);
      setTimeout(() => onClose(), 1800);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const EyeIcon = ({ show }: { show: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {show ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L6.59 6.59m7.532 7.532L16.41 17.41M3 3l18 18" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      )}
    </svg>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-ds-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-ds-green/10 p-2 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-ds-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-ds-light-text font-bold text-lg">Alterar Senha</h2>
          </div>
          <button
            onClick={onClose}
            className="text-ds-text hover:text-ds-light-text text-2xl font-bold leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="bg-green-500/20 text-green-400 rounded-full p-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-ds-light-text font-semibold">Senha alterada com sucesso!</p>
            </div>
          ) : (
            <>
              {/* Senha atual */}
              <div>
                <label className="block text-xs text-ds-text mb-1 font-medium">Senha Atual</label>
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 pr-10 text-ds-light-text text-sm focus:outline-none focus:border-ds-green transition-colors"
                    placeholder="Digite sua senha atual"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text hover:text-ds-light-text"
                  >
                    <EyeIcon show={showCurrent} />
                  </button>
                </div>
              </div>

              {/* Nova senha */}
              <div>
                <label className="block text-xs text-ds-text mb-1 font-medium">Nova Senha</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 pr-10 text-ds-light-text text-sm focus:outline-none focus:border-ds-green transition-colors"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text hover:text-ds-light-text"
                  >
                    <EyeIcon show={showNew} />
                  </button>
                </div>
              </div>

              {/* Confirmar nova senha */}
              <div>
                <label className="block text-xs text-ds-text mb-1 font-medium">Confirmar Nova Senha</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={`w-full bg-ds-dark-blue border rounded-lg px-3 py-2 pr-10 text-ds-light-text text-sm focus:outline-none transition-colors ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-500 focus:border-red-400'
                        : 'border-ds-border focus:border-ds-green'
                    }`}
                    placeholder="Repita a nova senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text hover:text-ds-light-text"
                  >
                    <EyeIcon show={showConfirm} />
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-red-400 text-xs mt-1">As senhas não coincidem.</p>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 px-4 rounded-lg bg-ds-border text-ds-light-text hover:bg-ds-border/70 transition-colors text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 px-4 rounded-lg bg-ds-green text-ds-dark font-semibold hover:bg-ds-green/80 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Salvando...
                    </>
                  ) : 'Salvar Senha'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
