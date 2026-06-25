import { useState } from 'react';
import AdBanner from './AdBanner';
import { adsEnabled } from '../adsConfig';

// Dismissible sticky footer ad — highest-viewability placement, and
// AdSense-compliant because the user can close it.
export default function StickyAd() {
  const [closed, setClosed] = useState(false);
  if (!adsEnabled || closed) return null;

  return (
    <div className="ad-sticky">
      <button className="ad-sticky-close" onClick={() => setClosed(true)} aria-label="Close ad">
        ×
      </button>
      <AdBanner className="ad-sticky-inner" format="horizontal" />
    </div>
  );
}
