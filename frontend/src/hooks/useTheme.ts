import { useState, useEffect } from 'react';

export type AppTheme = 'default' | 'bluey' | 'bluey-dark';

const STORAGE_KEY = 'app-theme';

export function useTheme(defaultTheme: AppTheme = 'default') {
  const [theme, setTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as AppTheme) || defaultTheme;
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'default') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => {
    setTheme(prev => {
      if (prev === 'bluey') return 'bluey-dark';
      if (prev === 'bluey-dark') return 'bluey';
      // default → alterna entre bluey e bluey-dark
      return 'bluey';
    });
  };

  return { theme, setTheme, toggle };
}
