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
// Password reset: the one-time token is kept in Cosmos so it survives a
// restart, and the link goes out through Resend/SendGrid; with neither
// configured it is logged instead, which is the local-dev path.
const crypto = require('crypto');
const { app } = require('@azure/functions');
const users = require('../users-store');
const payments = require('../payments-store');
const jwt = require('../jwt');
const { rateLimited } = require('../ratelimit');
const { sendPasswordResetEmail, isEmailConfigured } = require('../email');
const { saveResetToken, consumeResetToken } = require('../reset-token-store');

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
const appUrl = process.env.APP_URL || 'https://sprintdeck.in';
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const minPassword = 8;

// "Remember me" keeps you signed in for 2 sprints (a sprint is 14 days → 28
// days); otherwise the token is a short 1-day session.
const SPRINT_DAYS = 14;
const REMEMBER_TTL = 2 * SPRINT_DAYS * 24 * 60 * 60; // 28 days
const SESSION_TTL = 24 * 60 * 60; // 1 day

/**
 * Signs a token and registers the device it belongs to. The session id travels
 * in the token as `sid`, so a device that has been signed out elsewhere is
 * refused on its next request rather than living on until the token expires.
 */
async function tokenFor(user, remember, req) {
  const sessionId = crypto.randomUUID();
  const { evicted } = await users.registerSession(user, sessionId, deviceLabel(req));
  const token = jwt.sign(
    { sub: user.id, email: user.email, sid: sessionId },
    secret(),
    remember ? REMEMBER_TTL : SESSION_TTL,
  );
  return { token, signedOut: evicted.length };
}

function deviceLabel(req) {
  return (req && req.headers && req.headers.get('user-agent')) || '';
}

async function authenticatedUser(req) {
  const token = req.headers.get('x-auth-token') || '';
  const payload = token && jwt.verify(token, secret());
  if (!payload) return null;
  // `sub` is the account id, which carries the provider; tokens issued before
  // accounts were split per provider only carry the email.
  const user = (payload.sub && (await users.getById(payload.sub))) || (await users.getByEmail(payload.email));
  if (!user) return null;
  // A token minted before device limits existed has no session to check.
  if (!payload.sid) return user;
  if (!users.hasSession(user, payload.sid)) return null;
  await users.touchSession(user, payload.sid);
  return user;
}

function sessionIdOf(req) {
  const payload = jwt.verify(req.headers.get('x-auth-token') || '', secret());
  return payload?.sid || '';
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
    const session = await tokenFor(result.user, remember !== false, req);
    return ok({ ...session, user: users.publicUser(result.user) });
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
    const session = await tokenFor(user, !!remember, req);
    return ok({ ...session, user: users.publicUser(user) });
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
    if (!user) return ok({ user: null });
    return ok({
      user: users.publicUser(user),
      devices: (user.sessions || []).length,
      maxDevices: users.maxDevices,
      activeRooms: users.activeRoomsOf(user),
    });
  },
});

// POST /api/auth/logout — drops this device's session so it cannot come back
// on a token that has not expired yet.
app.http('logout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: async (req) => {
    if (!secret()) return ok({ ok: true });
    const user = await authenticatedUser(req);
    if (user) await users.revokeSession(user, sessionIdOf(req));
    return ok({ ok: true });
  },
});

// POST /api/auth/active  { kind, code }  — code omitted clears it.
// Where this account is right now, so its other devices can follow.
app.http('setActiveRoom', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/active',
  handler: async (req) => {
    if (!secret()) return ok({ activeRooms: [] });
    const user = await authenticatedUser(req);
    if (!user) return bad('Please sign in again', 401);
    const { kind, code } = await readBody(req);
    const updated = await users.setActiveRoom(user, String(kind || ''), code);
    return ok({ activeRooms: users.activeRoomsOf(updated) });
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
    return ok({
      account: users.publicUser(user),
      plan: users.planFor(user),
      orders: await payments.ordersForAccount(user.id),
      exportedAt: new Date().toISOString(),
    });
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
    // Orders keep their amounts for tax records, without the person attached.
    await payments.anonymizeOrdersForAccount(user.id);
    await users.deleteUser(user.id);
    return ok({ deleted: true });
  },
});

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
    // Somebody who has only ever used Google or Microsoft still gets a link:
    // it sets a password on the address so email sign-in works afterwards.
    const accounts = await users.accountsForEmail(normalized);
    if (accounts.length === 0) {
      return bad('User not found — please check the email and try again', 404);
    }

    // A password account is keyed by the bare email, so that is what the token
    // points at whether it exists yet or not.
    const token = await saveResetToken(normalized, normalized);
    const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    const sent = await sendPasswordResetEmail(normalized, resetUrl);
    if (!sent) console.log('[forgot-password] link generated but email is not configured');
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
    if (String(newPassword || '').length < minPassword) {
      return bad(`New password must be at least ${minPassword} characters`);
    }
    const record = await consumeResetToken(String(token || ''));
    if (!record) return bad('Invalid or expired reset link', 400);

    // Carry the name over from whichever account the person already has, so a
    // password account created here is not called after the email prefix.
    const existingName = (await users.accountsForEmail(record.email))
      .map((account) => account.name)
      .find(Boolean);
    const user = await users.upsertPasswordAccount(record.email, newPassword, { name: existingName });
    if (!user) return bad('Invalid reset link', 400);
    return ok({ ok: true });
  },
});

