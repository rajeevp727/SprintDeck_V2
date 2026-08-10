

const apiBase = '/api';

export interface PaymentOrder {
  orderId: string;
  payAmount: number; 
}

export type PayStatus = 'pending' | 'confirmed' | 'expired';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { void 0; }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function createOrder(tier: string, baseAmount: number): Promise<PaymentOrder> {
  return fetch(`${apiBase}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, baseAmount }),
  }).then((r) => json<PaymentOrder>(r));
}

export function getStatus(orderId: string): Promise<{ status: PayStatus }> {
  return fetch(`${apiBase}/upi/status?orderId=${encodeURIComponent(orderId)}`, {
    cache: 'no-store',
  }).then((r) => json<{ status: PayStatus }>(r));
}

export interface ServerSubscription {
  active: boolean;
  tier?: string;
  at?: string;
}

export function getServerSubscription(orderId: string): Promise<ServerSubscription> {
  return fetch(`${apiBase}/subscription?orderId=${encodeURIComponent(orderId)}`, {
    cache: 'no-store',
  }).then((r) => json<ServerSubscription>(r));
}
