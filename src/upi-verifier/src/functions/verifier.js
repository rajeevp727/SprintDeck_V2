'use strict';

const { app } = require('@azure/functions');
const crypto = require('crypto');
const store = require('../store');
const { parse } = require('../parse');

// Constant-time secret comparison (hash to a fixed length so neither the value
// nor its length leaks via timing). Guards the ingest endpoint.
function secretMatches(provided, expected) {
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  return crypto.timingSafeEqual(h(provided), h(expected));
}

const NO_CACHE = { 'Cache-Control': 'no-store' };

function ok(body, status = 200) {
  return { status, jsonBody: body, headers: NO_CACHE };
}
function bad(message, status = 400) {
  return { status, jsonBody: { error: message }, headers: NO_CACHE };
}

async function readBody(req) {
  try {
    return (await req.json()) || {};
  } catch {
    return {};
  }
}

// Best-effort in-memory per-IP rate limit (per Function instance).
const _rlHits = new Map();
function rateLimited(req, bucket, max, windowMs) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (_rlHits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  _rlHits.set(key, recent);
  return recent.length > max;
}

const VPA = process.env.UPI_VPA || '';
const PAYEE = process.env.PAYEE_NAME || 'SprintDeck';
// Amounts the caller is allowed to request an order for (base rupees). Guards
// against a tampered client asking to "pay" ₹1 for a ₹999 plan.
const ALLOWED_AMOUNTS = new Set([199, 499, 999]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Build a UPI intent link. The VPA (`pa`) is left LITERAL — several UPI apps
// throw a "temporary technical issue" if `@` is percent-encoded (%40), which is
// what URLSearchParams does. Only human-text fields are encoded, with %20.
function upiLink(payAmount, note) {
  const parts = [
    `pa=${VPA}`,
    `pn=${encodeURIComponent(PAYEE)}`,
    `am=${payAmount.toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ];
  return `upi://pay?${parts.join('&')}`;
}

// GET /api/health
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ok({ status: 'ok', service: 'upi-verifier', configured: !!VPA }),
});

// POST /api/order  { tier, email, baseAmount }
// Creates a pending order with a unique payable amount and returns the UPI link.
app.http('createOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'order',
  handler: async (req) => {
    if (!VPA) return bad('Payments not configured (set UPI_VPA)', 503);
    if (rateLimited(req, 'order', 20, 60_000)) return bad('Too many requests — slow down', 429);

    const { tier, email, baseAmount } = await readBody(req);
    const base = Number(baseAmount);
    if (!Number.isInteger(base) || !ALLOWED_AMOUNTS.has(base)) {
      return bad('Invalid amount');
    }
    if (email && !EMAIL_RE.test(String(email))) return bad('Invalid email');

    const { order } = await store.createOrder({ tier: String(tier || '').slice(0, 40), email, baseAmount: base });
    const note = `${PAYEE} ${order.tier || ''}`.trim();
    return ok({
      orderId: order.id,
      payAmount: order.payAmount,
      vpa: VPA,
      upiLink: upiLink(order.payAmount, note),
    });
  },
});

// POST /api/upi/ingest   header: x-ingest-secret
// Body: { text, source? }   ← raw bank SMS / email body forwarded here.
app.http('ingest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'upi/ingest',
  handler: async (req, context) => {
    const secret = process.env.INGEST_SECRET || '';
    if (!secret) return bad('Ingest not configured (set INGEST_SECRET)', 503);
    if (!secretMatches(req.headers.get('x-ingest-secret') || '', secret)) return bad('Unauthorized', 401);

    const { text, source } = await readBody(req);
    const parsed = parse(text);
    if (!parsed.isCredit) return ok({ matched: false, reason: 'not_a_credit' });
    if (parsed.amount == null) return ok({ matched: false, reason: 'no_amount' });

    const { order, duplicate } = await store.ingestCredit({
      amount: parsed.amount,
      utr: parsed.utr,
      rawText: text,
      source,
    });

    if (duplicate) return ok({ matched: false, reason: 'duplicate_utr' });
    if (!order) {
      context.log(`[ingest] unmatched credit ₹${parsed.amount} utr=${parsed.utr || '-'}`);
      return ok({ matched: false, reason: 'no_pending_order', amount: parsed.amount });
    }
    context.log(`[ingest] confirmed order ${order.id} (${order.tier}) ₹${parsed.amount}`);
    return ok({ matched: true, orderId: order.id, tier: order.tier });
  },
});

// GET /api/upi/status?orderId=...   ← client polls this.
app.http('status', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'upi/status',
  handler: async (req) => {
    const orderId = req.query.get('orderId');
    if (!orderId) return bad('orderId required');
    const order = await store.getOrder(orderId);
    if (!order) return bad('Order not found', 404);
    return ok({
      orderId: order.id,
      status: order.status, // 'pending' | 'confirmed' | 'expired'
      tier: order.tier,
      payAmount: order.payAmount,
      confirmedAt: order.confirmedAt,
    });
  },
});
