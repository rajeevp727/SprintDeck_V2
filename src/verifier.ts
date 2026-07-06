// Client for the UPI verification endpoints, served same-origin from the SWA
// api (/api/order, /api/upi/status). PSP-free: the backend matches a bank
// credit alert to a pending order by its unique amount.

const apiBase = '/api';

export interface PaymentOrder {
  orderId: string;
  payAmount: number; // rupee amount to pay (the plan price)
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
  return fetch(`${apiBase}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, baseAmount }),
  }).then((r) => json<PaymentOrder>(r));
}

// Poll whether the order has been paid (matched by the verifier's ingest).
export function getStatus(orderId: string): Promise<{ status: PayStatus }> {
  return fetch(`${apiBase}/upi/status?orderId=${encodeURIComponent(orderId)}`, {
    cache: 'no-store',
  }).then((r) => json<{ status: PayStatus }>(r));
}
