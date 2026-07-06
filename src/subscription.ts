// Subscription tiers + client-side "paid" state for SprintDeck V2 (paid product).
//
// Payment is verified server-side by the upi-verifier endpoints (see verifier.ts):
// the modal polls /api/upi/status and records the tier here once the backend
// matches the bank credit alert to the order.

export type TierId = 'pro' | 'expert' | 'master';

export interface Tier {
  id: TierId;
  name: string;
  price: number; // INR / month (illustrative — adjust freely)
  tagline: string;
  icon: string; // emoji shown on the plan card
  features: string[];
  highlight?: boolean;
}

export const tiers: Tier[] = [
  {
    id: 'pro',
    name: 'Pro',
    price: 199,
    tagline: 'For a single team',
    icon: '🚀',
    features: [
      'Connect one project-management tool',
      'Unlimited rooms · up to 20 voters',
      'Estimate & push story points back',
      'Export results (.txt / .csv / .json)',
    ],
  },
  {
    id: 'expert',
    name: 'Expert',
    price: 499,
    tagline: 'For power teams',
    icon: '⚡',
    highlight: true,
    features: [
      'Everything in Pro',
      'Connect multiple tools',
      'Session estimation analytics',
      'Priority updates',
    ],
  },
  {
    id: 'master',
    name: 'Master',
    price: 999,
    tagline: 'For organisations',
    icon: '💎',
    features: [
      'Everything in Expert',
      'All integrations (Jira, Azure DevOps) as they ship',
      'Advanced analytics',
      'Priority support',
    ],
  },
];

const subscriptionKey = 'sprintdeck.subscription';

export interface Subscription {
  tier: TierId;
  at: string;
}

export function getSubscription(): Subscription | null {
  try {
    const raw = localStorage.getItem(subscriptionKey);
    return raw ? (JSON.parse(raw) as Subscription) : null;
  } catch {
    return null;
  }
}

// A subscription is active for 30 days from purchase; after that it lapses
// (the plan popup returns for renewal).
const activeDays = 30;

export function getActiveSubscription(): Subscription | null {
  const s = getSubscription();
  if (!s) return null;
  const ageMs = Date.now() - new Date(s.at).getTime();
  return ageMs <= activeDays * 24 * 60 * 60 * 1000 ? s : null;
}

export function isSubscribed(): boolean {
  return !!getActiveSubscription();
}

export function tierPrice(id: TierId): number {
  return tiers.find((t) => t.id === id)?.price ?? 0;
}

// Flat platform fee added to every paid transaction (Free has no payment).
export const platformFee = 2;

// What a user pays to move to tier `to`: the full price (or the upgrade balance
// new − current within an active subscription), plus the platform fee.
export function amountForTier(to: TierId): number {
  const active = getActiveSubscription();
  const target = tierPrice(to);
  const base = active && target > tierPrice(active.tier) ? target - tierPrice(active.tier) : target;
  return base + platformFee;
}

export function setSubscription(tier: TierId) {
  try {
    localStorage.setItem(subscriptionKey, JSON.stringify({ tier, at: new Date().toISOString() }));
  } catch {
    /* ignore storage failures */
  }
}

// A payment can confirm minutes after the modal closes (bank email → ingest is
// async). We persist the pending order so a background watcher can keep checking
// its status — across the QR window elapsing and even across reloads — and
// activate the plan whenever it finally confirms.
const pendingKey = 'sprintdeck.pendingOrder';

export interface PendingOrder {
  orderId: string;
  tier: TierId;
  at: string;
}

export function setPendingOrder(orderId: string, tier: TierId) {
  try {
    localStorage.setItem(pendingKey, JSON.stringify({ orderId, tier, at: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}

export function getPendingOrder(): PendingOrder | null {
  try {
    const raw = localStorage.getItem(pendingKey);
    return raw ? (JSON.parse(raw) as PendingOrder) : null;
  } catch {
    return null;
  }
}

export function clearPendingOrder() {
  try {
    localStorage.removeItem(pendingKey);
  } catch {
    /* ignore */
  }
}

// Payee VPA, injected at build from the GitHub secret UPI_ID (workflow maps
// secrets.UPI_ID → VITE_UPI_ID; .env.local for local dev). Never hardcoded.
export const upiId: string = import.meta.env.VITE_UPI_ID || '';

// UPI intent link. The VPA (`pa`) is left LITERAL — several UPI apps throw a
// "temporary technical issue" if `@` is percent-encoded (%40). Only the human
// note is encoded, with %20 for spaces (encodeURIComponent), not `+`.
export function upiLink(amount: number, note: string): string {
  const parts = [
    `pa=${upiId}`,
    `pn=${encodeURIComponent('SprintDeck')}`,
    `am=${amount.toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ];
  return `upi://pay?${parts.join('&')}`;
}
