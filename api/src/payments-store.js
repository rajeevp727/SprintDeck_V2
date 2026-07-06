'use strict';

// Persistence for PSP-free UPI verification: pending ORDERS (a plan someone
// intends to pay for, tagged with a unique amount) and RECEIPTS (parsed bank
// credit alerts). Reuses the same Cosmos account as sessions (DB 'sprintdeck',
// container 'payments'), with an in-memory Map fallback when no connection
// string is set (local dev / tests). @azure/cosmos is required lazily.

const { sameAmount } = require('./parse');

const CONN = process.env.COSMOS_CONNECTION_STRING || '';
const DB_NAME = 'sprintdeck';
const CONTAINER_NAME = 'payments';

// A pending order reserves its unique amount for this long, then expires so the
// paise offset can be reused. Configurable via app setting.
const ORDER_TTL_MS = (Number(process.env.ORDER_TTL_MINUTES) || 30) * 60 * 1000;

const memory = new Map(); // id → record (fallback)
let containerPromise = null;

function getContainer() {
  if (!CONN) return null;
  if (!containerPromise) {
    const { CosmosClient } = require('@azure/cosmos');
    const client = new CosmosClient(CONN);
    containerPromise = (async () => {
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: DB_NAME, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: DB_NAME }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: CONTAINER_NAME,
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
  const fresh = (o) => o.type === 'order' && o.status === 'pending' && now - o.createdAt < ORDER_TTL_MS;
  const c = getContainer();
  if (c) {
    const query = "SELECT * FROM c WHERE c.type = 'order' AND c.status = 'pending'";
    const { resources } = await (await c).items.query(query).fetchAll();
    return resources.filter(fresh);
  }
  return [...memory.values()].filter(fresh);
}

// Pick the smallest unused paise offset (0..99) for this base among pending
// orders. The first/only order for a price gets the CLEAN amount (offset 0, e.g.
// ₹199.00); paise are only added to disambiguate genuine concurrent duplicates
// (₹199.01, .02 …). Offsets free up as orders confirm/expire. Returns null when
// all 100 slots for a base are in use.
function pickUniqueAmount(base, pending) {
  const used = new Set(
    pending
      .filter((o) => o.baseAmount === base)
      .map((o) => Math.round((o.payAmount - o.baseAmount) * 100)),
  );
  for (let off = 0; off <= 99; off++) {
    if (!used.has(off)) return Math.round((base + off / 100) * 100) / 100;
  }
  return null;
}

async function createOrder({ tier, email, baseAmount }) {
  const pending = await pendingOrders();
  const payAmount = pickUniqueAmount(baseAmount, pending);
  if (payAmount == null) return { error: 'no_slot' };
  const order = {
    id: genId(),
    type: 'order',
    tier,
    email: email || null,
    baseAmount,
    payAmount,
    status: 'pending', // 'pending' | 'confirmed' | 'expired'
    utr: null,
    receiptId: null,
    createdAt: Date.now(),
    confirmedAt: null,
  };
  await putRecord(order);
  return { order };
}

async function getOrder(id) {
  const rec = await getRecord(id);
  if (!rec || rec.type !== 'order') return null;
  if (rec.status === 'pending' && Date.now() - rec.createdAt >= ORDER_TTL_MS) {
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

  const pending = await pendingOrders();
  const match = pending.find((o) => sameAmount(o.payAmount, amount));
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
  pickUniqueAmount, // exported for tests
};
