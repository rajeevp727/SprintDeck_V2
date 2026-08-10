import { getConsent } from './consent';

export const ADSENSE_CLIENT: string = 'ca-pub-7462453330857711';
export const ADSENSE_SLOT: string = '';

let scriptLoaded = false;

export function adsConsentGranted(): boolean {
  return getConsent() === 'accepted';
}

export function adsEnabled(): boolean {
  return adsConsentGranted() && ADSENSE_CLIENT.length > 0 && ADSENSE_SLOT.length > 0;
}

export function loadAdSenseScript(): void {
  if (!adsConsentGranted() || !ADSENSE_CLIENT || scriptLoaded) return;
  if (document.querySelector('script[data-adsense]')) {
    scriptLoaded = true;
    return;
  }
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  s.crossOrigin = 'anonymous';
  s.dataset.adsense = '1';
  document.head.appendChild(s);
  scriptLoaded = true;
}
