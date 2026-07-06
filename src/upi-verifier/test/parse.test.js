'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, parseAmount, parseUtr, isCredit, sameAmount } = require('../src/parse');
const { createOrder, getOrder, ingestCredit } = require('../src/store');

// ── Real-world-ish Axis credit alerts ──────────────────────────────────────
test('parses a standard Axis UPI credit SMS', () => {
  const sms = 'INR 499.02 credited to A/c no. XX1234 on 06-07-26 UPI Ref no 412345678901. -Axis Bank';
  const r = parse(sms);
  assert.equal(r.isCredit, true);
  assert.equal(r.amount, 499.02);
  assert.equal(r.utr, '412345678901');
});

test('parses "Rs." with no decimals and spaced ref', () => {
  const sms = 'Rs. 199 received in your account. Ref No. 4123 4567 8901';
  const r = parse(sms);
  assert.equal(r.amount, 199);
  assert.equal(r.utr, '412345678901');
});

test('handles the ₹ symbol and thousands separator', () => {
  const r = parse('₹1,499.50 deposited via UPI RRN 998877665544');
  assert.equal(r.amount, 1499.5);
  assert.equal(r.utr, '998877665544');
});

// ── Guards: never treat a debit / spend as a received payment ───────────────
test('ignores a debit alert', () => {
  const sms = 'INR 499.00 debited from A/c XX1234 UPI Ref no 412345678901';
  assert.equal(isCredit(sms), false);
  assert.equal(parse(sms).isCredit, false);
});

test('a credit email is still a credit despite a "debit card" footer', () => {
  const email =
    'INR 199.00 was credited to your A/c XX3210 via UPI. UPI Ref no 419718452037. ' +
    'Never share your debit card/OTP with anyone. -Axis Bank';
  assert.equal(isCredit(email), true);
  assert.equal(parse(email).amount, 199);
});

test('amount missing → null, not a throw', () => {
  assert.equal(parseAmount('Your OTP is 4567'), null);
});

test('utr falls back to a bare 12-digit run', () => {
  assert.equal(parseUtr('credited 400000000001 today'), '400000000001');
});

// ── Paise-exact amount comparison ───────────────────────────────────────────
test('sameAmount compares to the paise', () => {
  assert.equal(sameAmount(499.02, 499.02), true);
  assert.equal(sameAmount(499.02, 499.03), false);
  assert.equal(sameAmount(199, 199.0), true);
});

// ── Order + ingest (in-memory store, no Cosmos) ─────────────────────────────
test('createOrder uses the clean plan price as the payable amount', async () => {
  const { order } = await createOrder({ tier: 'pro', baseAmount: 199 });
  assert.equal(order.payAmount, 199);
  assert.equal(order.status, 'pending');
});

test('ingesting a matching credit confirms the order', async () => {
  const { order } = await createOrder({ tier: 'expert', baseAmount: 499 });
  const { order: matched } = await ingestCredit({
    amount: 499,
    utr: '700070007000',
    rawText: 'INR 499.00 credited UPI Ref no 700070007000',
    source: 'test',
  });
  assert.equal(matched.id, order.id);
  const after = await getOrder(order.id);
  assert.equal(after.status, 'confirmed');
});

test('ingest matches the MOST RECENT pending order of that amount', async () => {
  const { order: first } = await createOrder({ tier: 'pro', baseAmount: 999 });
  const { order: second } = await createOrder({ tier: 'master', baseAmount: 999 });
  const { order: matched } = await ingestCredit({
    amount: 999,
    utr: '800080008000',
    rawText: 'INR 999.00 credited UPI Ref no 800080008000',
    source: 'test',
  });
  assert.equal(matched.id, second.id); // newest wins
  assert.notEqual(matched.id, first.id);
});
