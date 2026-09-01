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

async function pickAvailableName(preferred) {
  const base = uniqueNameFromBase(preferred);
  if (await isNameAvailable(base)) return base;
  for (let i = 1; i <= 20; i++) {
    const cand = `${base.replace(/\d+$/, '')}${i}`.slice(0, 80);
    if (await isNameAvailable(cand)) return cand;
  }
  return `${base.slice(0, 70)}${Math.floor(1000 + Math.random() * 9000)}`;
}

async function findOrCreateOAuthUser({ email, name, provider, providerSub }) {
  const id = normalizeEmail(email);
  if (!id) return { error: 'invalid-email' };
  if (!providerSub) return { error: 'invalid-provider' };

  const existing = await getByEmail(id);
  if (existing) {
    if (existing.providerSub && existing.authProvider && existing.authProvider !== provider) {
      return { error: 'email-exists-other-provider' };
    }
    if (existing.providerSub && existing.providerSub !== providerSub) {
      return { error: 'email-exists' };
    }
    if (!existing.providerSub) {
      existing.authProvider = provider;
      existing.providerSub = providerSub;
      if (!existing.name && name) existing.name = uniqueNameFromBase(name);
      if (!existing.nameLower && existing.name) existing.nameLower = normalizeName(existing.name);
      const c = getContainer();
      if (c) await (await c).items.upsert(existing);
      else memory.set(existing.id, existing);
    }
    return { user: existing };
  }

  const cleanName = await pickAvailableName(name || id.split('@')[0]);
  const nameLower = normalizeName(cleanName);
  const user = {
    id,
    email: id,
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

async function isNameAvailable(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return !(await getByName(name));
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
  getByName,
  hasPassword,
  isNameAvailable,
  updatePassword,
  updateUserName,
  verifyPassword,
  publicUser,
  deleteUser,
};
