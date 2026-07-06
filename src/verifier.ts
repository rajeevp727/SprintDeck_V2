// Client for the standalone upi-verifier service (PSP-free UPI verification).
//
// Base URL comes from VITE_VERIFIER_URL (e.g. http://localhost:7073/api in dev,
// the deployed Function App's /api in prod). When it's unset the payment flow
// falls back to a display-only QR (no auto-activation) — see SubscriptionModal.

const BASE = import.meta.env.VITE_VERIFIER_URL || '';

export const verifierEnabled = !!BASE;

export interface PaymentOrder {
  orderId: string;
  payAmount: number; // exact rupee amount to pay (unique per pending order)
  vpa: string;
  upiLink: string; // upi://pay?… encoding payAmount — render this as the QR
}

export type PayStatus = 'pending' | 'confirmed' | 'expired';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// Create a pending order for a plan; returns the exact amount + UPI link to pay.
export function createOrder(tier: string, baseAmount: number): Promise<PaymentOrder> {
  return fetch(`${BASE}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, baseAmount }),
  }).then((r) => json<PaymentOrder>(r));
}

// Poll whether the order has been paid (matched by the verifier's ingest).
export function getStatus(orderId: string): Promise<{ status: PayStatus }> {
  return fetch(`${BASE}/upi/status?orderId=${encodeURIComponent(orderId)}`, {
    cache: 'no-store',
  }).then((r) => json<{ status: PayStatus }>(r));
}
