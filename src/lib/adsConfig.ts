// ──────────────────────────────────────────────────────────────────────────
// Google AdSense configuration.
// The publisher id (ca-pub-…) is PUBLIC — it ships in the page and the <head>
// script in index.html. The site-verification script lives in index.html.
// Ad UNITS only render once a slot id is set here (you create ad units in the
// AdSense dashboard AFTER approval, then paste the slot id(s)).
// ──────────────────────────────────────────────────────────────────────────
export const ADSENSE_CLIENT: string = 'ca-pub-7462453330857711';
export const ADSENSE_SLOT: string = ''; // e.g. '1234567890' — fill after approval

// Ad units render only when both a client and a slot are configured.
export const adsEnabled = ADSENSE_CLIENT.length > 0 && ADSENSE_SLOT.length > 0;
