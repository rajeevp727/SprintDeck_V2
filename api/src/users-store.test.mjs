import { describe, it, expect, beforeEach } from 'vitest';
import users from './users-store.js';

describe('users-store', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  describe('device sessions', () => {
    it('keeps three devices and evicts the stalest', async () => {
      const { user } = await users.createUser('devices@example.com', 'password123', 'Devices');

      for (const sid of ['one', 'two', 'three']) await users.registerSession(user, sid, sid);
      expect(users.hasSession(user, 'one')).toBe(true);

      const { evicted } = await users.registerSession(user, 'four', 'four');
      expect(evicted.map((s) => s.id)).toEqual(['one']);
      expect(users.hasSession(user, 'one')).toBe(false);
      expect(users.hasSession(user, 'four')).toBe(true);
      expect(user.sessions).toHaveLength(users.maxDevices);
    });

    it('signing in again on the same device does not take a second slot', async () => {
      const { user } = await users.createUser('same@example.com', 'password123', 'Same');
      await users.registerSession(user, 'dev', 'laptop');
      await users.registerSession(user, 'dev', 'laptop');
      expect(user.sessions).toHaveLength(1);
    });

    it('revoking drops just that device', async () => {
      const { user } = await users.createUser('revoke@example.com', 'password123', 'Revoke');
      await users.registerSession(user, 'a', 'a');
      await users.registerSession(user, 'b', 'b');

      await users.revokeSession(user, 'a');
      expect(users.hasSession(user, 'a')).toBe(false);
      expect(users.hasSession(user, 'b')).toBe(true);
    });
  });

  describe('active rooms', () => {
    it('remembers one room per ceremony and clears it', async () => {
      const { user } = await users.createUser('rooms@example.com', 'password123', 'Rooms');

      await users.setActiveRoom(user, 'retro', 'abc12');
      await users.setActiveRoom(user, 'poker', 'xy9z1');
      expect(users.activeRoomsOf(user)).toEqual([
        expect.objectContaining({ kind: 'poker', code: 'XY9Z1' }),
        expect.objectContaining({ kind: 'retro', code: 'ABC12' }),
      ]);

      await users.setActiveRoom(user, 'retro', null);
      expect(users.activeRoomsOf(user).map((r) => r.kind)).toEqual(['poker']);
    });

    it('ignores a ceremony it does not know', async () => {
      const { user } = await users.createUser('unknown@example.com', 'password123', 'Unknown');
      await users.setActiveRoom(user, 'bingo', 'abc12');
      expect(users.activeRoomsOf(user)).toEqual([]);
    });
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

describe('display names across one person\'s accounts', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('keeps one name across provider and password accounts on the same address', async () => {
    const google = await users.findOrCreateOAuthUser({
      email: 'one@example.com',
      name: 'Rajeev Reddy',
      provider: 'google',
      providerSub: 'g-one',
    });
    const microsoft = await users.findOrCreateOAuthUser({
      email: 'one@example.com',
      name: 'Rajeev Reddy',
      provider: 'microsoft',
      providerSub: 'm-one',
    });
    const password = await users.upsertPasswordAccount('one@example.com', 'password123', {
      name: 'Rajeev Reddy',
    });

    expect(google.user.name).toBe('Rajeev Reddy');
    expect(microsoft.user.name).toBe('Rajeev Reddy');
    expect(password.name).toBe('Rajeev Reddy');
  });

  it('still keeps a different person off a taken name', async () => {
    await users.findOrCreateOAuthUser({
      email: 'first@example.com',
      name: 'Taken Name',
      provider: 'google',
      providerSub: 'g-first',
    });
    const other = await users.findOrCreateOAuthUser({
      email: 'second@example.com',
      name: 'Taken Name',
      provider: 'google',
      providerSub: 'g-second',
    });
    expect(other.user.name).not.toBe('Taken Name');
  });

  it('lets a rename take a name a sibling account holds', async () => {
    await users.findOrCreateOAuthUser({
      email: 'rename@example.com',
      name: 'Shared Name',
      provider: 'google',
      providerSub: 'g-rn',
    });
    await users.upsertPasswordAccount('rename@example.com', 'password123', { name: 'Other Name' });

    const result = await users.updateUserName('rename@example.com', 'Shared Name');
    expect(result.error).toBeUndefined();
    expect(result.user.name).toBe('Shared Name');
  });
});

describe('account deletion', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('deletes the provider account by id, not by address', async () => {
    await users.findOrCreateOAuthUser({
      email: 'del@example.com',
      name: 'Del User',
      provider: 'google',
      providerSub: 'g-del',
    });
    await users.upsertPasswordAccount('del@example.com', 'password123', { name: 'Del User' });

    expect(await users.deleteUser('google:del@example.com')).toEqual({ deleted: true });
    expect(await users.getById('google:del@example.com')).toBeNull();
    // the sibling on the same address must survive
    expect((await users.getByEmail('del@example.com')).id).toBe('del@example.com');
  });

  it('reports nothing deleted for an unknown account', async () => {
    expect(await users.deleteUser('google:ghost@example.com')).toBeNull();
  });

  it('leaves the name reserved while a sibling still uses it', async () => {
    await users.findOrCreateOAuthUser({
      email: 'keep@example.com',
      name: 'Kept Name',
      provider: 'google',
      providerSub: 'g-keep',
    });
    await users.upsertPasswordAccount('keep@example.com', 'password123', { name: 'Kept Name' });

    await users.deleteUser('google:keep@example.com');
    const stranger = await users.findOrCreateOAuthUser({
      email: 'stranger@example.com',
      name: 'Kept Name',
      provider: 'google',
      providerSub: 'g-stranger',
    });
    expect(stranger.user.name).not.toBe('Kept Name');
  });
});
