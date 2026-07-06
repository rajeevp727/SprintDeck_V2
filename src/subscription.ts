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
