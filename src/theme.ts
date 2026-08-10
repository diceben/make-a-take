export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'mat.theme';

const isTheme = (value: unknown): value is Theme => value === 'dark' || value === 'light';

/**
 * Decides which theme to show.
 *
 * An explicit choice always wins. Without one we follow the system, and when the
 * system asks for nothing in particular we show the dark "studio" theme — that is
 * the look the app is designed around.
 *
 * The inline script in index.html repeats this logic to avoid a flash of the
 * wrong theme on first paint. Change one, change the other.
 */
export function resolveTheme(stored: string | null, systemPrefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemPrefersLight ? 'light' : 'dark';
}

export function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Private browsing modes can throw on access. A missing preference is fine.
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not being able to remember the choice is not worth breaking the page over.
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

export function systemPrefersLight(): boolean {
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}
