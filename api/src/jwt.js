'use strict';

// Minimal, dependency-free HS256 JWT (sign + verify) using Node's crypto.
// Only HS256 is accepted (no alg-confusion), signatures are compared in constant
// time, and expiry is enforced. The signing secret is the JWT_SECRET app setting.
const crypto = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encodeJson(obj) {
  return b64url(JSON.stringify(obj));
}

const defaultTtlSeconds = 7 * 24 * 60 * 60; // 7 days

function sign(payload, secret, ttlSeconds = defaultTtlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJson({ ...payload, iat: now, exp: now + ttlSeconds });
  const data = `${header}.${body}`;
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

function verify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  const got = Buffer.from(parts[2]);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'HS256') return null;
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) return null;
  return payload;
}

module.exports = { sign, verify };
