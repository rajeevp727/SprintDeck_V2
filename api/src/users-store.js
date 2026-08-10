'use strict';

// User accounts for email+password auth. Stored in a Cosmos container "users"
// (same DB as sessions/payments), keyed by lowercased email as id. Passwords are
// hashed with scrypt + a per-user random salt (never stored in plaintext), and
// verified in constant time. In-memory fallback when Cosmos isn't configured.
const crypto = require('crypto');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'users';

const memory = new Map(); // email -> user
let containerPromise = null;

function getContainer() {
  if (!conn) return null;
  if (!containerPromise) {
    const { CosmosClient } = require('@azure/cosmos');
    const client = new CosmosClient(conn);
    containerPromise = (async () => {
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: dbName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: dbName }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: containerName,
        partitionKey: { paths: ['/id'] },
      });
      return container;
    })().catch((e) => {
      containerPromise = null;
      throw e;
    });
  }
  return containerPromise;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

async function getByEmail(email) {
  const id = normalizeEmail(email);
  if (!id) return null;
  const c = getContainer();
  if (c) {
    try {
      const { resource } = await (await c).item(id, id).read();
      return resource || null;
    } catch (err) {
      if (err.code === 404) return null;
      throw err;
    }
  }
  return memory.get(id) || null;
}

// Find a user by (case-insensitive) name, or null.
async function getByName(name) {
  const n = normalizeName(name);
  if (!n) return null;
  const c = getContainer();
  if (c) {
    const { resources } = await (await c).items
      .query({
        query: 'SELECT TOP 1 * FROM c WHERE c.nameLower = @n',
        parameters: [{ name: '@n', value: n }],
      })
      .fetchAll();
    return resources[0] || null;
  }
  for (const u of memory.values()) {
    if ((u.nameLower || normalizeName(u.name)) === n) return u;
  }
  return null;
}

// Create a user. Returns { user } or { error: 'email-exists' | 'name-exists' }.
// Uniqueness is enforced at the DB level: the user doc's id IS the (lowercased)
// email, and a separate "name:<nameLower>" reservation doc guards the name —
// both inserted with items.create (not upsert), which throws 409 on a duplicate.
async function createUser(email, password, name) {
  const id = normalizeEmail(email);
  const cleanName = String(name || '').trim().slice(0, 80);
  const nameLower = normalizeName(cleanName);

  // Friendly pre-checks (nice error without relying on the 409).
  if (await getByEmail(id)) return { error: 'email-exists' };
  if (nameLower && (await getByName(cleanName))) return { error: 'name-exists' };

  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id,
    email: id,
    name: cleanName,
    nameLower,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };

  const c = getContainer();
  if (!c) {
    // In-memory fallback (single process — the pre-checks above are race-free).
    if (memory.has(id)) return { error: 'email-exists' };
    for (const u of memory.values()) {
      if (nameLower && (u.nameLower || normalizeName(u.name)) === nameLower) return { error: 'name-exists' };
    }
    memory.set(id, user);
    if (nameLower) memory.set(`name:${nameLower}`, { id: `name:${nameLower}`, owner: id });
    return { user };
  }

  const container = await c;
  // Email uniqueness — create throws 409 if the id (=email) already exists.
  try {
    await container.items.create(user);
  } catch (err) {
    if (err && err.code === 409) return { error: 'email-exists' };
    throw err;
  }
  // Name uniqueness — reservation doc; roll back the user doc if the name is taken.
  if (nameLower) {
    try {
      await container.items.create({ id: `name:${nameLower}`, type: 'name-reservation', owner: id, createdAt: Date.now() });
    } catch (err) {
      if (err && err.code === 409) {
        try {
          await container.item(id, id).delete();
        } catch {
          /* best-effort rollback */
        }
        return { error: 'name-exists' };
      }
      throw err;
    }
  }
  return { user };
}

// Is a name free? (true when no user currently uses it.)
async function isNameAvailable(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return !(await getByName(name));
}

// Set a new password (fresh salt + hash). Returns the user, or null if missing.
async function updatePassword(email, newPassword) {
  const user = await getByEmail(email);
  if (!user) return null;
  user.salt = crypto.randomBytes(16).toString('hex');
  user.passwordHash = hashPassword(newPassword, user.salt);
  const c = getContainer();
  if (c) await (await c).items.upsert(user);
  else memory.set(user.id, user);
  return user;
}

// Update display name. Returns { user } or { error: 'name-exists' | 'name-too-short' }.
async function updateUserName(email, name) {
  const user = await getByEmail(email);
  if (!user) return null;
  const cleanName = String(name || '').trim().slice(0, 80);
  const nameLower = normalizeName(cleanName);
  if (nameLower.length < 2) return { error: 'name-too-short' };

  const oldLower = normalizeName(user.name);
  if (oldLower === nameLower) return { user };

  const taken = await getByName(cleanName);
  if (taken && taken.id !== user.id) return { error: 'name-exists' };

  user.name = cleanName;
  user.nameLower = nameLower;
  user.updatedAt = Date.now();

  const c = getContainer();
  if (!c) {
    if (oldLower && memory.has(`name:${oldLower}`)) memory.delete(`name:${oldLower}`);
    memory.set(user.id, user);
    if (nameLower) memory.set(`name:${nameLower}`, { id: `name:${nameLower}`, owner: user.id });
    return { user };
  }

  const container = await c;
  await container.items.upsert(user);
  if (oldLower && oldLower !== nameLower) {
    try {
      await container.item(`name:${oldLower}`, `name:${oldLower}`).delete();
    } catch (err) {
      if (err.code !== 404) throw err;
    }
  }
  if (nameLower) {
    try {
      await container.items.create({ id: `name:${nameLower}`, type: 'name-reservation', owner: user.id, createdAt: Date.now() });
    } catch (err) {
      if (err && err.code === 409) return { error: 'name-exists' };
      throw err;
    }
  }
  return { user };
}

function verifyPassword(user, password) {
  if (!user || !user.salt || !user.passwordHash) return false;
  const got = Buffer.from(hashPassword(password, user.salt));
  const exp = Buffer.from(user.passwordHash);
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

// The client-safe view of a user — never the salt/hash.
function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || '' };
}

module.exports = { createUser, getByEmail, getByName, isNameAvailable, updatePassword, updateUserName, verifyPassword, publicUser };
