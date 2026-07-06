import { useState } from 'react';
import { getTheme, setTheme } from '../theme';

// The effective theme right now: an explicit choice if made, else whatever the
// OS prefers (the default is still "system" until the user toggles).
function effectiveTheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Binary Light ↔ Dark toggle (no System option in the button). The icon shows
// what you'll switch to: ☀️ while dark, 🌙 while light.
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
      {mode === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
