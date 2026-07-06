import { useState } from 'react';
import { getTheme, setTheme } from '../theme';

// The effective theme right now: an explicit choice if made, else whatever the
// OS prefers (the default is still "system" until the user toggles).
function effectiveTheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Binary Light ↔ Dark toggle (no System option in the button). Shows an SVG of
// what you'll switch to: a sun while dark, a moon while light.
const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

export default function ThemeToggle() {
  const [mode, setMode] = useState<'light' | 'dark'>(effectiveTheme());

  function toggle() {
    const next = mode === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setMode(next);
  }

  return (
    <button
      className="ghost theme-toggle"
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      onClick={toggle}
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
