'use strict';

/**
 * An account id carries the provider that owns it: `google:you@example.com`.
 * A password account is the bare email, so it has no prefix.
 */
const Providers = ['google', 'microsoft', 'local'];

function parseAccountId(accountId) {
  const raw = String(accountId || '').trim().toLowerCase();
  const [head, ...rest] = raw.split(':');
  if (rest.length && Providers.includes(head)) {
    return { provider: head, email: rest.join(':') };
  }
  return { provider: 'local', email: raw };
}

module.exports = { parseAccountId, Providers };
