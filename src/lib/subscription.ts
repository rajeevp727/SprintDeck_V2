// Subscription tiers + server-verified "paid" state for SprintDeck V2.
//
// The subscription is NOT stored client-side as a tier (that was editable in
// localStorage). The browser keeps only the confirmed order id; the tier is
// fetched from /api/subscription, which validates it against the payment record
// in Cosmos. See refreshSubscription() / useSubscription() below.

import { useEffect, useState } from 'react';
import { getServerSubscription } from './verifier';

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

export interface Subscription {
  tier: TierId;
  at: string;
}

// ── Server-verified subscription ────────────────────────────────────────────
// The authoritative subscription lives in Cosmos (the confirmed payment order).
// The browser stores only a REFERENCE — the confirmed order's id — never the
// tier, so editing localStorage can't grant a plan. isSubscribed() /
// getActiveSubscription() read an in-memory cache populated from the server via
// refreshSubscription(); components use the useSubscription() hook to stay in sync.

const subRefKey = 'sprintdeck.subscription'; // stores { orderId }

function getOrderRef(): string | null {
  try {
    const raw = localStorage.getItem(subRefKey);
    const ref = raw ? JSON.parse(raw) : null;
    return ref && typeof ref.orderId === 'string' ? ref.orderId : null;
  } catch {
    return null;
  }
}

// The confirmed order id backing this browser's subscription (passed to the
// server so it can verify PRO+ from Cosmos before, e.g., starting a retro).
export function getSubscriptionRef(): string | null {
  return getOrderRef();
}

// Remember which confirmed order backs this browser's subscription.
export function setSubscriptionRef(orderId: string) {
  try {
    localStorage.setItem(subRefKey, JSON.stringify({ orderId }));
  } catch {
    /* ignore storage failures */
  }
}

let cachedSub: Subscription | null = null;
let fetched = false;
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

// Ask the server whether the stored order still grants an active plan, and
// refresh the in-memory cache. Safe to call often.
export async function refreshSubscription(): Promise<Subscription | null> {
  const orderId = getOrderRef();
  if (!orderId) {
    cachedSub = null;
    fetched = true;
    notify();
    return null;
  }
  try {
    const res = await getServerSubscription(orderId);
    cachedSub = res.active && res.tier ? { tier: res.tier as TierId, at: res.at ?? new Date().toISOString() } : null;
  } catch {
    /* transient network error — keep the last known cache */
  }
  fetched = true;
  notify();
  return cachedSub;
}

export function getActiveSubscription(): Subscription | null {
  return cachedSub;
}

export function isSubscribed(): boolean {
  return cachedSub != null;
}

// React hook: refresh from the server on mount and re-render on changes.
// `loaded` flips true once the first server check completes.
export function useSubscription(): { subscription: Subscription | null; subscribed: boolean; loaded: boolean } {
  const [, bump] = useState(0);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    listeners.add(rerender);
    refreshSubscription();
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return { subscription: cachedSub, subscribed: cachedSub != null, loaded: fetched };
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
