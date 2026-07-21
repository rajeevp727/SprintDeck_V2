'use strict';

// PSP-free UPI verification endpoints, served same-origin from the SprintDeck
// SWA api. Flow: POST /api/order → show that order's QR → the bank credit alert
// is POSTed to /api/upi/ingest (by an SMS forwarder / email reader) → the
// client polls /api/upi/status until it flips to 'confirmed'.

const { app } = require('@azure/functions');
const crypto = require('crypto');
const store = require('../payments-store');
const { parse } = require('../parse');

// Constant-time secret comparison (hash to a fixed length so neither the value
// nor its length leaks via timing). Guards the ingest endpoint.
function secretMatches(provided, expected) {
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  return crypto.timingSafeEqual(h(provided), h(expected));
}

const noCache = { 'Cache-Control': 'no-store' };

function ok(body, status = 200) {
  return { status, jsonBody: body, headers: noCache };
}
function bad(message, status = 400) {
  return { status, jsonBody: { error: message }, headers: noCache };
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

// Amounts the client may request — full plan prices and upgrade balances, each
// PLUS the ₹2 platform fee: full 201/501/1001, upgrades 302/502/802. Guards a
// tampered request. Keep in sync with platformFee in src/subscription.ts.
const allowedAmounts = new Set([201, 501, 1001, 302, 502, 802]);
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST /api/order  { tier, email?, baseAmount }
// Creates a pending order to match a payment against. The UPI QR/link (and the
// payee VPA) is built client-side from the VITE_UPI_ID build secret — the
// backend only needs the amount to match the incoming credit.
app.http('createOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'order',
  handler: async (req) => {
    if (rateLimited(req, 'order', 20, 60_000)) return bad('Too many requests — slow down', 429);

    const { tier, email, baseAmount } = await readBody(req);
    const base = Number(baseAmount);
    if (!Number.isInteger(base) || !allowedAmounts.has(base)) return bad('Invalid amount');
    if (email && !emailRe.test(String(email))) return bad('Invalid email');

    const { order } = await store.createOrder({ tier: String(tier || '').slice(0, 40), email, baseAmount: base });
    return ok({ orderId: order.id, payAmount: order.payAmount });
  },
});

// POST /api/upi/ingest   header: x-ingest-secret   body: { text, source? }
app.http('upiIngest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'upi/ingest',
  handler: async (req, context) => {
    const secret = process.env.INGEST_SECRET || '';
    if (!secret) return bad('Ingest not configured (set INGEST_SECRET)', 503);
    if (!secretMatches(req.headers.get('x-ingest-secret') || '', secret)) return bad('Unauthorized', 401);

    const { text, source } = await readBody(req);
    const parsed = parse(text);
    if (!parsed.isCredit) return ok({ matched: false, reason: 'notACredit' });
    if (parsed.amount == null) return ok({ matched: false, reason: 'noAmount' });

    const { order, duplicate } = await store.ingestCredit({
      amount: parsed.amount,
      utr: parsed.utr,
      rawText: text,
      source,
    });

    if (duplicate) return ok({ matched: false, reason: 'duplicateUtr' });
    if (!order) {
      context.log(`[ingest] unmatched credit ₹${parsed.amount} utr=${parsed.utr || '-'}`);
      return ok({ matched: false, reason: 'noPendingOrder', amount: parsed.amount });
    }
    context.log(`[ingest] confirmed order ${order.id} (${order.tier}) ₹${parsed.amount}`);
    return ok({ matched: true, orderId: order.id, tier: order.tier });
  },
});

// GET /api/subscription?orderId=...
// Authoritative subscription check. The tier is NEVER trusted from the client —
// it's derived here from the confirmed payment order in Cosmos. A subscription
// is active for 30 days from confirmation. Returns { active, tier?, at? }.
const subscriptionDays = 30;
app.http('subscriptionStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'subscription',
  handler: async (req) => {
    const orderId = req.query.get('orderId');
    if (!orderId) return ok({ active: false });
    const order = await store.getOrder(orderId);
    if (!order || order.status !== 'confirmed' || !order.confirmedAt) return ok({ active: false });
    const ageMs = Date.now() - order.confirmedAt;
    if (ageMs > subscriptionDays * 24 * 60 * 60 * 1000) return ok({ active: false });
    return ok({ active: true, tier: order.tier, at: new Date(order.confirmedAt).toISOString() });
  },
});

// GET /api/upi/status?orderId=...   ← client polls this.
app.http('upiStatus', {
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
