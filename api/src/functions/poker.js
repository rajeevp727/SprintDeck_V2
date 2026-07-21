'use strict';

const { app } = require('@azure/functions');
const store = require('../store');
const linear = require('../linear');

// no-store so polling reads are never cached by the browser/CDN — otherwise
// other devices render stale state until a manual refresh.
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

// Best-effort in-memory per-IP rate limit (per Function instance) to curb abuse
// like room-creation spam. Applied ONLY to low-frequency write actions — never to
// the 1.5s poll or voting, which would false-positive for teams behind one NAT IP.
const _rlHits = new Map();
function rateLimited(req, bucket, max, windowMs) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (_rlHits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  _rlHits.set(key, recent);
  return recent.length > max;
}

// Load a session and verify the caller is its moderator. Returns the session
// or a ready-to-return error response.
async function requireModerator(code, participantId) {
  const session = await store.loadSession(code);
  if (!session) return { error: bad('Session not found', 404) };
  if (!store.isModerator(session, participantId)) {
    return { error: bad('Only the moderator can do this', 403) };
  }
  return { session };
}

// GET /api/health — lightweight warm-keep target for an uptime pinger.
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ok({ status: 'ok', service: 'sprintdeck' }),
});

// POST /api/log — client error sink. Logs to Application Insights (via context)
// for observability. Rate-limited and size-capped to prevent log spam/abuse.
app.http('clientLog', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'log',
  handler: async (req, context) => {
    if (rateLimited(req, 'log', 30, 60_000)) return { status: 429, headers: noCache };
    const body = await readBody(req);
    const msg = String(body.message || '').slice(0, 1000);
    const url = String(body.url || '').slice(0, 500);
    const stack = String(body.stack || '').slice(0, 4000);
    context.error(`[client-error] ${msg} @ ${url}${stack ? `\n${stack}` : ''}`);
    return { status: 204, headers: noCache };
  },
});

// POST /api/session  { name, moderatorName }
app.http('createSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session',
  handler: async (req) => {
    if (rateLimited(req, 'create', 10, 60_000)) {
      return bad('Too many rooms created from here — wait a moment and try again', 429);
    }
    const { name, moderatorName, code, chatEnabled } = await readBody(req);
    const result = await store.createSession(name, moderatorName, code, chatEnabled);
    if (result.error === 'invalid') {
      return bad('Room code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That room code is taken — pick another', 409);
    const { session, participantId } = result;
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
    const result = await store.joinSession(req.params.code, name);
    if (result.error === 'notFound') return bad('Session not found', 404);
    if (result.error === 'full') {
      return bad(`This room is full (max ${store.maxParticipants} members)`, 409);
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
    const session = await store.loadSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    const participantId = req.query.get('participantId');
    // A member polling keeps the room alive, so an open room never expires
    // out from under active viewers (throttled inside touchSession).
    if (participantId && session.participants[participantId]) {
      await store.touchSession(session);
    }
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
    const session = await store.loadSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    if (session.status !== 'voting') return bad('Voting is not open');

    const p = session.participants[participantId];
    if (!p) return bad('You are not in this session', 403);
    if (store.isModerator(session, participantId)) {
      return bad('The moderator facilitates and does not vote', 403);
    }
    if (vote !== null && !session.deck.includes(vote)) return bad('Invalid card');

    p.vote = vote; // null clears the vote (toggle off)
    await store.saveSession(session);
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
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.startStory(session, story); // story is optional
    await store.saveSession(session);
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
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.revealAndSave(session); // sets 'revealed' + auto-saves the result
    await store.saveSession(session);
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
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    for (const p of Object.values(session.participants)) p.vote = null;
    session.status = 'voting';
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/queue  { participantId, stories }   (moderator)
app.http('addToQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue',
  handler: async (req) => {
    const { participantId, stories } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    const titles = Array.isArray(stories) ? stories : String(stories || '').split('\n');
    store.addToQueue(session, titles);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// DELETE /api/session/{code}/queue/{storyId}?participantId=...   (moderator)
app.http('removeFromQueue', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue/{storyId}',
  handler: async (req) => {
    const participantId = req.query.get('participantId');
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.removeFromQueue(session, req.params.storyId);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/queue/reorder  { participantId, order: [storyId] }   (moderator)
app.http('reorderQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue/reorder',
  handler: async (req) => {
    const { participantId, order } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.reorderQueue(session, order);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/kick  { participantId, targetId }   (moderator)
app.http('kickParticipant', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/kick',
  handler: async (req) => {
    const { participantId, targetId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.kickParticipant(session, targetId);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/end  { participantId }   (moderator) — ends the room
app.http('endSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/end',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    await store.deleteSession(req.params.code);
    return ok({ ended: true });
  },
});

// POST /api/session/{code}/next  { participantId }   (moderator) — advance to the
// next queued story (the current result was already saved on reveal).
app.http('nextStory', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/next',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    // Save the current result (done on reveal) was kept; start the next round —
    // the next queued story if any, otherwise a fresh auto-numbered round.
    // History is preserved so every round accumulates in the results.
    store.startStory(session);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Linear integration — V1 flow: paste ticket IDs, write agreed estimates back.
// The Linear API key lives only in the LINEAR_API_KEY app setting (server-side).
// ───────────────────────────────────────────────────────────────────────────

// GET /api/linear/status — lets the UI show/hide the Linear flow.
app.http('linearStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'linear/status',
  handler: async () => ok({ enabled: linear.isEnabled() }),
});

// POST /api/session/{code}/linear/import  { participantId, identifiers }  (moderator)
// Resolves pasted ticket IDs (ENG-876, …) to Linear issues and queues them.
app.http('linearImport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/linear/import',
  handler: async (req) => {
    if (!linear.isEnabled()) return bad('Linear is not configured', 400);
    const { participantId, identifiers } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    let resolved, missing;
    try {
      ({ resolved, missing } = await linear.resolveIssues(identifiers));
    } catch (err) {
      return bad(`Linear lookup failed: ${err.message}`, 502);
    }
    store.addLinearToQueue(session, resolved);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId), missing });
  },
});

// POST /api/session/{code}/linear/import-estimation  { participantId }  (moderator)
// Loads the Linear "Estimation" view's tickets into the queue. MOCK data for now
// (see linear.getEstimationTickets); no API key needed until the real fetch lands.
app.http('linearImportEstimation', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/linear/import-estimation',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.addLinearToQueue(session, linear.getEstimationTickets());
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// POST /api/session/{code}/linear/push  { participantId, entryId, estimate }  (moderator)
// Writes the moderator-confirmed estimate back onto the entry's Linear issue.
app.http('linearPush', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/linear/push',
  handler: async (req) => {
    const { participantId, entryId, estimate } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    const entry = session.history.find((h) => h.id === entryId);
    if (!entry) return bad('Round not found', 404);
    if (!entry.linearId) return bad('This round is not linked to a Linear issue', 400);
    if (!Number.isInteger(estimate) || estimate <= 0 || !session.deck.includes(String(estimate))) {
      return bad('Estimate must be a value from the deck');
    }

    // Mock tickets aren't backed by a real issue — record the estimate locally,
    // skip the API call. Real tickets require a configured key + write to Linear.
    const isMock = linear.isMockId(entry.linearId);
    if (!isMock) {
      if (!linear.isEnabled()) return bad('Linear is not configured', 400);
      try {
        await linear.setEstimate(entry.linearId, estimate);
      } catch (err) {
        return bad(`Linear update failed: ${err.message}`, 502);
      }
    }
    store.markPushed(session, entryId, estimate);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});
