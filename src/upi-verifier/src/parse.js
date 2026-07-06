'use strict';

// Parse a bank credit alert (SMS or email body) into { isCredit, amount, utr }.
//
// We only ever act on CREDITS to the account (money received). Debit/spend
// alerts are ignored so an outgoing payment can never be mistaken for a
// received one. Amount is returned in rupees as a Number (e.g. 499.02); UTR is
// the UPI reference / RRN used for audit + dedupe.
//
// Bank SMS formats vary and change over time — these regexes are deliberately
// tolerant. When a bank tweaks its wording, adjust here (and add a test case).

// "credited", "received", "deposited" → a credit. If the text also clearly says
// "debited"/"spent"/"withdrawn", treat it as NOT a credit (debit alerts often
// mention both an available balance and the debit).
const CREDIT_RE = /\b(credited|received|deposited)\b/i;
// Only the debit VERBS — NOT the bare noun "debit", which appears in footers
// ("debit card", "credit/debit") and would wrongly reject genuine credits.
const DEBIT_RE = /\b(debited|withdrawn|spent)\b/i;

// INR 499.02 | Rs. 499.02 | Rs 499 | ₹499.02  (thousands separators allowed)
const AMOUNT_RE = /(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i;

// "UPI Ref no 412345678901", "Ref No. 4123 4567 8901", "RRN 412345678901",
// "UTR 412345678901". Falls back to a bare 12-digit run if none matched.
const UTR_LABELLED_RE = /(?:UPI\s*Ref(?:erence)?(?:\s*(?:no|number))?|Ref(?:erence)?\s*(?:no|number)?|RRN|UTR)[:.\s-]*([0-9][0-9\s]{9,21}[0-9])/i;
const UTR_BARE_RE = /\b(\d{12})\b/;

function parseAmount(text) {
  const m = AMOUNT_RE.exec(text || '');
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseUtr(text) {
  const s = text || '';
  const m = UTR_LABELLED_RE.exec(s);
  if (m) return m[1].replace(/\s/g, '');
  const b = UTR_BARE_RE.exec(s);
  return b ? b[1] : null;
}

function isCredit(text) {
  const s = text || '';
  return CREDIT_RE.test(s) && !DEBIT_RE.test(s);
}

function parse(text) {
  return {
    isCredit: isCredit(text),
    amount: parseAmount(text),
    utr: parseUtr(text),
  };
}

// Compare two rupee amounts to the paise (avoids float wobble like 499.02 !==
// 499.020000001). Returns true when they're the same to two decimals.
function sameAmount(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

module.exports = { parse, parseAmount, parseUtr, isCredit, sameAmount };
