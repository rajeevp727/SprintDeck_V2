'use strict';

// Persistence for PSP-free UPI verification: pending ORDERS (a plan someone
// intends to pay for, tagged with a unique amount) and RECEIPTS (parsed bank
// credit alerts). Reuses the same Cosmos account as sessions (DB 'sprintdeck',
// container 'payments'), with an in-memory Map fallback when no connection
// string is set (local dev / tests). @azure/cosmos is required lazily.

const { sameAmount } = require('./parse');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'payments';

// A pending order reserves its unique amount for this long, then expires so the
// paise offset can be reused. Configurable via app setting.
const orderTtlMs = (Number(process.env.ORDER_TTL_MINUTES) || 30) * 60 * 1000;

const memory = new Map(); // id → record (fallback)
let containerPromise = null;
let seq = 0; // monotonic tiebreaker for orders created in the same millisecond

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
      containerPromise = null; // don't cache a failed init — retry next request
      throw e;
    });
  }
  return containerPromise;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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

// All currently-pending orders (not yet confirmed, not expired).
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
  // The payable amount is exactly the plan price (clean ₹199 / ₹499 / ₹999).
  // Incoming credits are matched to the most-recent pending order of that
  // amount (see ingestCredit) — no paise-tagging.
  const order = {
    id: genId(),
    type: 'order',
    tier,
    email: email || null,
    baseAmount,
    payAmount: baseAmount,
    status: 'pending', // 'pending' | 'confirmed' | 'expired'
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

// Ingest a parsed credit: store the receipt (always, for audit) and try to
// match it to a pending order by exact amount. Returns { receipt, order?, duplicate? }.
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

  // Dedupe: the same UTR ingested twice (SMS + email, or a retry) must not
  // confirm two orders.
  const already = utr ? await findReceiptByUtr(utr) : null;
  if (already) {
    receipt.duplicateOf = already.id;
    await putRecord(receipt);
    return { receipt, order: null, duplicate: true };
  }

  // Match the MOST RECENT pending order of this amount — that's the one the
  // payer is most likely settling now. Older unpaid orders for the same price
  // stay pending and expire on their own.
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

module.exports = {
  createOrder,
  getOrder,
  ingestCredit,
};
