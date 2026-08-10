import { useEffect } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT } from '../lib/adsConfig';

interface Props {
  
  
  slot?: string;
  format?: string;
  className?: string;
}

export default function AdBanner({ slot = ADSENSE_SLOT, format = 'auto', className = 'ad-slot' }: Props) {
  const active = ADSENSE_CLIENT.length > 0 && slot.length > 0;

  useEffect(() => {
    if (!active) return;
    try {
      const w = window as unknown as { adsbygoogle?: Record<string, unknown>[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch { void 0; }
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
