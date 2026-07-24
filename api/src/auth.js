'use strict';

// Resolve the authenticated user from the Authorization: Bearer <JWT> header,
// verified with JWT_SECRET (see jwt.js / functions/auth.js). Returns
// { userId, email } or null. This is the trustworthy identity to authorize
// privileged actions with — wired into endpoints as auth enforcement lands.
const jwt = require('./jwt');

function getUser(req) {
  const secret = process.env.JWT_SECRET || '';
  if (!secret) return null;
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return null;
  const payload = jwt.verify(match[1], secret);
  if (!payload || !payload.sub) return null;
  return { userId: payload.sub, email: payload.email };
}

module.exports = { getUser };
