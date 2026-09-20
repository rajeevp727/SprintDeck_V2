import { describe, it, expect } from 'vitest';
import { grantOrder, parseAccountId, Prices } from './grant-order.js';

describe('grantOrder', () => {
  it('builds a confirmed order the subscription query can find', () => {
    const order = grantOrder('google:Someone@Example.com', 'master');
    expect(order.type).toBe('order');
    expect(order.status).toBe('confirmed');
    expect(order.accountId).toBe('google:someone@example.com');
    expect(order.email).toBe('someone@example.com');
    expect(order.tier).toBe('master');
    expect(typeof order.confirmedAt).toBe('number');
  });

  it('grants each provider account separately on one address', () => {
    const google = grantOrder('google:a@b.com', 'master');
    const microsoft = grantOrder('microsoft:a@b.com', 'master');
    expect(google.accountId).not.toBe(microsoft.accountId);
    expect(google.id).not.toBe(microsoft.id);
  });

  it('treats a bare email as the password account', () => {
    expect(parseAccountId('a@b.com')).toEqual({ provider: 'local', email: 'a@b.com' });
    expect(grantOrder('a@b.com', 'pro').accountId).toBe('a@b.com');
  });

  it('prices each tier', () => {
    for (const [tier, price] of Object.entries(Prices)) {
      expect(grantOrder('google:a@b.com', tier).payAmount).toBe(price);
    }
  });

  it('marks a lifetime grant so it never expires', () => {
    const order = grantOrder('google:a@b.com', 'pro', { lifetime: true });
    expect(order.lifetime).toBe(true);
    expect(order.grantedBy).toBe('admin-lifetime');
  });

  it('rejects an unknown tier', () => {
    expect(() => grantOrder('google:a@b.com', 'platinum')).toThrow(/tier must be one of/);
  });

  it('rejects a missing email', () => {
    expect(() => grantOrder('', 'pro')).toThrow(/must contain an email/);
  });
});
