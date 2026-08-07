'use strict';

const { app } = require('@azure/functions');
const store = require('../whiteboardStore');
const payments = require('../payments-store');
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

async function requireFacilitator(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Whiteboard not found', 404) };
  if (!store.isFacilitator(board, participantId)) {
    return { error: bad('Only the facilitator can do this', 403) };
  }
  return { board };
}

async function requireParticipant(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Whiteboard not found', 404) };
  if (!board.participants[participantId]) {
    return { error: bad('You are not in this whiteboard', 403) };
  }
  return { board };
}

// POST /api/whiteboard  { name, facilitatorName, code?, roomCode?, subRef }
app.http('createWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardcreate', 15, 60_000)) return bad('Too many requests — slow down', 429);
    const { name, facilitatorName, code, roomCode, subRef } = await readBody(req);
    const sub = await payments.activeSubscription(subRef);
    if (!sub) return bad('A Pro subscription is required to start a whiteboard', 403);

    const result = await store.createBoard(name, facilitatorName, code, roomCode);
    if (result.error === 'invalid') {
      return bad('Whiteboard code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That whiteboard code is taken — pick another', 409);
    const { board, participantId } = result;
    return ok({ participantId, whiteboard: store.publicView(board) });
  },
});

// POST /api/whiteboard/{code}/join  { name }
app.http('joinWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/join',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardjoin', 20, 60_000)) return bad('Too many requests — slow down', 429);
    const { name } = await readBody(req);
    const result = await store.joinBoard(req.params.code, name);
    if (result.error === 'not_found') return bad('Whiteboard not found', 404);
    if (result.error === 'full') {
      return bad(`This whiteboard is full (max ${store.maxParticipants} members)`, 409);
    }
    const { board, participantId } = result;
    return ok({ participantId, whiteboard: store.publicView(board) });
  },
});

// GET /api/whiteboard/{code}?participantId=...   (polled)
app.http('getWhiteboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}',
  handler: async (req) => {
    const board = await store.loadBoard(req.params.code);
    if (!board) return bad('Whiteboard not found', 404);
    return ok({ whiteboard: store.publicView(board) });
  },
});

// POST /api/whiteboard/{code}/element  { participantId, element }
app.http('addWhiteboardElement', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/element',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardelement', 120, 60_000)) return bad('Too many changes — slow down', 429);
    const { participantId, element } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This whiteboard has ended — it is read-only', 403);
    }

    const el = store.addElement(board, participantId, element);
    if (!el) return bad('Could not add element — board may be full');
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board) });
  },
});

// POST /api/whiteboard/{code}/element/{elementId}  { participantId, patch }
app.http('updateWhiteboardElement', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/element/{elementId}',
  handler: async (req) => {
    const { participantId, patch } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This whiteboard has ended — it is read-only', 403);
    }

    if (!store.updateElement(board, participantId, req.params.elementId, patch)) {
      return bad('Could not update this element', 403);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board) });
  },
});

// DELETE /api/whiteboard/{code}/element/{elementId}?participantId=...
app.http('deleteWhiteboardElement', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/element/{elementId}',
  handler: async (req) => {
    const participantId = req.query.participantId;
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This whiteboard has ended — it is read-only', 403);
    }

    if (!store.deleteElement(board, participantId, req.params.elementId)) {
      return bad('Could not delete this element', 403);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board) });
  },
});

// POST /api/whiteboard/{code}/clear  { participantId }
app.http('clearWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/clear',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This whiteboard has ended — it is read-only', 403);
    }

    if (!store.clearElements(board, participantId)) {
      return bad('Only the facilitator can clear the whiteboard', 403);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board) });
  },
});

// POST /api/whiteboard/{code}/end  { participantId }
app.http('endWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/end',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    store.endBoard(board);
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board) });
  },
});
