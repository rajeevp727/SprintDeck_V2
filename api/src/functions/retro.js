'use strict';

const { app } = require('@azure/functions');
const store = require('../retroStore');
const pokerStore = require('../store'); // to unlink the retro from its poker room on end
const payments = require('../payments-store'); // PRO+ gate — subscription verified from Cosmos

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

// Load a board and verify the caller is its facilitator.
async function requireFacilitator(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Board not found', 404) };
  if (!store.isFacilitator(board, participantId)) {
    return { error: bad('Only the facilitator can do this', 403) };
  }
  return { board };
}

// Load a board and verify the caller is a participant.
async function requireParticipant(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Board not found', 404) };
  if (!board.participants[participantId]) {
    return { error: bad('You are not in this board', 403) };
  }
  return { board };
}

// POST /api/retro  { name, facilitatorName, code?, roomCode?, subRef }
// PRO+ only: creating a retro requires an active subscription, verified server-
// side from the confirmed payment order in Cosmos (subRef = that order's id).
app.http('createRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro',
  handler: async (req) => {
    const { name, facilitatorName, code, roomCode, subRef } = await readBody(req);
    const sub = await payments.activeSubscription(subRef);
    if (!sub) return bad('A Pro subscription is required to start a retrospective', 403);

    const result = await store.createBoard(name, facilitatorName, code, roomCode);
    if (result.error === 'invalid') {
      return bad('Board code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That board code is taken — pick another', 409);
    const { board, participantId } = result;
    return ok({ participantId, board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/join  { name }
app.http('joinRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/join',
  handler: async (req) => {
    const { name } = await readBody(req);
    const result = await store.joinBoard(req.params.code, name);
    if (result.error === 'not_found') return bad('Board not found', 404);
    if (result.error === 'full') {
      return bad(`This board is full (max ${store.maxParticipants} members)`, 409);
    }
    const { board, participantId } = result;
    return ok({ participantId, board: store.publicView(board) });
  },
});

// GET /api/retro/{code}?participantId=...   (polled)
app.http('getRetro', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'retro/{code}',
  handler: async (req) => {
    const board = await store.loadBoard(req.params.code);
    if (!board) return bad('Board not found', 404);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/note  { participantId, columnId, text }
app.http('addRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note',
  handler: async (req) => {
    const { participantId, columnId, text } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    // The facilitator's board is read-only — only members add/edit/delete notes.
    if (store.isFacilitator(board, participantId)) {
      return bad('The facilitator can only view the board — notes are added by members', 403);
    }

    if (!store.addNote(board, participantId, columnId, text)) {
      return bad('Could not add note — check the column and text');
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/note/{noteId}  { participantId, text?, columnId? }  (author)
app.http('updateRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note/{noteId}',
  handler: async (req) => {
    const { participantId, text, columnId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    // The facilitator's board is read-only — only members add/edit/delete notes.
    if (store.isFacilitator(board, participantId)) {
      return bad('The facilitator can only view the board — notes are added by members', 403);
    }

    if (!store.updateNote(board, participantId, req.params.noteId, { text, columnId })) {
      return bad('Could not update this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// DELETE /api/retro/{code}/note/{noteId}?participantId=...   (author or facilitator)
app.http('deleteRetroNote', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note/{noteId}',
  handler: async (req) => {
    const participantId = req.query.get('participantId');
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    // The facilitator's board is read-only — only members add/edit/delete notes.
    if (store.isFacilitator(board, participantId)) {
      return bad('The facilitator can only view the board — notes are added by members', 403);
    }

    if (!store.deleteNote(board, participantId, req.params.noteId)) {
      return bad('Could not delete this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/review/{itemId}  { participantId }  (facilitator)
app.http('toggleRetroReviewItem', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/review/{itemId}',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    if (!store.toggleCarryOverItem(board, req.params.itemId)) {
      return bad('Could not update this item', 404);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/open  { participantId }  (facilitator) — finish review
app.http('openRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/open',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    store.openBoard(board);
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});

// POST /api/retro/{code}/leave  { participantId }  — a member removes themselves
app.http('leaveRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/leave',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const board = await store.loadBoard(req.params.code);
    if (board && store.leaveBoard(board, participantId)) {
      await store.saveBoard(board);
    }
    return ok({ left: true });
  },
});

// POST /api/retro/{code}/end  { participantId }   (facilitator) — FINALIZE the
// retro: mark it ended (read-only + export unlocked), capture its action items
// for the room's next retro, and unlink from the poker room. The board is kept
// so results can be exported; it expires later via TTL.
app.http('endRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/end',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    if (board.roomCode) {
      await store.saveActionItems(board.roomCode, store.actionItemsFromBoard(board));
      const session = await pokerStore.loadSession(board.roomCode);
      if (session && session.retroCode === board.code) {
        session.retroCode = null;
        await pokerStore.saveSession(session);
      }
    }

    store.endBoard(board);
    await store.saveBoard(board);
    return ok({ board: store.publicView(board) });
  },
});
