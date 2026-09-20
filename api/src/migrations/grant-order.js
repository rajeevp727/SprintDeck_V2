'use strict';

/**
 * Builds the order document that grants a plan. Entitlement is read from
 * confirmed orders in `payments`, keyed by email — never from the user record.
 *
 * Paste the result into Data Explorer, or write it with the migrate CLI.
 */

const Prices = { pro: 199, expert: 499, master: 999 };

function grantOrder(email, tier = 'master', { lifetime = false, id } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedTier = String(tier).toLowerCase();
  if (!normalizedEmail.includes('@')) throw new Error('a valid email is required');
  if (!Prices[normalizedTier]) throw new Error(`tier must be one of ${Object.keys(Prices).join(', ')}`);

  const now = Date.now();
  return {
    id: id || `admin-${normalizedTier}-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}`,
    type: 'order',
    tier: normalizedTier,
    email: normalizedEmail,
    baseAmount: Prices[normalizedTier],
    payAmount: Prices[normalizedTier],
    status: 'confirmed',
    utr: lifetime ? 'admin-lifetime' : 'admin-grant',
    receiptId: null,
    createdAt: now,
    confirmedAt: now,
    seq: 1,
    grantedBy: lifetime ? 'admin-lifetime' : 'admin',
    lifetime: !!lifetime,
  };
}

module.exports = { grantOrder, Prices };
