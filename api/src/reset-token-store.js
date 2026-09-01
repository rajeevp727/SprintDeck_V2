'use strict';

const crypto = require('crypto');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = process.env.COSMOS_DB_NAME || 'sprintdeck';
const containerName = 'users';
const RESET_TTL_SEC = 30 * 60;

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

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function saveResetToken(email, userId) {
  const token = createToken();
  const rec = {
    id: `reset:${token}`,
    type: 'reset-token',
    token,
    email: String(email || '').trim().toLowerCase(),
    userId,
    createdAt: Date.now(),
    ttl: RESET_TTL_SEC,
  };
  const c = getContainer();
  if (c) {
    await (await c).items.upsert(rec);
  } else {
    memory.set(rec.id, rec);
  }
  return token;
}

async function consumeResetToken(token) {
  const key = `reset:${String(token || '')}`;
  const c = getContainer();
  let rec = null;
  if (c) {
    try {
      const { resource } = await (await c).item(key, key).read();
      rec = resource || null;
    } catch (err) {
      if (err.code !== 404) throw err;
    }
    if (rec) {
      try {
        await (await c).item(key, key).delete();
      } catch (err) {
        if (err.code !== 404) throw err;
      }
    }
  } else {
    rec = memory.get(key) || null;
    memory.delete(key);
  }
  if (!rec || rec.type !== 'reset-token') return null;
  if (Date.now() - rec.createdAt > RESET_TTL_SEC * 1000) return null;
  return { email: rec.email, userId: rec.userId };
}

module.exports = { saveResetToken, consumeResetToken };
