const consentKey = 'sprintdeck.cookieConsent';
const consentAtKey = 'sprintdeck.cookieConsentAt';

export type ConsentChoice = 'accepted' | 'rejected';

const listeners = new Set<() => void>();

export function getConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(consentKey);
    if (v === 'accepted' || v === 'rejected') return v;
  } catch { void 0; }
  return null;
}

export function getConsentAt(): string | null {
  try {
    return localStorage.getItem(consentAtKey);
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(consentKey, choice);
    localStorage.setItem(consentAtKey, new Date().toISOString());
  } catch { void 0; }
  for (const l of listeners) l();
}

export function onConsentChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
