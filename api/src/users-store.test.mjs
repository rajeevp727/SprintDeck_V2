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
