

import { useEffect, useState } from 'react';
import { getServerSubscription } from './verifier';

export type TierId = 'pro' | 'expert' | 'master';

export interface Tier {
  id: TierId;
  name: string;
  price: number; 
  tagline: string;
  icon: string; 
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

const subRefKey = 'sprintdeck.subscription'; 

function getOrderRef(): string | null {
  try {
    const raw = localStorage.getItem(subRefKey);
    const ref = raw ? JSON.parse(raw) : null;
    return ref && typeof ref.orderId === 'string' ? ref.orderId : null;
  } catch {
    return null;
  }
}

export function getSubscriptionRef(): string | null {
  return getOrderRef();
}

export function setSubscriptionRef(orderId: string) {
  try {
    localStorage.setItem(subRefKey, JSON.stringify({ orderId }));
  } catch { void 0; }
}

let cachedSub: Subscription | null = null;
let fetched = false;
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}

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
  } catch { void 0; }
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

export const platformFee = 2;

export function amountForTier(to: TierId): number {
  const active = getActiveSubscription();
  const target = tierPrice(to);
  const base = active && target > tierPrice(active.tier) ? target - tierPrice(active.tier) : target;
  return base + platformFee;
}

const pendingKey = 'sprintdeck.pendingOrder';

export interface PendingOrder {
  orderId: string;
  tier: TierId;
  at: string;
}

export function setPendingOrder(orderId: string, tier: TierId) {
  try {
    localStorage.setItem(pendingKey, JSON.stringify({ orderId, tier, at: new Date().toISOString() }));
  } catch { void 0; }
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
  } catch { void 0; }
}

export const upiId: string = import.meta.env.VITE_UPI_ID || '';

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
