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

function redactBankText(text) {
  return String(text || '')
    .replace(/\b\d{10,18}\b/g, '[acct]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .slice(0, 500);
}

async function ordersForEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return [];
  const c = getContainer();
  if (c) {
    const query = {
      query: "SELECT c.id, c.type, c.tier, c.status, c.createdAt, c.confirmedAt FROM c WHERE c.type = 'order' AND c.email = @email",
      parameters: [{ name: '@email', value: normalized }],
    };
    const { resources } = await (await c).items.query(query).fetchAll();
    return resources;
  }
  return [...memory.values()].filter((r) => r.type === 'order' && r.email === normalized);
}

async function anonymizeOrdersForEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const orders = await ordersForEmail(normalized);
  for (const order of orders) {
    order.email = null;
    order.anonymizedAt = Date.now();
    await putRecord(order);
  }
}

async function ingestCredit({ amount, utr, rawText, source }) {
  const receipt = {
    id: genId(),
    type: 'receipt',
    amount,
    utr: utr || null,
    source: source || 'unknown',
    rawText: redactBankText(rawText),
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
const subscriptionWindowMs = subscriptionDays * 24 * 60 * 60 * 1000;

/** Only these emails may hold lifetime membership. Default: owner only. */
function lifetimeAllowlist() {
  const raw = process.env.LIFETIME_ALLOWLIST || 'mrrajeev18@gmail.com';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isLifetimeAllowedEmail(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return lifetimeAllowlist().includes(normalized);
}

function isLifetimeOrder(order) {
  if (!order) return false;
  const flagged = order.lifetime === true || order.grantedBy === 'admin-lifetime';
  if (!flagged) return false;
  // Lifetime flag is ignored unless the order email is on the allowlist.
  return isLifetimeAllowedEmail(order.email);
}

function isActiveConfirmedOrder(order, now = Date.now()) {
  if (!order || order.type !== 'order' || order.status !== 'confirmed' || !order.confirmedAt) {
    return false;
  }
  if (isLifetimeOrder(order)) return true;
  return now - order.confirmedAt <= subscriptionWindowMs;
}

function subscriptionPayload(order) {
  return {
    tier: order.tier,
    at: new Date(order.confirmedAt).toISOString(),
    orderId: order.id,
    lifetime: isLifetimeOrder(order),
  };
}

async function activeSubscription(orderId) {
  if (!orderId) return null;
  const order = await getOrder(orderId);
  if (!isActiveConfirmedOrder(order)) return null;
  return subscriptionPayload(order);
}

async function activeSubscriptionByEmail(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  const now = Date.now();
  const c = getContainer();
  let candidates = [];
  if (c) {
    const query = {
      query:
        "SELECT * FROM c WHERE c.type = 'order' AND c.status = 'confirmed' AND c.email = @email",
      parameters: [{ name: '@email', value: normalized }],
    };
    const { resources } = await (await c).items.query(query).fetchAll();
    candidates = resources;
  } else {
    candidates = [...memory.values()].filter(
      (rec) => rec.type === 'order' && rec.status === 'confirmed' && rec.email === normalized,
    );
  }
  const active = candidates
    .filter((order) => isActiveConfirmedOrder(order, now))
    .sort(
      (a, b) =>
        Number(isLifetimeOrder(b)) - Number(isLifetimeOrder(a)) ||
        (b.confirmedAt || 0) - (a.confirmedAt || 0) ||
        (b.seq || 0) - (a.seq || 0),
    );
  const order = active[0];
  if (!order) return null;
  return subscriptionPayload(order);
}

async function grantSubscription(email, tier, { lifetime = false } = {}) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const normalizedTier = String(tier || 'pro').toLowerCase();
  if (!['pro', 'expert', 'master'].includes(normalizedTier)) {
    return { error: 'invalid-tier' };
  }
  if (lifetime && !isLifetimeAllowedEmail(normalizedEmail)) {
    return { error: 'lifetime-not-allowed' };
  }
  const prices = { pro: 199, expert: 499, master: 999 };
  const now = Date.now();
  const order = {
    id: genId(),
    type: 'order',
    tier: normalizedTier,
    email: normalizedEmail,
    baseAmount: prices[normalizedTier],
    payAmount: prices[normalizedTier],
    status: 'confirmed',
    utr: lifetime ? 'admin-lifetime' : 'admin-grant',
    receiptId: null,
    createdAt: now,
    seq: (seq += 1),
    confirmedAt: now,
    grantedBy: lifetime ? 'admin-lifetime' : 'admin',
    lifetime: !!lifetime,
  };
  await putRecord(order);
  return { order };
}

module.exports = {
  createOrder,
  getOrder,
  ingestCredit,
  activeSubscription,
  activeSubscriptionByEmail,
  grantSubscription,
  ordersForEmail,
  anonymizeOrdersForEmail,
};
