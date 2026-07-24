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

// Create a user. Returns { user } or { error: 'exists' }.
async function createUser(email, password, name) {
  const id = normalizeEmail(email);
  if (await getByEmail(id)) return { error: 'exists' };
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id,
    email: id,
    name: String(name || '').trim().slice(0, 80),
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };
  const c = getContainer();
  if (c) await (await c).items.upsert(user);
  else memory.set(id, user);
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

module.exports = { createUser, getByEmail, verifyPassword, publicUser };
