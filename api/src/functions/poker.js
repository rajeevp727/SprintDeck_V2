'use strict';

const { app } = require('@azure/functions');
const store = require('../store');

// no-store so polling reads are never cached by the browser/CDN — otherwise
// other devices render stale state until a manual refresh.
const NO_CACHE = { 'Cache-Control': 'no-store' };

function ok(body) {
  return { status: 200, jsonBody: body, headers: NO_CACHE };
}
function bad(message, status = 400) {
  return { status, jsonBody: { error: message }, headers: NO_CACHE };
}

async function readBody(req) {
  try {
    return (await req.json()) || {};
  } catch {
    return {};
  }
}

// Resolve session + verify the caller is its moderator. Returns the session
// or a ready-to-return error response.
function requireModerator(code, participantId) {
  const session = store.getSession(code);
  if (!session) return { error: bad('Session not found', 404) };
  if (!store.isModerator(session, participantId)) {
    return { error: bad('Only the moderator can do this', 403) };
  }
  return { session };
}

// POST /api/session  { name, moderatorName }
app.http('createSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session',
  handler: async (req) => {
    const { name, moderatorName } = await readBody(req);
    const { session, participantId } = store.createSession(name, moderatorName);
    return ok({ participantId, session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/join  { name }
app.http('joinSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/join',
  handler: async (req) => {
    const { name } = await readBody(req);
    const result = store.joinSession(req.params.code, name);
    if (result.error === 'not_found') return bad('Session not found', 404);
    if (result.error === 'full') {
      return bad(`This room is full (max ${store.MAX_PARTICIPANTS} members)`, 409);
    }
    const { session, participantId } = result;
    return ok({ participantId, session: store.publicView(session, participantId) });
  },
});

// GET /api/session/{code}?participantId=...   (polled)
app.http('getSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'session/{code}',
  handler: async (req) => {
    const session = store.getSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    const participantId = req.query.get('participantId');

    // Heartbeat: mark the poller present, then prune anyone who went silent.
    const me = participantId && session.participants[participantId];
    if (me) me.lastSeen = Date.now();
    store.pruneParticipants(session);

    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/vote  { participantId, vote }
app.http('castVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/vote',
  handler: async (req) => {
    const { participantId, vote } = await readBody(req);
    const session = store.getSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    if (session.status !== 'voting') return bad('Voting is not open');

    const p = session.participants[participantId];
    if (!p) return bad('You are not in this session', 403);
    if (vote !== null && !session.deck.includes(vote)) return bad('Invalid card');

    p.vote = vote; // null clears the vote (toggle off)
    p.lastSeen = Date.now();
    store.touch(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/start  { participantId, story }   (moderator)
app.http('startVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/start',
  handler: async (req) => {
    const { participantId, story } = await readBody(req);
    const { session, error } = requireModerator(req.params.code, participantId);
    if (error) return error;

    if (typeof story === 'string' && story.trim()) session.story = story.trim();
    for (const p of Object.values(session.participants)) p.vote = null;
    session.status = 'voting';
    store.touch(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/reveal  { participantId }   (moderator)
app.http('reveal', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/reveal',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = requireModerator(req.params.code, participantId);
    if (error) return error;

    session.status = 'revealed';
    store.touch(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/reset  { participantId }   (moderator) — clear votes, vote again
app.http('reset', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/reset',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = requireModerator(req.params.code, participantId);
    if (error) return error;

    for (const p of Object.values(session.participants)) p.vote = null;
    session.status = 'voting';
    store.touch(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/story  { participantId, story }   (moderator)
app.http('setStory', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/story',
  handler: async (req) => {
    const { participantId, story } = await readBody(req);
    const { session, error } = requireModerator(req.params.code, participantId);
    if (error) return error;

    session.story = typeof story === 'string' ? story.trim() : '';
    store.touch(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});
