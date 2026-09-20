import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const cjs = createRequire(import.meta.url);
const entitlement = cjs('./entitlement.js');
const users = cjs('./users-store.js');
const jwt = cjs('./jwt.js');

const secret = 'test-secret-for-entitlement';

function requestFor(token) {
  return { headers: { get: (name) => (name === 'x-auth-token' ? token : null) } };
}

describe('meetsTier', () => {
  it('lets pro and above through a pro gate', () => {
    for (const tier of ['pro', 'expert', 'master']) {
      expect(entitlement.meetsTier({ active: true, tier }, 'pro')).toBe(true);
    }
  });

  it('keeps free out', () => {
    expect(entitlement.meetsTier({ active: true, tier: 'free' }, 'pro')).toBe(false);
    expect(entitlement.meetsTier(null, 'pro')).toBe(false);
  });

  it('treats an inactive plan as no plan', () => {
    expect(entitlement.meetsTier({ active: false, tier: 'master' }, 'pro')).toBe(false);
  });

  it('holds pro below an expert gate', () => {
    expect(entitlement.meetsTier({ active: true, tier: 'pro' }, 'expert')).toBe(false);
    expect(entitlement.meetsTier({ active: true, tier: 'master' }, 'expert')).toBe(true);
  });
});

describe('checkTier against a real account', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
    process.env.JWT_SECRET = secret;
  });

  it('refuses an anonymous caller', async () => {
    const { allowed } = await entitlement.checkTier(requestFor(''), 'pro');
    expect(allowed).toBe(false);
  });

  it('refuses a signed-in account with no plan', async () => {
    const { user } = await users.findOrCreateOAuthUser({
      email: 'free@example.com',
      provider: 'google',
      providerSub: 'g-free',
    });
    const token = jwt.sign({ sub: user.id, email: user.email }, secret, 3600);
    const { allowed } = await entitlement.checkTier(requestFor(token), 'pro');
    expect(allowed).toBe(false);
  });

  it('admits an account holding pro', async () => {
    const { user } = await users.findOrCreateOAuthUser({
      email: 'paid@example.com',
      provider: 'google',
      providerSub: 'g-paid',
    });
    await users.setPlan(user.id, { tier: 'pro' });
    const token = jwt.sign({ sub: user.id, email: user.email }, secret, 3600);
    const { allowed, plan } = await entitlement.checkTier(requestFor(token), 'pro');
    expect(allowed).toBe(true);
    expect(plan.tier).toBe('pro');
  });

  it('ignores an order id the caller supplies', async () => {
    // The gate reads the account, so nothing in the body or query can grant it.
    const { allowed } = await entitlement.checkTier(requestFor(''), 'pro');
    expect(allowed).toBe(false);
  });
});
