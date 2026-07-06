// Theme handling. Default is "system" (follows the OS via a CSS media query);
// the user can force light or dark, which is persisted and applied via a
// data-theme attribute on <html> that overrides the media query.
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'sprintdeck-theme';

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  if (t === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, t);
  applyTheme(t);
}

// Apply the saved (or system) theme on startup, before first paint.
export function initTheme() {
  applyTheme(getTheme());
}
