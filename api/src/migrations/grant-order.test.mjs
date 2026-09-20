import { describe, it, expect } from 'vitest';
import { grantOrder, Prices } from './grant-order.js';

describe('grantOrder', () => {
  it('builds a confirmed order the subscription query can find', () => {
    const order = grantOrder('Someone@Example.com', 'master');
    expect(order.type).toBe('order');
    expect(order.status).toBe('confirmed');
    expect(order.email).toBe('someone@example.com');
    expect(order.tier).toBe('master');
    expect(typeof order.confirmedAt).toBe('number');
  });

  it('prices each tier', () => {
    for (const [tier, price] of Object.entries(Prices)) {
      expect(grantOrder('a@b.com', tier).payAmount).toBe(price);
    }
  });

  it('marks a lifetime grant so it never expires', () => {
    const order = grantOrder('a@b.com', 'pro', { lifetime: true });
    expect(order.lifetime).toBe(true);
    expect(order.grantedBy).toBe('admin-lifetime');
  });

  it('rejects an unknown tier', () => {
    expect(() => grantOrder('a@b.com', 'platinum')).toThrow(/tier must be one of/);
  });

  it('rejects a missing email', () => {
    expect(() => grantOrder('', 'pro')).toThrow(/valid email/);
  });
});
