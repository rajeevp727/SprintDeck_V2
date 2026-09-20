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

describe('findOrCreateOAuthUser provider linking', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('links a second provider onto the account that owns the email', async () => {
    const google = await users.findOrCreateOAuthUser({
      email: 'Linked@Example.com',
      name: 'Linked',
      provider: 'google',
      providerSub: 'g-1',
    });
    expect(google.user.providers).toEqual({ google: 'g-1' });

    const microsoft = await users.findOrCreateOAuthUser({
      email: 'linked@example.com',
      provider: 'microsoft',
      providerSub: 'm-1',
    });
    expect(microsoft.error).toBeUndefined();
    expect(microsoft.user.id).toBe(google.user.id);
    expect(microsoft.user.providers).toEqual({ google: 'g-1', microsoft: 'm-1' });
  });

  it('is idempotent when the same provider identity signs in again', async () => {
    await users.findOrCreateOAuthUser({ email: 'again@example.com', provider: 'google', providerSub: 'g-2' });
    const second = await users.findOrCreateOAuthUser({
      email: 'again@example.com',
      provider: 'google',
      providerSub: 'g-2',
    });
    expect(second.error).toBeUndefined();
    expect(second.user.providers).toEqual({ google: 'g-2' });
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

  it('links a provider onto an account created with a password', async () => {
    await users.createUser('pw@example.com', 'password123', 'PwUser');
    const linked = await users.findOrCreateOAuthUser({
      email: 'pw@example.com',
      provider: 'microsoft',
      providerSub: 'm-3',
    });
    expect(linked.error).toBeUndefined();
    expect(linked.user.providers).toEqual({ microsoft: 'm-3' });
  });
});
