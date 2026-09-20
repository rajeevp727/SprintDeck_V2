'use strict';

const crypto = require('crypto');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = process.env.COSMOS_DB_NAME || 'sprintdeck';
const containerName = 'users';

const memory = new Map(); 
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

/**
 * The account key. Each provider gets its own account on a given address, so
 * the provider is part of the id; password accounts keep the bare email.
 */
function accountIdFor(provider, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  const p = String(provider || '').trim().toLowerCase();
  return !p || p === 'local' ? normalized : `${p}:${normalized}`;
}

async function getById(id) {
  return getByEmail(id);
}

/**
 * Every account registered on an address. One per provider is expected, so this
 * answers "how does this person sign in?" — accounts are the documents with no
 * `type`, unlike orders, receipts and name reservations.
 */
async function accountsForEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const c = getContainer();
  if (c) {
    const { resources } = await (await c).items
      .query({
        query: 'SELECT * FROM c WHERE c.email = @email AND NOT IS_DEFINED(c.type)',
        parameters: [{ name: '@email', value: normalized }],
      })
      .fetchAll();
    return resources;
  }
  return [...memory.values()].filter((u) => u && !u.type && u.email === normalized);
}

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

async function createUser(email, password, name) {
  const id = normalizeEmail(email);
  const cleanName = String(name || '').trim().slice(0, 80);
  const nameLower = normalizeName(cleanName);

  if (await getByEmail(id)) return { error: 'email-exists' };
  if (nameLower && (await getByName(cleanName))) return { error: 'name-exists' };

  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id,
    email: id,
    name: cleanName,
    nameLower,
    authProvider: 'local',
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };

  const c = getContainer();
  if (!c) {
    
    if (memory.has(id)) return { error: 'email-exists' };
    for (const u of memory.values()) {
      if (nameLower && (u.nameLower || normalizeName(u.name)) === nameLower) return { error: 'name-exists' };
    }
    memory.set(id, user);
    if (nameLower) memory.set(`name:${nameLower}`, { id: `name:${nameLower}`, owner: id });
    return { user };
  }

  const container = await c;
  
  try {
    await container.items.create(user);
  } catch (err) {
    if (err && err.code === 409) return { error: 'email-exists' };
    throw err;
  }
  
  if (nameLower) {
    try {
      await container.items.create({ id: `name:${nameLower}`, type: 'name-reservation', owner: id, createdAt: Date.now() });
    } catch (err) {
      if (err && err.code === 409) {
        try {
          await container.item(id, id).delete();
        } catch { void 0; }
        return { error: 'name-exists' };
      }
      throw err;
    }
  }
  return { user };
}

function uniqueNameFromBase(baseName) {
  const clean = String(baseName || '').trim().slice(0, 80);
  if (clean.length >= 2) return clean;
  return 'user';
}

/** A name is free for this address when nobody holds it, or a sibling does. */
async function nameIsFreeFor(name, email) {
  const holder = await getByName(name);
  if (!holder) return true;
  return !!email && holder.email === normalizeEmail(email);
}

async function pickAvailableName(preferred, email) {
  const base = uniqueNameFromBase(preferred);
  // Accounts on one address are the same person — Google, Microsoft and
  // password sign-in should show one name, not Name, Name1, Name2.
  if (await nameIsFreeFor(base, email)) return base;
  for (let i = 1; i <= 20; i++) {
    const cand = `${base.replace(/\d+$/, '')}${i}`.slice(0, 80);
    if (await isNameAvailable(cand)) return cand;
  }
  return `${base.slice(0, 70)}${Math.floor(1000 + Math.random() * 9000)}`;
}

async function findOrCreateOAuthUser({ email, name, provider, providerSub }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { error: 'invalid-email' };
  if (!providerSub) return { error: 'invalid-provider' };
  const id = accountIdFor(provider, normalizedEmail);

  const existing = await getById(id);
  if (existing) {
    // Same provider, different subject: the provider itself should never issue
    // two accounts for one address.
    if (existing.providerSub && existing.providerSub !== providerSub) {
      return { error: 'email-exists' };
    }
    if (!existing.providerSub) {
      existing.authProvider = provider;
      existing.providerSub = providerSub;
      const c = getContainer();
      if (c) await (await c).items.upsert(existing);
      else memory.set(existing.id, existing);
    }
    return { user: existing };
  }

  const cleanName = await pickAvailableName(name || normalizedEmail.split('@')[0], normalizedEmail);
  const nameLower = normalizeName(cleanName);
  const user = {
    id,
    email: normalizedEmail,
    name: cleanName,
    nameLower,
    authProvider: provider,
    providerSub,
    createdAt: Date.now(),
  };

  const c = getContainer();
  if (!c) {
    memory.set(id, user);
    if (nameLower) memory.set(`name:${nameLower}`, { id: `name:${nameLower}`, owner: id });
    return { user };
  }

  const container = await c;
  try {
    await container.items.create(user);
  } catch (err) {
    if (err && err.code === 409) return { error: 'email-exists' };
    throw err;
  }
  if (nameLower) {
    try {
      await container.items.create({ id: `name:${nameLower}`, type: 'name-reservation', owner: id, createdAt: Date.now() });
    } catch (err) {
      if (err && err.code === 409) {
        try {
          await container.item(id, id).delete();
        } catch { void 0; }
        return { error: 'name-exists' };
      }
      throw err;
    }
  }
  return { user };
}

