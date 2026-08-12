'use strict';

const { app } = require('@azure/functions');
const users = require('../users-store');
const jwt = require('../jwt');
const { rateLimited } = require('../ratelimit');
const { audit } = require('../audit');
const payments = require('../payments-store');
const resetTokenStore = require('../reset-token-store');
const { sendPasswordResetEmail, isEmailConfigured } = require('../email');

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

const SPRINT_DAYS = 14;
const REMEMBER_TTL = 2 * SPRINT_DAYS * 24 * 60 * 60;
const SESSION_TTL = 24 * 60 * 60;

function tokenFor(user, remember) {
  return jwt.sign({ sub: user.id, email: user.email }, secret(), remember ? REMEMBER_TTL : SESSION_TTL);
}

function appBaseUrl(req) {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/$/, '');
  const host = process.env.WEBSITE_HOSTNAME;
  if (host) return `https://${host}`;
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch { void 0; }
  }
  return 'https://green-desert-0f2350910.7.azurestaticapps.net';
}

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

app.http('register', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: async (req, context) => {
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
    audit(context, 'auth.register', { email: result.user.email });
    return ok({ token: tokenFor(result.user, remember !== false), user: users.publicUser(result.user) });
  },
});

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

app.http('login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (req, context) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'login', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const { email, password, remember } = await readBody(req);
    const user = await users.getByEmail(email);
    if (!user || !users.verifyPassword(user, password)) {
      audit(context, 'auth.login.failed', { email });
      return bad('Invalid email or password', 401);
    }
    audit(context, 'auth.login', { email: user.email });
    return ok({ token: tokenFor(user, !!remember), user: users.publicUser(user) });
  },
});

app.http('changePassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/password',
  handler: async (req, context) => {
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
      audit(context, 'auth.password.failed', { email: payload.email });
      return bad('Current password is incorrect', 401);
    }
    await users.updatePassword(payload.email, newPassword);
    audit(context, 'auth.password.changed', { email: payload.email });
    return ok({ ok: true });
  },
});

app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (req) => {
    if (!secret()) return ok({ user: null });
    
    const token = req.headers.get('x-auth-token') || '';
    const payload = token && jwt.verify(token, secret());
    if (!payload) return ok({ user: null });
    const user = await users.getByEmail(payload.email);
    return ok({ user: user ? users.publicUser(user) : null });
  },
});

app.http('updateProfile', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/profile',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'profile', 15, 60_000)) return bad('Too many attempts — slow down', 429);
    const token = req.headers.get('x-auth-token') || '';
    const payload = token && jwt.verify(token, secret());
    if (!payload) return bad('Please sign in again', 401);
    const { name } = await readBody(req);
    if (String(name || '').trim().length < 2) return bad('Enter your name (at least 2 characters)');
    const result = await users.updateUserName(payload.email, name);
    if (!result) return bad('Account not found', 404);
    if (result.error === 'name-exists') return bad('That name is already taken — pick another', 409);
    if (result.error === 'name-too-short') return bad('Enter your name (at least 2 characters)');
    return ok({ user: users.publicUser(result.user) });
  },
});

app.http('forgotPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/forgot-password',
  handler: async (req, context) => {
    if (!secret()) return ok({ ok: true });
    if (!isEmailConfigured()) {
      context.error('[forgot-password] Email not configured — set RESEND_API_KEY or SENDGRID_API_KEY in Azure');
      return bad('Password reset email is not configured yet. Contact support or change your password while signed in.', 503);
    }
    if (rateLimited(req, 'forgotpw', 5, 60_000)) return bad('Too many attempts — slow down', 429);
    const { email } = await readBody(req);
    const normalized = String(email || '').trim().toLowerCase();
    if (!emailRe.test(normalized)) return bad('Enter a valid email', 400);
    const user = await users.getByEmail(normalized);
    if (user) {
      const token = await resetTokenStore.saveResetToken(user.email, user.id);
      const resetUrl = `${appBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
        context.log(`[forgot-password] reset email sent to ${normalized.slice(0, 2)}***`);
        audit(context, 'auth.forgot-password', { email: user.email });
      } catch (err) {
        context.error(`[forgot-password] email failed: ${(err && err.message) || err}`);
        return bad('Could not send reset email — try again in a few minutes', 502);
      }
    }
    return ok({ ok: true });
  },
});

app.http('resetPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/reset-password',
  handler: async (req, context) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'resetpw', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const { token, newPassword } = await readBody(req);
    const record = await resetTokenStore.consumeResetToken(String(token || ''));
    if (!record) return bad('Invalid or expired reset link', 400);
    if (String(newPassword || '').length < minPassword) {
      return bad(`New password must be at least ${minPassword} characters`);
    }
    const user = await users.getByEmail(record.email);
    if (!user || user.id !== record.userId) return bad('Invalid reset link', 400);
    await users.updatePassword(user.email, newPassword);
    audit(context, 'auth.password.reset', { email: user.email });
    return ok({ ok: true });
  },
});

app.http('deleteAccount', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'auth/account',
  handler: async (req, context) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'deleteacct', 5, 60_000)) return bad('Too many attempts — slow down', 429);
    const token = req.headers.get('x-auth-token') || '';
    const payload = token && jwt.verify(token, secret());
    if (!payload) return bad('Please sign in again', 401);
    const { password } = await readBody(req);
    const user = await users.getByEmail(payload.email);
    if (!user || !users.verifyPassword(user, password)) {
      return bad('Password is incorrect', 401);
    }
    await payments.anonymizeOrdersForEmail(user.email);
    const result = await users.deleteUser(user.email);
    if (!result) return bad('Account not found', 404);
    audit(context, 'auth.account.deleted', { email: user.email });
    return ok({ deleted: true });
  },
});

app.http('exportAccount', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/export',
  handler: async (req, context) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'export', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const token = req.headers.get('x-auth-token') || '';
    const payload = token && jwt.verify(token, secret());
    if (!payload) return bad('Please sign in again', 401);
    const user = await users.getByEmail(payload.email);
    if (!user) return bad('Account not found', 404);
    const orders = await payments.ordersForEmail(user.email);
    audit(context, 'auth.account.export', { email: user.email });
    return ok({
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      format: 'application/json',
      includes: ['account profile', 'subscription / order history'],
      excludes: [
        'password hashes',
        'authentication tokens',
        'ephemeral ceremony session data',
        'payment card / UPI secrets',
      ],
      account: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
      },
      subscriptions: orders.map((o) => ({
        orderId: o.id,
        tier: o.tier,
        status: o.status,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
        confirmedAt: o.confirmedAt ? new Date(o.confirmedAt).toISOString() : null,
      })),
    });
  },
});
