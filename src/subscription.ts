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
  features: string[];
  highlight?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: 'pro',
    name: 'Pro',
    price: 199,
    tagline: 'For a single team',
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
    features: [
      'Everything in Expert',
      'All integrations (Jira, Azure DevOps) as they ship',
      'Advanced analytics',
      'Priority support',
    ],
  },
];

const KEY = 'sprintdeck.subscription';

export interface Subscription {
  tier: TierId;
  at: string;
}

export function getSubscription(): Subscription | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Subscription) : null;
  } catch {
    return null;
  }
}

export function isSubscribed(): boolean {
  return !!getSubscription();
}

export function setSubscription(tier: TierId) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tier, at: new Date().toISOString() }));
  } catch {
    /* ignore storage failures */
  }
}

// A payment can confirm minutes after the modal closes (bank email → ingest is
// async). We persist the pending order so a background watcher can keep checking
// its status — across the QR window elapsing and even across reloads — and
// activate the plan whenever it finally confirms.
const PENDING_KEY = 'sprintdeck.pendingOrder';

export interface PendingOrder {
  orderId: string;
  tier: TierId;
  at: string;
}

export function setPendingOrder(orderId: string, tier: TierId) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ orderId, tier, at: new Date().toISOString() }));
  } catch {
    /* ignore */
  }
}

export function getPendingOrder(): PendingOrder | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingOrder) : null;
  } catch {
    return null;
  }
}

export function clearPendingOrder() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

// Payee VPA, injected at build from the GitHub secret UPI_ID (workflow maps
// secrets.UPI_ID → VITE_UPI_ID; .env.local for local dev). Never hardcoded.
export const UPI_ID: string = import.meta.env.VITE_UPI_ID || '';

// UPI intent link. The VPA (`pa`) is left LITERAL — several UPI apps throw a
// "temporary technical issue" if `@` is percent-encoded (%40). Only the human
// note is encoded, with %20 for spaces (encodeURIComponent), not `+`.
export function upiLink(amount: number, note: string): string {
  const parts = [
    `pa=${UPI_ID}`,
    `pn=${encodeURIComponent('SprintDeck')}`,
    `am=${amount.toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ];
  return `upi://pay?${parts.join('&')}`;
}
