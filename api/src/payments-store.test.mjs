import { describe, it, expect, beforeEach } from 'vitest';
import store from './payments-store.js';

describe('payments-store', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('grantSubscription creates a confirmed master order', async () => {
    const { order } = await store.grantSubscription('owner@example.com', 'master');
    expect(order.status).toBe('confirmed');
    expect(order.tier).toBe('master');
    expect(order.email).toBe('owner@example.com');
    expect(order.confirmedAt).toBeTruthy();
  });

  it('activeSubscription returns tier for a granted order', async () => {
    const { order } = await store.grantSubscription('owner@example.com', 'pro');
    const sub = await store.activeSubscription(order.id);
    expect(sub).toMatchObject({ tier: 'pro' });
    expect(sub.at).toBeTruthy();
  });

  it('activeSubscription returns null for unknown order', async () => {
    expect(await store.activeSubscription('missing')).toBeNull();
  });

  it('grantSubscription rejects invalid tier', async () => {
    const result = await store.grantSubscription('x@y.com', 'platinum');
    expect(result.error).toBe('invalid-tier');
  });
});
