import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

// Both through require: the store reaches users-store the same way, and an
// ESM import would hand this file a second instance with its own state.
const cjs = createRequire(import.meta.url);
const store = cjs('./payments-store.js');
const users = cjs('./users-store.js');

describe('payments-store', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('creates a pending order keyed to the buying account', async () => {
    const { order } = await store.createOrder({
      tier: 'pro',
      email: 'buyer@example.com',
      accountId: 'google:buyer@example.com',
      baseAmount: 199,
    });
    expect(order.status).toBe('pending');
    expect(order.accountId).toBe('google:buyer@example.com');
    expect(order.id.startsWith('order:')).toBe(true);
  });

  it('confirms the matching order when the credit arrives', async () => {
    const { order } = await store.createOrder({ tier: 'pro', accountId: 'google:a@b.com', baseAmount: 199 });
    const result = await store.ingestCredit({ amount: 199, utr: 'UTR-1', rawText: 'credited 199', source: 'test' });
    expect(result.order?.id).toBe(order.id);
    expect(result.order?.status).toBe('confirmed');
    expect(result.receipt.id.startsWith('receipt:')).toBe(true);
  });

  it('puts the purchased tier on the account, not on the order alone', async () => {
    await users.findOrCreateOAuthUser({ email: 'pays@example.com', provider: 'google', providerSub: 'g-pay' });
    await store.createOrder({ tier: 'expert', accountId: 'google:pays@example.com', baseAmount: 499 });
    await store.ingestCredit({ amount: 499, utr: 'UTR-2', rawText: 'credited 499', source: 'test' });

    const plan = users.planFor(await users.getById('google:pays@example.com'));
    expect(plan).toMatchObject({ active: true, tier: 'expert', lifetime: false });
  });

  it('ignores a duplicate credit for the same reference', async () => {
    await store.createOrder({ tier: 'pro', accountId: 'google:dupe@example.com', baseAmount: 199 });
    await store.ingestCredit({ amount: 199, utr: 'UTR-3', rawText: 'credited 199', source: 'test' });
    const second = await store.ingestCredit({ amount: 199, utr: 'UTR-3', rawText: 'credited 199', source: 'test' });
    expect(second.duplicate).toBe(true);
    expect(second.order).toBeNull();
  });

  it('records a credit that matches no pending order', async () => {
    const result = await store.ingestCredit({ amount: 12345, utr: 'UTR-4', rawText: 'credited 12345', source: 'test' });
    expect(result.order).toBeNull();
    expect(result.receipt.amount).toBe(12345);
  });

  it('activeSubscription returns null for an unknown order', async () => {
    expect(await store.activeSubscription('missing')).toBeNull();
  });
});
