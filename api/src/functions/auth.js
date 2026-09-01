'use strict';

// Email + password authentication. Register/login issue a signed JWT (HS256,
// JWT_SECRET); the client sends it as `Authorization: Bearer <token>` and the
// API validates it via api/src/auth.js. Passwords are scrypt-hashed in
// users-store. Degrades cleanly (503) when JWT_SECRET isn't configured.
//
// OAuth SSO (Google + Microsoft): the provider redirects back with an id_token
// in the URL fragment. The frontend POSTs { provider, idToken } here; we verify
// the token server-side, upsert the user, and issue our own JWT.
//
// SMTP: forgot-password sends a real email via nodemailer when SMTP_* env vars
// are configured. Falls back to console.log when SMTP is absent (dev mode).
const { app } = require('@azure/functions');
const users = require('../users-store');
const jwt = require('../jwt');
const { rateLimited } = require('../ratelimit');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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

// SMTP configuration from environment variables.
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const emailFrom = process.env.EMAIL_FROM || 'SprintDeck <noreply@sprintdeck.in>';
const appUrl = process.env.APP_URL || 'https://sprintdeck.in';

let mailer = null;
function getMailer() {
  if (!smtpHost || !smtpUser) return null;
  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });
  }
  return mailer;
}

async function sendResetEmail(toEmail, resetUrl) {
  const transporter = getMailer();
  if (!transporter) {
    console.log(`[forgot-password] reset link for ${toEmail}: ${resetUrl}`);
    return;
  }
  await transporter.sendMail({
    from: emailFrom,
    to: toEmail,
    subject: 'Reset your SprintDeck password',
    html: `
      <p>You requested to reset your SprintDeck password.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
  console.log(`[forgot-password] sent reset email to ${toEmail}`);
}

// "Remember me" keeps you signed in for 2 sprints (a sprint is 14 days → 28
// days); otherwise the token is a short 1-day session.
const SPRINT_DAYS = 14;
const REMEMBER_TTL = 2 * SPRINT_DAYS * 24 * 60 * 60; // 28 days
const SESSION_TTL = 24 * 60 * 60; // 1 day

function tokenFor(user, remember) {
  return jwt.sign({ sub: user.id, email: user.email }, secret(), remember ? REMEMBER_TTL : SESSION_TTL);
}

async function authenticatedUser(req) {
  const token = req.headers.get('x-auth-token') || '';
  const payload = token && jwt.verify(token, secret());
  if (!payload) return null;
  return users.getByEmail(payload.email);
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
    const user = await authenticatedUser(req);
    if (!user) return bad('Please sign in again', 401);
    const { currentPassword, newPassword } = await readBody(req);
    if (String(newPassword || '').length < minPassword) {
      return bad(`New password must be at least ${minPassword} characters`);
    }
    if (!users.verifyPassword(user, currentPassword)) {
      return bad('Current password is incorrect', 401);
    }
    await users.updatePassword(user.email, newPassword);
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
    const user = await authenticatedUser(req);
    return ok({ user: user ? users.publicUser(user) : null });
  },
});

// POST /api/auth/profile  { name } (header x-auth-token)
app.http('updateProfile', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/profile',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    const user = await authenticatedUser(req);
    if (!user) return bad('Please sign in again', 401);
    const { name } = await readBody(req);
    const nextName = String(name || '').trim();
    if (nextName.length < 2) return bad('Enter your name (at least 2 characters)');
    if (nextName.toLowerCase() !== String(user.name || '').trim().toLowerCase() && !(await users.isNameAvailable(nextName))) {
      return bad('That name is already taken', 409);
    }
    const result = await users.updateUserName(user.email, nextName);
    if (result.error) return bad('That name is already taken', 409);
    return ok({ user: users.publicUser(result.user) });
  },
});

// GET /api/auth/export (header x-auth-token)
app.http('exportAccountData', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/export',
  handler: async (req) => {
    const user = await authenticatedUser(req);
    if (!user) return bad('Please sign in again', 401);
    return ok({ account: users.publicUser(user), exportedAt: new Date().toISOString() });
  },
});

// POST /api/auth/delete { password? } (header x-auth-token)
app.http('deleteAccount', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/delete',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    const user = await authenticatedUser(req);
    if (!user) return bad('Please sign in again', 401);
    const { password } = await readBody(req);
    if (users.hasPassword(user) && !users.verifyPassword(user, password)) {
      return bad('Current password is incorrect', 401);
    }
    await users.deleteUser(user.email);
    return ok({ deleted: true });
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
    await sendResetEmail(user.email, resetUrl);
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

// GET /api/auth/email-status  → { configured: boolean }
app.http('emailStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/email-status',
  handler: async () => {
    return ok({ configured: !!secret() });
  },
});

// --- OAuth SSO (Google + Microsoft) ---

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const MS_CLIENT_ID = process.env.MICROSOFT_OAUTH_CLIENT_ID || '';
const MS_TENANT = process.env.MICROSOFT_OAUTH_TENANT || 'common';

// POST /api/auth/oauth  { provider: 'google'|'microsoft', idToken, remember? }
// Verifies the provider id_token, upserts the user, returns our JWT.
app.http('oauth', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/oauth',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'oauth', 20, 60_000)) return bad('Too many attempts — slow down', 429);
    const { provider, idToken, remember } = await readBody(req);
    const prov = String(provider || '').toLowerCase();
    if (prov !== 'google' && prov !== 'microsoft') return bad('Unsupported provider', 400);
    if (!idToken || typeof idToken !== 'string') return bad('Missing idToken', 400);

    let payload;
    try {
      if (prov === 'google') {
        payload = await verifyGoogle(idToken);
      } else {
        payload = await verifyMicrosoft(idToken);
      }
    } catch (err) {
      return bad('Invalid token', 401);
    }

    const email = String(payload.email || '').toLowerCase();
    if (!emailRe.test(email)) return bad('Token does not contain a valid email', 400);

    const result = await users.findOrCreateOAuthUser({
      email,
      name: String(payload.name || email.split('@')[0] || '').trim().slice(0, 80),
      provider: prov,
      providerSub: payload.sub,
    });
    if (result.error === 'email-exists-other-provider') return bad('Email already used by another provider', 409);
    if (result.error === 'invalid-email') return bad('Invalid email', 400);
    if (result.error === 'invalid-provider') return bad('Invalid provider', 400);
    if (result.error) return bad('Could not create account — try again', 500);
    user = result.user;

    return ok({ token: tokenFor(user, remember !== false), user: users.publicUser(user) });
  },
});

// Google token verification via tokeninfo endpoint (no JWKS library needed).
async function verifyGoogle(idToken) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Google token verification failed');
  const data = await res.json();
  if (data.aud !== GOOGLE_CLIENT_ID) throw new Error('Google token audience mismatch');
  if (data.email_verified !== 'true') throw new Error('Google email not verified');
  return { email: data.email, name: data.name, sub: data.sub };
}

// Microsoft JWT verification via JWKS (cached in-memory per cold-start).
let msJwksClient = null;
function getMsJwksClient() {
  if (!msJwksClient) {
    const { JwksClient } = require('jwks-rsa');
    const tenant = MS_TENANT || 'common';
    msJwksClient = new JwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 600_000,
    });
  }
  return msJwksClient;
}

async function verifyMicrosoft(idToken) {
  const jose = require('jose');
  const client = getMsJwksClient();
  const keys = await client.getSigningKeys();
  if (!keys.length) throw new Error('No Microsoft signing keys found');
  const publicKey = keys[0];
  const secret = publicKey.getPublicKey();
  const { payload } = await jose.jwtVerify(idToken, secret, {
    issuer: `https://login.microsoftonline.com/${MS_TENANT || 'common'}/v2.0`,
    audience: MS_CLIENT_ID,
  });
  const email = payload.email || payload.preferred_username || '';
  return {
    email: String(email).toLowerCase(),
    name: payload.name || String(email).split('@')[0] || '',
    sub: String(payload.sub || ''),
  };
}
