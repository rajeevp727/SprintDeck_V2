import { useEffect } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT } from '../adsConfig';

interface Props {
  // Use a distinct AdSense ad-unit slot id per placement for best reporting;
  // falls back to ADSENSE_SLOT if not given.
  slot?: string;
  format?: string;
  className?: string;
}

// The AdSense library is loaded once via the <head> script in index.html.
// A unit renders only when both a publisher id and a slot id are configured.
export default function AdBanner({ slot = ADSENSE_SLOT, format = 'auto', className = 'ad-slot' }: Props) {
  const active = ADSENSE_CLIENT.length > 0 && slot.length > 0;

  useEffect(() => {
    if (!active) return;
    try {
      const w = window as unknown as { adsbygoogle?: Record<string, unknown>[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      /* AdSense not ready yet — ignored */
    }
  }, [active]);

  if (!active) return null;

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
