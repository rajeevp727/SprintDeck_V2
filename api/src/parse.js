'use strict';

const creditRe = /\b(credited|received|deposited)\b/i;
const debitRe = /\b(debited|withdrawn|spent)\b/i;
const amountRe = /(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i;
const utrLabelledRe = /(?:UPI\s*Ref(?:erence)?(?:\s*(?:no|number))?|Ref(?:erence)?\s*(?:no|number)?|RRN|UTR)[:.\s-]*([0-9][0-9\s]{9,21}[0-9])/i;
const utrBareRe = /\b(\d{12})\b/;

function parseAmount(text) {
  const m = amountRe.exec(text || '');
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseUtr(text) {
  const s = text || '';
  const m = utrLabelledRe.exec(s);
  if (m) return m[1].replace(/\s/g, '');
  const b = utrBareRe.exec(s);
  return b ? b[1] : null;
}

function isCredit(text) {
  const s = text || '';
  return creditRe.test(s) && !debitRe.test(s);
}

function parse(text) {
  return {
    isCredit: isCredit(text),
    amount: parseAmount(text),
    utr: parseUtr(text),
  };
}

function sameAmount(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

module.exports = { parse, sameAmount };