// GET /api/auth/email-status  → whether a reset email can actually be sent
app.http('emailStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/email-status',
  handler: async () => {
    return ok({ configured: isEmailConfigured() });
  },
});

// --- OAuth SSO (Google + Microsoft) ---

const {
  configured: oauthConfigured,
  verifyProviderToken,
  verifyTeamsToken,
  googleClientId,
  microsoftClientId,
  microsoftTenant,
} = require('../oauth');

// GET /api/auth/oauth-status — which providers the API can verify, and with
// which client IDs. Client IDs are public (they ship in the browser bundle),
// so this only reveals whether the server's copy matches the frontend's.
app.http('oauthStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/oauth-status',
  handler: async () => {
    const providers = oauthConfigured();
    return ok({
      providers,
      googleClientId: googleClientId(),
      microsoftClientId: microsoftClientId(),
      azureTenantId: microsoftTenant(),
    });
  },
});

// POST /api/auth/teams  { token }
// Signs in a tab running inside Microsoft Teams. The token comes from the
// Teams SDK, so there is no popup and nothing for the person to click.
app.http('teamsAuth', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/teams',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'teamsauth', 20, 60_000)) return bad('Too many attempts — slow down', 429);
    const { token } = await readBody(req);
    if (!token || typeof token !== 'string') return bad('Missing token', 400);

    let payload;
    try {
      payload = await verifyTeamsToken(token);
    } catch (err) {
      const reason = String(err?.code || err?.message || 'verification failed').slice(0, 120);
      return bad(`Invalid token — ${reason}`, 401);
    }

    const email = String(payload.email || '').toLowerCase();
    if (!emailRe.test(email)) return bad('Token does not contain a valid email', 400);

    // A Teams sign-in is a Microsoft sign-in: same account, same plan, whether
    // the person came through the browser or the tab.
    const result = await users.findOrCreateOAuthUser({
      email,
      name: String(payload.name || email.split('@')[0] || '').trim().slice(0, 80),
      provider: 'microsoft',
      providerSub: payload.providerSub,
    });
    if (result.error) return bad('Could not create account — try again', 500);

    const session = await tokenFor(result.user, true, req);
    return ok({ ...session, user: users.publicUser(result.user) });
  },
});

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
    if (!oauthConfigured()[prov]) return bad(`${prov} sign-in is not configured`, 503);
    if (!idToken || typeof idToken !== 'string') return bad('Missing idToken', 400);

    let payload;
    try {
      payload = await verifyProviderToken(prov, idToken);
    } catch (err) {
      // Say which check failed: every cause otherwise collapses into one
      // opaque message, and none of these strings carry anything secret.
      const claim = err?.claim ? ` (${err.claim})` : '';
      const reason = String(err?.code || err?.message || 'verification failed').slice(0, 120);
      return bad(`Invalid token — ${reason}${claim}`, 401);
    }

    const email = String(payload.email || '').toLowerCase();
    if (!emailRe.test(email)) return bad('Token does not contain a valid email', 400);

    let result;
    try {
      result = await users.findOrCreateOAuthUser({
        email,
        name: String(payload.name || email.split('@')[0] || '').trim().slice(0, 80),
        provider: prov,
        providerSub: payload.providerSub,
      });
    } catch (err) {
      // An uncaught throw here reaches the browser as an empty 500.
      console.error('[oauth] account upsert failed', err);
      return bad(`Sign-in failed — ${String(err?.message || err).slice(0, 120)}`, 500);
    }
    if (result.error === 'invalid-email') return bad('Invalid email', 400);
    if (result.error === 'invalid-provider') return bad('Invalid provider', 400);
    if (result.error) return bad('Could not create account — try again', 500);
    const user = result.user;

    const session = await tokenFor(user, remember !== false, req);
    return ok({ ...session, user: users.publicUser(user) });
  },
});

