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

  it('activeSubscriptionByEmail finds the latest active grant', async () => {
    const first = await store.grantSubscription('owner@example.com', 'pro');
    const second = await store.grantSubscription('owner@example.com', 'master');
    const sub = await store.activeSubscriptionByEmail('owner@example.com');
    expect(sub).toMatchObject({ tier: 'master', orderId: second.order.id });
    expect(sub?.orderId).not.toBe(first.order.id);
  });

  it('activeSubscriptionByEmail returns null when grant is expired', async () => {
    const { order } = await store.grantSubscription('expired@example.com', 'pro');
    order.confirmedAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
    expect(await store.activeSubscriptionByEmail('expired@example.com')).toBeNull();
  });

  it('lifetime grant stays active after 30 days', async () => {
    const { order } = await store.grantSubscription('life@example.com', 'master', { lifetime: true });
    expect(order.lifetime).toBe(true);
    order.confirmedAt = Date.now() - 400 * 24 * 60 * 60 * 1000;
    const sub = await store.activeSubscription(order.id);
    expect(sub).toMatchObject({ tier: 'master', lifetime: true, orderId: order.id });
  });

  it('grantSubscription rejects invalid tier', async () => {
    const result = await store.grantSubscription('x@y.com', 'platinum');
    expect(result.error).toBe('invalid-tier');
  });
});
