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
// Both email and name must be unique (name case-insensitively).
async function createUser(email, password, name) {
  const id = normalizeEmail(email);
  const cleanName = String(name || '').trim().slice(0, 80);
  if (await getByEmail(id)) return { error: 'email-exists' };
  if (cleanName && (await getByName(cleanName))) return { error: 'name-exists' };
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id,
    email: id,
    name: cleanName,
    nameLower: normalizeName(cleanName),
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };
  const c = getContainer();
  if (c) await (await c).items.upsert(user);
  else memory.set(id, user);
  return { user };
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

module.exports = { createUser, getByEmail, getByName, updatePassword, verifyPassword, publicUser };
