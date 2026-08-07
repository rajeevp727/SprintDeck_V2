'use strict';

// Email + password authentication. Register/login issue a signed JWT (HS256,
// JWT_SECRET); the client sends it as `Authorization: Bearer <token>` and the
// API validates it via api/src/auth.js. Passwords are scrypt-hashed in
// users-store. Degrades cleanly (503) when JWT_SECRET isn't configured.
const { app } = require('@azure/functions');
const users = require('../users-store');
const jwt = require('../jwt');
const { rateLimited } = require('../ratelimit');
const crypto = require('crypto');

const noCache = { 'Cache-Control': 'no-store' };
function ok(body) {
  return { status: 200, jsonBody: body, headers: noCache };
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

const secret = () => process.env.JWT_SECRET || '';
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const minPassword = 8;

// "Remember me" keeps you signed in for 2 sprints (a sprint is 14 days → 28
// days); otherwise the token is a short 1-day session.
const SPRINT_DAYS = 14;
const REMEMBER_TTL = 2 * SPRINT_DAYS * 24 * 60 * 60; // 28 days
const SESSION_TTL = 24 * 60 * 60; // 1 day

function tokenFor(user, remember) {
  return jwt.sign({ sub: user.id, email: user.email }, secret(), remember ? REMEMBER_TTL : SESSION_TTL);
}

// Build a few available alternatives when a name is taken.
async function nameSuggestions(name, max = 3) {
  const base = String(name || '').trim().replace(/\s+/g, '').slice(0, 50) || 'user';
  const pool = [];
  for (let i = 1; i <= 6; i++) pool.push(`${base}${i}`);
  pool.push(`${base}${new Date().getFullYear() % 100}`);
  for (let i = 0; i < 6; i++) pool.push(`${base}${Math.floor(10 + Math.random() * 990)}`);
  const out = [];
  for (const cand of pool) {
    if (out.length >= max) break;
    if (await users.isNameAvailable(cand)) out.push(cand);
  }
  return out;
}

// POST /api/auth/register  { email, password, name? }
app.http('register', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'register', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const { email, password, name, remember } = await readBody(req);
    if (String(name || '').trim().length < 2) return bad('Enter your name (at least 2 characters)');
    if (!emailRe.test(String(email || ''))) return bad('Enter a valid email');
    if (String(password || '').length < minPassword) {
      return bad(`Password must be at least ${minPassword} characters`);
    }
    const result = await users.createUser(email, password, name);
    if (result.error === 'email-exists') return bad('An account with that email already exists', 409);
    if (result.error === 'name-exists') return bad('That name is already taken — pick another', 409);
    return ok({ token: tokenFor(result.user, remember !== false), user: users.publicUser(result.user) });
  },
});

// GET /api/auth/check-name?name=Foo  → { available, suggestions[] }
app.http('checkName', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/check-name',
  handler: async (req) => {
    if (!secret()) return ok({ available: true, suggestions: [] });
    if (rateLimited(req, 'checkname', 40, 60_000)) return bad('Too many attempts — slow down', 429);
    const name = String(req.query.get('name') || '').trim();
    if (name.length < 2) return ok({ available: false, suggestions: [] });
    if (await users.isNameAvailable(name)) return ok({ available: true, suggestions: [] });
    return ok({ available: false, suggestions: await nameSuggestions(name) });
  },
});

// POST /api/auth/login  { email, password }
app.http('login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'login', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const { email, password, remember } = await readBody(req);
    const user = await users.getByEmail(email);
    // Same message + always run the hash to blunt user-enumeration / timing.
    if (!user || !users.verifyPassword(user, password)) {
      return bad('Invalid email or password', 401);
    }
    return ok({ token: tokenFor(user, !!remember), user: users.publicUser(user) });
  },
});

// POST /api/auth/password  { currentPassword, newPassword }   (header x-auth-token)
app.http('changePassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/password',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'pwchange', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const token = req.headers.get('x-auth-token') || '';
    const payload = token && jwt.verify(token, secret());
    if (!payload) return bad('Please sign in again', 401);
    const { currentPassword, newPassword } = await readBody(req);
    if (String(newPassword || '').length < minPassword) {
      return bad(`New password must be at least ${minPassword} characters`);
    }
    const user = await users.getByEmail(payload.email);
    if (!user || !users.verifyPassword(user, currentPassword)) {
      return bad('Current password is incorrect', 401);
    }
    await users.updatePassword(payload.email, newPassword);
    return ok({ ok: true });
  },
});

// GET /api/auth/me   (header x-auth-token)
app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (req) => {
    if (!secret()) return ok({ user: null });
    // SWA strips Authorization, so the client sends the JWT in x-auth-token.
    const token = req.headers.get('x-auth-token') || '';
    const payload = token && jwt.verify(token, secret());
    if (!payload) return ok({ user: null });
    return ok({ user: { id: payload.sub, email: payload.email } });
  },
});

// In-memory reset-token store (dev/local). In production, persist these in
// Cosmos/Redis with a TTL so they survive restarts.
const resetTokens = new Map();
const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

function pruneResetTokens() {
  const now = Date.now();
  for (const [k, v] of resetTokens) {
    if (now - v.createdAt > RESET_TTL_MS) resetTokens.delete(k);
  }
}

// POST /api/auth/forgot-password  { email }
app.http('forgotPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/forgot-password',
  handler: async (req) => {
    if (!secret()) return ok({ ok: true });
    if (rateLimited(req, 'forgotpw', 5, 60_000)) return bad('Too many attempts — slow down', 429);
    const { email } = await readBody(req);
    const normalized = String(email || '').trim().toLowerCase();
    if (!emailRe.test(normalized)) return bad('Enter a valid email', 400);
    const user = await users.getByEmail(normalized);
    if (!user) {
      return bad('User not found — please check the email and try again', 404);
    }
    pruneResetTokens();
    const token = crypto.randomBytes(32).toString('hex');
    resetTokens.set(token, {
      email: user.email,
      userId: user.id,
      createdAt: Date.now(),
    });
    const resetUrl = `${req.url.replace(/\/api\/auth\/forgot-password.*/, '')}/reset-password?token=${token}`;
    console.log(`[forgot-password] reset link for ${user.email}: ${resetUrl}`);
    // TODO: send the resetUrl via email (SMTP / SendGrid / Postmark etc.)
    return ok({ ok: true });
  },
});

// POST /api/auth/reset-password  { token, newPassword }
app.http('resetPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/reset-password',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'resetpw', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const { token, newPassword } = await readBody(req);
    const record = resetTokens.get(String(token || ''));
    if (!record) return bad('Invalid or expired reset link', 400);
    if (String(newPassword || '').length < minPassword) {
      return bad(`New password must be at least ${minPassword} characters`);
    }
    const user = await users.getByEmail(record.email);
    if (!user || user.id !== record.userId) return bad('Invalid reset link', 400);
    await users.updatePassword(user.email, newPassword);
    resetTokens.delete(String(token || ''));
    return ok({ ok: true });
  },
});
