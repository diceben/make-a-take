import { useEffect, useState } from 'react';
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemPrefersLight,
  type Theme,
} from './theme';
import './ThemeToggle.css';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    resolveTheme(readStoredTheme(), systemPrefersLight()),
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        storeTheme(next);
        setTheme(next);
      }}
    >
      {next === 'light' ? 'Light theme' : 'Dark theme'}
    </button>
  );
}
