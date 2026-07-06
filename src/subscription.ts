// Subscription tiers + client-side state for SprintDeck V2 (paid product).
//
// There is no auth/backend payment confirmation (UPI has no webhook), so "paid"
// is recorded locally after the moderator confirms — honour-system for now.

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

// UPI VPA injected at build from the GitHub secret UPI_ID (workflow maps it to
// VITE_UPI_ID; .env.local for local dev). Never hardcoded in the repo.
export const UPI_ID: string = import.meta.env.VITE_UPI_ID || '';

// UPI deep link for a given amount; scanning/opening it pays the VPA.
export function upiLink(amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: 'SprintDeck',
    cu: 'INR',
    am: String(amount),
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}
