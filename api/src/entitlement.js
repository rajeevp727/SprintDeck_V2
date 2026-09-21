'use strict';

/**
 * Who is calling and what their plan allows.
 *
 * The plan is read from the signed-in account, never from anything the client
 * supplies: an order id travels in the browser and can be passed around, so it
 * cannot be the thing that grants a paid feature.
 */

const users = require('./users-store');
const jwt = require('./jwt');

const TierRank = { free: 0, pro: 1, expert: 2, master: 3 };

function accountIdFromRequest(req) {
  const secret = process.env.JWT_SECRET || '';
  const token = (req.headers && req.headers.get('x-auth-token')) || '';
  const payload = token && secret ? jwt.verify(token, secret) : null;
  if (!payload) return '';
  return payload.sub || payload.email || '';
}

async function planForRequest(req) {
  const accountId = accountIdFromRequest(req);
  if (!accountId) return { active: false, tier: 'free', lifetime: false, accountId: '' };
  const user = await users.getById(accountId);
  // A device signed out by the limit keeps a valid-looking token until it
  // expires; its plan must not come with it.
  if (user && !sessionValid(req, user)) {
    return { active: false, tier: 'free', lifetime: false, accountId: '' };
  }
  return { ...users.planFor(user), accountId };
}

function sessionValid(req, user) {
  const secret = process.env.JWT_SECRET || '';
  const payload = jwt.verify((req.headers && req.headers.get('x-auth-token')) || '', secret);
  if (!payload || !payload.sid) return true;
  return users.hasSession(user, payload.sid);
}

/** True when the plan is at or above the tier a feature needs. */
function meetsTier(plan, minimum) {
  if (!plan || !plan.active) return false;
  const held = TierRank[String(plan.tier || 'free').toLowerCase()] ?? 0;
  const needed = TierRank[String(minimum || 'pro').toLowerCase()] ?? 0;
  return held >= needed;
}

/** The plan, plus whether it clears the bar — one call for a handler to use. */
async function checkTier(req, minimum) {
  const plan = await planForRequest(req);
  return { plan, allowed: meetsTier(plan, minimum) };
}

module.exports = { planForRequest, meetsTier, checkTier, accountIdFromRequest, TierRank };
