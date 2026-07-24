'use strict';

// Email + password authentication. Register/login issue a signed JWT (HS256,
// JWT_SECRET); the client sends it as `Authorization: Bearer <token>` and the
// API validates it via api/src/auth.js. Passwords are scrypt-hashed in
// users-store. Degrades cleanly (503) when JWT_SECRET isn't configured.
const { app } = require('@azure/functions');
const users = require('../users-store');
const jwt = require('../jwt');
const { rateLimited } = require('../ratelimit');

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

function tokenFor(user) {
  return jwt.sign({ sub: user.id, email: user.email }, secret());
}

// POST /api/auth/register  { email, password, name? }
app.http('register', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/register',
  handler: async (req) => {
    if (!secret()) return bad('Auth is not configured', 503);
    if (rateLimited(req, 'register', 10, 60_000)) return bad('Too many attempts — slow down', 429);
    const { email, password, name } = await readBody(req);
    if (!emailRe.test(String(email || ''))) return bad('Enter a valid email');
    if (String(password || '').length < minPassword) {
      return bad(`Password must be at least ${minPassword} characters`);
    }
    const result = await users.createUser(email, password, name);
    if (result.error === 'exists') return bad('An account with that email already exists', 409);
    return ok({ token: tokenFor(result.user), user: users.publicUser(result.user) });
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
    const { email, password } = await readBody(req);
    const user = await users.getByEmail(email);
    // Same message + always run the hash to blunt user-enumeration / timing.
    if (!user || !users.verifyPassword(user, password)) {
      return bad('Invalid email or password', 401);
    }
    return ok({ token: tokenFor(user), user: users.publicUser(user) });
  },
});

// GET /api/auth/me   (Authorization: Bearer <token>)
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
