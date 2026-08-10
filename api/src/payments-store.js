'use strict';

const crypto = require('crypto');
const { sameAmount } = require('./parse');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'payments';

const orderTtlMs = (Number(process.env.ORDER_TTL_MINUTES) || 30) * 60 * 1000;

const memory = new Map(); 
let containerPromise = null;
let seq = 0; 

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

function genId() {
  return crypto.randomUUID();
}

async function putRecord(rec) {
  const c = getContainer();
  if (c) {
    await (await c).items.upsert(rec);
  } else {
    memory.set(rec.id, rec);
  }
  return rec;
}

async function getRecord(id) {
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

async function pendingOrders() {
  const now = Date.now();
  const fresh = (o) => o.type === 'order' && o.status === 'pending' && now - o.createdAt < orderTtlMs;
  const c = getContainer();
  if (c) {
    const query = "SELECT * FROM c WHERE c.type = 'order' AND c.status = 'pending'";
    const { resources } = await (await c).items.query(query).fetchAll();
    return resources.filter(fresh);
  }
  return [...memory.values()].filter(fresh);
}

async function createOrder({ tier, email, baseAmount }) {
  
  
  
  const order = {
    id: genId(),
    type: 'order',
    tier,
    email: email || null,
    baseAmount,
    payAmount: baseAmount,
    status: 'pending', 
    utr: null,
    receiptId: null,
    createdAt: Date.now(),
    seq: (seq += 1),
    confirmedAt: null,
  };
  await putRecord(order);
  return { order };
}

async function getOrder(id) {
  const rec = await getRecord(id);
  if (!rec || rec.type !== 'order') return null;
  if (rec.status === 'pending' && Date.now() - rec.createdAt >= orderTtlMs) {
    rec.status = 'expired';
    await putRecord(rec);
  }
  return rec;
}

async function findReceiptByUtr(utr) {
  const c = getContainer();
  if (c) {
    const query = {
      query: "SELECT * FROM c WHERE c.type = 'receipt' AND c.utr = @utr",
      parameters: [{ name: '@utr', value: utr }],
    };
    const { resources } = await (await c).items.query(query).fetchAll();
    return resources[0] || null;
  }
  for (const rec of memory.values()) {
    if (rec.type === 'receipt' && rec.utr === utr && !rec.duplicateOf) return rec;
  }
  return null;
}

async function ingestCredit({ amount, utr, rawText, source }) {
  const receipt = {
    id: genId(),
    type: 'receipt',
    amount,
    utr: utr || null,
    source: source || 'unknown',
    rawText: String(rawText || '').slice(0, 1000),
    matchedOrderId: null,
    receivedAt: Date.now(),
  };

  const already = utr ? await findReceiptByUtr(utr) : null;
  if (already) {
    receipt.duplicateOf = already.id;
    await putRecord(receipt);
    return { receipt, order: null, duplicate: true };
  }

  
  
  const pending = await pendingOrders();
  const match = pending
    .filter((o) => sameAmount(o.payAmount, amount))
    .sort((a, b) => b.createdAt - a.createdAt || (b.seq || 0) - (a.seq || 0))[0] || null;
  await putRecord(receipt);

  if (!match) return { receipt, order: null };

  match.status = 'confirmed';
  match.utr = utr || null;
  match.receiptId = receipt.id;
  match.confirmedAt = Date.now();
  await putRecord(match);

  receipt.matchedOrderId = match.id;
  await putRecord(receipt);

  return { receipt, order: match };
}

const subscriptionDays = 30;
async function activeSubscription(orderId) {
  if (!orderId) return null;
  const order = await getOrder(orderId);
  if (!order || order.status !== 'confirmed' || !order.confirmedAt) return null;
  if (Date.now() - order.confirmedAt > subscriptionDays * 24 * 60 * 60 * 1000) return null;
  return { tier: order.tier, at: new Date(order.confirmedAt).toISOString() };
}

async function grantSubscription(email, tier) {
  const normalizedTier = String(tier || 'pro').toLowerCase();
  if (!['pro', 'expert', 'master'].includes(normalizedTier)) {
    return { error: 'invalid-tier' };
  }
  const prices = { pro: 199, expert: 499, master: 999 };
  const now = Date.now();
  const order = {
    id: genId(),
    type: 'order',
    tier: normalizedTier,
    email: email ? String(email).trim().toLowerCase() : null,
    baseAmount: prices[normalizedTier],
    payAmount: prices[normalizedTier],
    status: 'confirmed',
    utr: 'admin-grant',
    receiptId: null,
    createdAt: now,
    seq: (seq += 1),
    confirmedAt: now,
    grantedBy: 'admin',
  };
  await putRecord(order);
  return { order };
}

module.exports = {
  createOrder,
  getOrder,
  ingestCredit,
  activeSubscription,
  grantSubscription,
};
