import { describe, it, expect, beforeEach } from 'vitest';
import users from './users-store.js';

describe('users-store', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('creates and updates username', async () => {
    const created = await users.createUser('alice@example.com', 'password123', 'Alice');
    expect(created.user).toBeTruthy();

    const updated = await users.updateUserName('alice@example.com', 'Alicia');
    expect(updated.user.name).toBe('Alicia');

    const again = await users.updateUserName('alice@example.com', 'Alicia');
    expect(again.user.name).toBe('Alicia');
  });

  it('rejects duplicate username on update', async () => {
    await users.createUser('a@example.com', 'password123', 'Alpha');
    await users.createUser('b@example.com', 'password123', 'Beta');

    const result = await users.updateUserName('b@example.com', 'Alpha');
    expect(result.error).toBe('name-exists');
  });

  it('rejects too-short username', async () => {
    await users.createUser('c@example.com', 'password123', 'Chris');
    const result = await users.updateUserName('c@example.com', 'A');
    expect(result.error).toBe('name-too-short');
  });
});

describe('findOrCreateOAuthUser account scoping', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('gives each provider its own account on the same address', async () => {
    const google = await users.findOrCreateOAuthUser({
      email: 'Split@Example.com',
      name: 'Split',
      provider: 'google',
      providerSub: 'g-1',
    });
    const microsoft = await users.findOrCreateOAuthUser({
      email: 'split@example.com',
      name: 'Split',
      provider: 'microsoft',
      providerSub: 'm-1',
    });

    expect(google.user.id).toBe('google:split@example.com');
    expect(microsoft.user.id).toBe('microsoft:split@example.com');
    expect(google.user.id).not.toBe(microsoft.user.id);
    expect(google.user.email).toBe('split@example.com');
    expect(microsoft.user.email).toBe('split@example.com');
  });

  it('returns the same account when one provider signs in again', async () => {
    const first = await users.findOrCreateOAuthUser({ email: 'again@example.com', provider: 'google', providerSub: 'g-2' });
    const second = await users.findOrCreateOAuthUser({ email: 'again@example.com', provider: 'google', providerSub: 'g-2' });
    expect(second.error).toBeUndefined();
    expect(second.user.id).toBe(first.user.id);
  });

  it('refuses a different identity at the same provider', async () => {
    await users.findOrCreateOAuthUser({ email: 'taken@example.com', provider: 'google', providerSub: 'g-3' });
    const impostor = await users.findOrCreateOAuthUser({
      email: 'taken@example.com',
      provider: 'google',
      providerSub: 'g-other',
    });
    expect(impostor.error).toBe('email-exists');
  });

  it('leaves a password account untouched when a provider signs in', async () => {
    await users.createUser('pw@example.com', 'password123', 'PwUser');
    const linked = await users.findOrCreateOAuthUser({
      email: 'pw@example.com',
      provider: 'microsoft',
      providerSub: 'm-3',
    });
    expect(linked.user.id).toBe('microsoft:pw@example.com');
    const password = await users.getByEmail('pw@example.com');
    expect(password.id).toBe('pw@example.com');
    expect(password.authProvider).toBe('local');
  });
});

describe('accountIdFor', () => {
  it('scopes an oauth account by provider and leaves a password account bare', () => {
    expect(users.accountIdFor('google', 'A@B.com')).toBe('google:a@b.com');
    expect(users.accountIdFor('microsoft', 'a@b.com')).toBe('microsoft:a@b.com');
    expect(users.accountIdFor('local', 'a@b.com')).toBe('a@b.com');
    expect(users.accountIdFor('', 'a@b.com')).toBe('a@b.com');
  });
});

describe('accountsForEmail', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('finds every provider an address signs in with', async () => {
    await users.findOrCreateOAuthUser({ email: 'both@example.com', provider: 'google', providerSub: 'g-b' });
    await users.findOrCreateOAuthUser({ email: 'both@example.com', provider: 'microsoft', providerSub: 'm-b' });
    const providers = (await users.accountsForEmail('Both@Example.com')).map((a) => a.authProvider).sort();
    expect(providers).toEqual(['google', 'microsoft']);
  });

  it('does not mistake an order or a name reservation for an account', async () => {
    await users.createUser('solo@example.com', 'password123', 'Solo');
    const accounts = await users.accountsForEmail('solo@example.com');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('solo@example.com');
  });

  it('returns nothing for an address with no account', async () => {
    expect(await users.accountsForEmail('nobody@example.com')).toEqual([]);
  });
});
