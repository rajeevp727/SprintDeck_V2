'use strict';

/**
 * Builds the order document a plan is read from. Entitlement belongs to one
 * account: `google:someone@example.com` and `microsoft:someone@example.com`
 * are different accounts and need a grant each. A password account's id is
 * the bare email.
 */

const { parseAccountId } = require('../account-id');

const Prices = { pro: 199, expert: 499, master: 999 };

function grantOrder(accountId, tier = 'master', { lifetime = false, id } = {}) {
  const { provider, email } = parseAccountId(accountId);
  const normalizedTier = String(tier).toLowerCase();
  if (!email.includes('@')) throw new Error('account id must contain an email, e.g. google:someone@example.com');
  if (!Prices[normalizedTier]) throw new Error(`tier must be one of ${Object.keys(Prices).join(', ')}`);

  const account = provider === 'local' ? email : `${provider}:${email}`;
  const now = Date.now();
  return {
    id: id || `admin-${normalizedTier}-${account.replace(/[^a-z0-9]/g, '-')}`,
    type: 'order',
    tier: normalizedTier,
    accountId: account,
    email,
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

module.exports = { grantOrder, parseAccountId, Prices };
