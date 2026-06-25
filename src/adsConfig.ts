// ──────────────────────────────────────────────────────────────────────────
// Google AdSense configuration — fill these in to switch ads ON.
// 1. Create an AdSense account, get your site approved (needs your own domain
//    + a privacy policy page), then create Display / Anchor ad units.
// 2. Paste your publisher ID and ad-slot id(s) below.
// Leave ADSENSE_CLIENT empty to keep every ad OFF (nothing loads or renders).
// ──────────────────────────────────────────────────────────────────────────
export const ADSENSE_CLIENT: string = ''; // e.g. 'ca-pub-1234567890123456'
export const ADSENSE_SLOT: string = ''; // default slot, e.g. '1234567890'

export const adsEnabled = ADSENSE_CLIENT.length > 0;
