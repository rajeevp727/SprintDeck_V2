'use strict';

const { app } = require('@azure/functions');
const store = require('../store');
const linear = require('../linear');
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

function redactLog(s) {
  return String(s || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
}

async function requireModerator(code, participantId) {
  const session = await store.loadSession(code);
  if (!session) return { error: bad('Session not found', 404) };
  if (!store.isModerator(session, participantId)) {
    return { error: bad('Only the moderator can do this', 403) };
  }
  return { session };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ok({ status: 'ok', service: 'sprintdeck' }),
});

app.http('clientLog', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'log',
  handler: async (req, context) => {
    if (rateLimited(req, 'log', 30, 60_000)) return { status: 429, headers: noCache };
    const body = await readBody(req);
    const msg = redactLog(String(body.message || '').slice(0, 1000));
    const url = redactLog(String(body.url || '').slice(0, 500));
    const stack = redactLog(String(body.stack || '').slice(0, 4000));
    context.error(`[client-error] ${msg} @ ${url}${stack ? `\n${stack}` : ''}`);
    return { status: 204, headers: noCache };
  },
});

app.http('createSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session',
  handler: async (req) => {
    if (rateLimited(req, 'create', 10, 60_000)) {
      return bad('Too many rooms created from here — wait a moment and try again', 429);
    }
    const { name, moderatorName, code } = await readBody(req);
    const result = await store.createSession(name, moderatorName, code);
    if (result.error === 'invalid') {
      return bad('Room code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That room code is taken — pick another', 409);
    const { session, participantId } = result;
    return ok({ participantId, session: store.publicView(session, participantId) });
  },
});

app.http('joinSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/join',
  handler: async (req) => {
    if (rateLimited(req, 'join', 30, 60_000)) return bad('Too many requests — slow down', 429);
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

app.http('getSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'session/{code}',
  handler: async (req) => {
    const session = await store.loadSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    const participantId = req.query.get('participantId');
    
    
    if (participantId && session.participants[participantId]) {
      await store.touchSession(session);
    }
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('castVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/vote',
  handler: async (req) => {
    if (rateLimited(req, 'vote', 120, 60_000)) return bad('Too many requests — slow down', 429);
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

    p.vote = vote; 
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('startVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/start',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId, story } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.startStory(session, story); 
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('reveal', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/reveal',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.revealAndSave(session); 
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('reset', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/reset',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    for (const p of Object.values(session.participants)) p.vote = null;
    session.status = 'voting';
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('addToQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId, stories } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    const titles = Array.isArray(stories) ? stories : String(stories || '').split('\n');
    store.addToQueue(session, titles);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('removeFromQueue', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue/{storyId}',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const participantId = req.query.get('participantId');
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.removeFromQueue(session, req.params.storyId);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('reorderQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/queue/reorder',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId, order } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.reorderQueue(session, order);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('kickParticipant', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/kick',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId, targetId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.kickParticipant(session, targetId);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('endSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/end',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId } = await readBody(req);
    const { error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    await store.deleteSession(req.params.code);
    return ok({ ended: true });
  },
});

app.http('nextStory', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/next',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    
    
    
    store.startStory(session);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('setRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/retro',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId, retroCode } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    session.retroCode = String(retroCode || '').trim().toUpperCase() || null;
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('linearStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'linear/status',
  handler: async () => ok({ enabled: linear.isEnabled() }),
});

app.http('linearImport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/linear/import',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    if (!linear.isEnabled()) return bad('Linear is not configured', 400);
    const { participantId, identifiers } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    let resolved, missing;
    try {
      ({ resolved, missing } = await linear.resolveIssues(identifiers));
    } catch {
      return bad('Linear lookup failed — please try again', 502);
    }
    store.addLinearToQueue(session, resolved);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId), missing });
  },
});

app.http('linearImportEstimation', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/linear/import-estimation',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    store.addLinearToQueue(session, linear.getEstimationTickets());
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

app.http('linearPush', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/linear/push',
  handler: async (req) => {
    if (rateLimited(req, 'pokermod', 60, 60_000)) return bad('Too many requests — slow down', 429);
    const { participantId, entryId, estimate } = await readBody(req);
    const { session, error } = await requireModerator(req.params.code, participantId);
    if (error) return error;

    const entry = session.history.find((h) => h.id === entryId);
    if (!entry) return bad('Round not found', 404);
    if (!entry.linearId) return bad('This round is not linked to a Linear issue', 400);
    if (!Number.isInteger(estimate) || estimate <= 0 || !session.deck.includes(String(estimate))) {
      return bad('Estimate must be a value from the deck');
    }

    
    
    const isMock = linear.isMockId(entry.linearId);
    if (!isMock) {
      if (!linear.isEnabled()) return bad('Linear is not configured', 400);
      try {
        await linear.setEstimate(entry.linearId, estimate);
      } catch {
        return bad('Linear update failed — please try again', 502);
      }
    }
    store.markPushed(session, entryId, estimate);
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});
