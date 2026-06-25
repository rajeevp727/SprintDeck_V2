import { useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// Google AdSense configuration.
// 1. Create an AdSense account, get your site approved (needs your own domain
//    + a privacy policy page), then create a Display ad unit.
// 2. Paste your publisher ID and ad-slot ID below.
// Leave ADSENSE_CLIENT empty to keep ads OFF — nothing loads, nothing renders.
// ──────────────────────────────────────────────────────────────────────────
const ADSENSE_CLIENT: string = ''; // e.g. 'ca-pub-1234567890123456'
const ADSENSE_SLOT: string = ''; // e.g. '1234567890'

export default function AdBanner() {
  useEffect(() => {
    if (!ADSENSE_CLIENT) return;

    // Load the AdSense script once.
    const scriptId = 'adsbygoogle-js';
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.head.appendChild(s);
    }

    // Request an ad for this slot.
    try {
      const w = window as unknown as { adsbygoogle?: Record<string, unknown>[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      /* AdSense not ready yet — ignored */
    }
  }, []);

  if (!ADSENSE_CLIENT) return null;

  return (
    <div className="ad-slot">
      <span className="ad-label">Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
