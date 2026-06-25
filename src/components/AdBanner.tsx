import { useEffect } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT } from '../adsConfig';

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
