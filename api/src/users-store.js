'use strict';

const crypto = require('crypto');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
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

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name || '' };
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

module.exports = { createUser, getByEmail, getByName, isNameAvailable, updatePassword, updateUserName, verifyPassword, publicUser, deleteUser };