const PlanDays = 30;

/**
 * The plan lives on the account: tier plus, for a timed plan, when it lapses.
 * A lifetime plan has no expiry.
 */
async function setPlan(accountId, { tier, lifetime = false, days = PlanDays } = {}) {
  const user = await getById(accountId);
  if (!user) return null;
  const now = Date.now();
  user.tier = String(tier || 'free').toLowerCase();
  user.lifetime = !!lifetime;
  user.planGrantedAt = now;
  user.planExpiresAt = lifetime || user.tier === 'free' ? null : now + days * 24 * 60 * 60 * 1000;
  const c = getContainer();
  if (c) await (await c).items.upsert(user);
  else memory.set(user.id, user);
  return user;
}

/** What the account is entitled to right now. */
function planFor(user) {
  const tier = String(user?.tier || 'free').toLowerCase();
  if (!user || tier === 'free') return { active: false, tier: 'free', lifetime: false };
  const at = new Date(user.planGrantedAt || user.createdAt || 0).toISOString();
  if (user.lifetime) return { active: true, tier, lifetime: true, at, expiresAt: null };
  const expiresAt = user.planExpiresAt || 0;
  if (expiresAt && Date.now() > expiresAt) {
    return { active: false, tier: 'free', lifetime: false, expiresAt: new Date(expiresAt).toISOString() };
  }
  return {
    active: true,
    tier,
    lifetime: false,
    at,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
}

async function isNameAvailable(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return !(await getByName(name));
}

/**
 * Sets a password on the address, creating the password account when the
 * person has only ever signed in through a provider. Password accounts are
 * keyed by the bare email, which is what makes email sign-in find them.
 */
async function upsertPasswordAccount(email, password, { name } = {}) {
  const id = normalizeEmail(email);
  if (!id) return null;

  const existing = await getById(id);
  if (existing) return updatePassword(id, password);

  const cleanName = await pickAvailableName(name || id.split('@')[0], id);
  const nameLower = normalizeName(cleanName);
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id,
    email: id,
    name: cleanName,
    nameLower,
    authProvider: 'local',
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };

  const c = getContainer();
  if (!c) {
    memory.set(id, user);
    if (nameLower) memory.set(`name:${nameLower}`, { id: `name:${nameLower}`, owner: id });
    return user;
  }
  const container = await c;
  await container.items.upsert(user);
  if (nameLower) {
    try {
      await container.items.create({ id: `name:${nameLower}`, type: 'name-reservation', owner: id, createdAt: Date.now() });
    } catch (err) {
      if (!err || err.code !== 409) throw err;
    }
  }
  return user;
}

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

async function updateUserName(email, name) {
  const user = await getByEmail(email);
  if (!user) return null;
  const cleanName = String(name || '').trim().slice(0, 80);
  const nameLower = normalizeName(cleanName);
  if (nameLower.length < 2) return { error: 'name-too-short' };

  const oldLower = normalizeName(user.name);
  if (oldLower === nameLower) return { user };

  const taken = await getByName(cleanName);
  if (taken && taken.id !== user.id && taken.email !== user.email) return { error: 'name-exists' };

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
      if (!err || err.code !== 409) throw err;
      const holder = await getByName(cleanName);
      if (holder && holder.id !== user.id && holder.email !== user.email) return { error: 'name-exists' };
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

function hasPassword(user) {
  return !!(user && user.salt && user.passwordHash);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    authProvider: user.authProvider || (hasPassword(user) ? 'local' : 'local'),
    hasPassword: hasPassword(user),
  };
}

async function deleteUser(email) {
  const user = await getByEmail(email);
  if (!user) return null;
  const nameLower = normalizeName(user.name);
  const c = getContainer();
  if (!c) {
    memory.delete(user.id);
    if (nameLower) memory.delete(`name:${nameLower}`);
    return { deleted: true };
  }
  const container = await c;
  await container.item(user.id, user.id).delete();
  if (nameLower) {
    try {
      await container.item(`name:${nameLower}`, `name:${nameLower}`).delete();
    } catch (err) {
      if (err.code !== 404) throw err;
    }
  }
  return { deleted: true };
}

module.exports = {
  createUser,
  findOrCreateOAuthUser,
  getByEmail,
  getById,
  accountsForEmail,
  setPlan,
  planFor,
  accountIdFor,
  getByName,
  hasPassword,
  isNameAvailable,
  updatePassword,
  upsertPasswordAccount,
  updateUserName,
  verifyPassword,
  publicUser,
  deleteUser,
};
