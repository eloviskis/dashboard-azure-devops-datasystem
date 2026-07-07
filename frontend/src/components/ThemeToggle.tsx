import React from 'react';
import type { AppTheme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: AppTheme;
  onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isLight = theme === 'bluey';
  const isBluey = theme === 'bluey' || theme === 'bluey-dark';

  if (!isBluey) return null; // só exibe para clientes com tema Bluey

  return (
    <button
      onClick={onToggle}
      title={isLight ? 'Mudar para modo noturno' : 'Mudar para modo claro'}
      className="relative w-14 h-7 rounded-full transition-all duration-300 flex items-center px-1 focus:outline-none focus:ring-2 focus:ring-ds-green/40"
      style={{
        background: isLight
          ? 'linear-gradient(135deg, #87CEEB, #4B9AD4)'   /* céu claro */
          : 'linear-gradient(135deg, #071829, #1C4068)',   /* céu noturno */
      }}
      aria-label="Alternar tema"
    >
      {/* Trilha decorativa: nuvem ↔ estrelas */}
      <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
        {isLight ? (
          /* estrelinhas escondidas no modo claro */
          <>
            <span className="absolute top-1 right-2 text-[6px] opacity-30">✦</span>
            <span className="absolute bottom-1 right-4 text-[5px] opacity-20">✦</span>
          </>
        ) : (
          /* estrelas visíveis no modo noturno */
          <>
            <span className="absolute top-1 left-2 text-[6px] text-white opacity-70">✦</span>
            <span className="absolute bottom-1 left-4 text-[5px] text-white opacity-50">✦</span>
            <span className="absolute top-1.5 right-3 text-[4px] text-white opacity-60">✦</span>
          </>
        )}
      </span>

      {/* Bolinha — sol ☀️ ou lua 🌙 */}
      <span
        className="relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-md transition-all duration-300"
        style={{
          transform: isLight ? 'translateX(0)' : 'translateX(28px)',
          background: isLight
            ? 'linear-gradient(135deg, #FFE066, #FFC107)'   /* sol amarelo */
            : 'linear-gradient(135deg, #D4EBF9, #A8CEEA)',  /* lua prateada */
        }}
      >
        {isLight ? '☀' : '🌙'}
      </span>
    </button>
  );
};

export default ThemeToggle;
