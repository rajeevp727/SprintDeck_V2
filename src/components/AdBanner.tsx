import { useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// Google AdSense configuration.
// 1. Create an AdSense account, get your site approved (needs your own domain
//    + a privacy policy page), then create a Display ad unit.
// 2. Paste your publisher ID and ad-slot ID below.
// Leave ADSENSE_CLIENT empty to keep ads OFF — nothing loads, nothing renders.
// ──────────────────────────────────────────────────────────────────────────
const ADSENSE_CLIENT: string = ''; // e.g. 'ca-pub-1234567890123456'
const ADSENSE_SLOT: string = ''; // default slot, e.g. '1234567890'

interface Props {
  // Use a distinct AdSense ad-unit slot id per placement for best reporting;
  // falls back to ADSENSE_SLOT if not given.
  slot?: string;
  format?: string;
  className?: string;
}

export default function AdBanner({ slot = ADSENSE_SLOT, format = 'auto', className = 'ad-slot' }: Props) {
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
    <div className={className}>
      <span className="ad-label">Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
