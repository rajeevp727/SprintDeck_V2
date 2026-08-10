'use strict';

const { app } = require('@azure/functions');
const store = require('../whiteboardStore');
const payments = require('../payments-store');
const pokerStore = require('../store');
const { rateLimited } = require('../ratelimit');

const noCache = { 'Cache-Control': 'no-store' };
const conn = process.env.COSMOS_CONNECTION_STRING || '';

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
    return { error: bad('Only the presenter can do this', 403) };
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

async function requireWriter(code, participantId) {
  const { board, error } = await requireParticipant(code, participantId);
  if (error) return { error };
  if (!store.canWrite(board, participantId)) {
    return { error: bad('Read-only — ask the presenter for write access', 403) };
  }
  return { board };
}

async function requirePro(subRef) {
  // Local/dev (no Cosmos): allow free create so shared boards can be validated.
  if (!conn) return null;
  const sub = await payments.activeSubscription(subRef);
  if (!sub) return bad('A Pro subscription is required to start a whiteboard', 403);
  return null;
}

async function verifyRoomMate(roomCode, roomParticipantId) {
  if (!roomCode || !roomParticipantId) return false;
  const session = await pokerStore.loadSession(roomCode);
  if (!session) return false;
  return !!session.participants[roomParticipantId];
}

// POST /api/whiteboard
app.http('createWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardcreate', 15, 60_000)) return bad('Too many requests — slow down', 429);
    const body = await readBody(req);
    const {
      name,
      facilitatorName,
      code,
      roomCode,
      subRef,
      roomParticipantId,
      access,
    } = body;

    const proErr = await requirePro(subRef);
    if (proErr) return proErr;

    let seedParticipants = [];
    let resolvedAccess = access || (roomCode ? 'room' : 'open');

    if (roomCode) {
      const session = await pokerStore.loadSession(roomCode);
      if (!session) return bad('Linked planning room not found', 404);
      if (roomParticipantId && !session.participants[roomParticipantId]) {
        return bad('Only room members can start a whiteboard for this room', 403);
      }
      seedParticipants = Object.values(session.participants).map((p) => ({ id: p.id, name: p.name }));
      resolvedAccess = access === 'link' ? 'link' : 'room';
    }

    const result = await store.createBoard(name, facilitatorName, code, roomCode, {
      access: resolvedAccess,
      seedParticipants,
    });
    if (result.error === 'invalid') {
      return bad('Whiteboard code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That whiteboard code is taken — pick another', 409);

    // Prefer reusing the poker participant id as whiteboard id when linked from a room
    // so room-mate identity maps cleanly. If seed already used that id, swap facilitator.
    const { board, participantId } = result;
    if (roomCode && roomParticipantId && board.participants[roomParticipantId]) {
      // Caller was already seeded — promote them to facilitator
      const oldFac = board.facilitatorId;
      board.facilitatorId = roomParticipantId;
      if (oldFac !== roomParticipantId && board.participants[oldFac]) {
        // Keep both; demote the placeholder facilitator we just created if names collide
        if (board.participants[oldFac].name === (facilitatorName || '').trim()) {
          delete board.participants[oldFac];
        }
      }
      await store.saveBoard(board);
      return ok({ participantId: roomParticipantId, whiteboard: store.publicView(board, roomParticipantId) });
    }

    await store.saveBoard(board);
    return ok({ participantId, whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/join
app.http('joinWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/join',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardjoin', 20, 60_000)) return bad('Too many requests — slow down', 429);
    const { name, shareToken, roomCode, roomParticipantId, participantId } = await readBody(req);

    if (roomCode || roomParticipantId) {
      const okMate = await verifyRoomMate(roomCode || (await store.loadBoard(req.params.code))?.roomCode, roomParticipantId);
      if (!okMate && !(await store.loadBoard(req.params.code))?.participants?.[participantId]) {
        // Fall through — joinBoard will still enforce access
      }
    }

    const boardPeek = await store.loadBoard(req.params.code);
    if (!boardPeek) return bad('Whiteboard not found', 404);

    // Prove room membership when required
    if (boardPeek.access === 'room' || (boardPeek.access === 'link' && !shareToken)) {
      if (participantId && boardPeek.participants[participantId]) {
        // resume ok
      } else {
        const mateOk = await verifyRoomMate(boardPeek.roomCode, roomParticipantId);
        if (!mateOk && boardPeek.access === 'room') {
          return bad('This whiteboard is only for planning-room members. Ask for a share link.', 403);
        }
        if (!mateOk && boardPeek.access === 'link' && shareToken !== boardPeek.shareToken) {
          return bad('Invalid or missing share link', 403);
        }
      }
    }

    const result = await store.joinBoard(req.params.code, name, {
      shareToken,
      roomParticipantId,
      participantId,
    });
    if (result.error === 'not_found') return bad('Whiteboard not found', 404);
    if (result.error === 'full') {
      return bad(`This whiteboard is full (max ${store.maxParticipants} members)`, 409);
    }
    if (result.error === 'room_only') {
      return bad('This whiteboard is only for planning-room members. Ask for a share link.', 403);
    }
    if (result.error === 'forbidden') return bad('You cannot join this whiteboard', 403);

    return ok({
      participantId: result.participantId,
      whiteboard: store.publicView(result.board, result.participantId),
    });
  },
});

// GET /api/whiteboard/{code}?participantId=
app.http('getWhiteboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}',
  handler: async (req) => {
    const participantId = req.query.get('participantId') || '';
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/element
app.http('addWhiteboardElement', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/element',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardelement', 180, 60_000)) return bad('Too many changes — slow down', 429);
    const { participantId, element } = await readBody(req);
    const { board, error } = await requireWriter(req.params.code, participantId);
    if (error) return error;
    const el = store.addElement(board, participantId, element);
    if (!el) return bad('Could not add element — board may be full');
    await store.saveBoard(board);
    return ok({ element: el, whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/element/{elementId}
app.http('updateWhiteboardElement', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/element/{elementId}',
  handler: async (req) => {
    const { participantId, patch } = await readBody(req);
    const { board, error } = await requireWriter(req.params.code, participantId);
    if (error) return error;
    if (!store.updateElement(board, participantId, req.params.elementId, patch)) {
      return bad('Could not update this element', 403);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// DELETE /api/whiteboard/{code}/element/{elementId}?participantId=
app.http('deleteWhiteboardElement', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/element/{elementId}',
  handler: async (req) => {
    const participantId = req.query.get('participantId');
    const { board, error } = await requireWriter(req.params.code, participantId);
    if (error) return error;
    if (!store.deleteElement(board, participantId, req.params.elementId)) {
      return bad('Could not delete this element', 403);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/clear
app.http('clearWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/clear',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;
    store.clearElements(board, participantId);
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/end
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
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/writers  { participantId, targetId, allow }
app.http('setWhiteboardWriter', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/writers',
  handler: async (req) => {
    const { participantId, targetId, allow } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;
    if (!store.setWriter(board, participantId, targetId, !!allow)) {
      return bad('Could not update write access', 400);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/share  { participantId, enable }
app.http('shareWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/share',
  handler: async (req) => {
    const { participantId, enable } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;
    if (enable === false) {
      store.revokeShareLink(board, participantId);
    } else {
      store.enableShareLink(board, participantId);
    }
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/follow  { participantId, enabled }
app.http('followWhiteboardPresenter', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/follow',
  handler: async (req) => {
    const { participantId, enabled } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;
    store.setFollowPresenter(board, participantId, !!enabled);
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/viewport  { participantId, viewport }
app.http('setWhiteboardViewport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/viewport',
  handler: async (req) => {
    const { participantId, viewport } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;
    store.updateViewport(board, participantId, viewport || {});
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/presence  { participantId, x, y, tool, editingId }
app.http('setWhiteboardPresence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/presence',
  handler: async (req) => {
    if (rateLimited(req, 'whiteboardpresence', 240, 60_000)) return bad('Too many presence updates', 429);
    const { participantId, x, y, tool, editingId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    store.setPresence(board, participantId, { x, y, tool, editingId });
    // Presence is ephemeral — notify without heavy persist thrash when possible
    await store.saveBoard(board);
    return ok({ whiteboard: store.publicView(board, participantId) });
  },
});

// POST /api/whiteboard/{code}/leave  { participantId }
app.http('leaveWhiteboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'whiteboard/{code}/leave',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (!store.leaveBoard(board, participantId)) {
      return bad('Presenter cannot leave — end the board instead', 400);
    }
    await store.saveBoard(board);
    return ok({ ok: true });
  },
});
