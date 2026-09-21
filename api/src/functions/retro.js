'use strict';

const { app } = require('@azure/functions');
const store = require('../retroStore');
const entitlement = require('../entitlement');
const pokerStore = require('../store'); 
const { rateLimited } = require('../ratelimit');
const users = require('../users-store');
const { sendRetroSummaryEmail } = require('../email');

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
  if (!board) return { error: bad('Board not found', 404) };
  if (!store.isFacilitator(board, participantId)) {
    return { error: bad('Only the facilitator can do this', 403) };
  }
  return { board };
}

async function requireParticipant(code, participantId) {
  const board = await store.loadBoard(code);
  if (!board) return { error: bad('Board not found', 404) };
  if (!board.participants[participantId]) {
    return { error: bad('You are not in this board', 403) };
  }
  return { board };
}

app.http('createRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro',
  handler: async (req) => {
    if (rateLimited(req, 'retrocreate', 15, 60_000)) return bad('Too many requests — slow down', 429);
    const { name, facilitatorName, code, roomCode } = await readBody(req);
    const { allowed } = await entitlement.checkTier(req, 'pro');
    if (!allowed) return bad('A Pro subscription is required to start a retrospective', 403);

    const result = await store.createBoard(
      name,
      facilitatorName,
      code,
      roomCode,
      entitlement.accountIdFromRequest(req),
    );
    if (result.error === 'invalid') {
      return bad('Board code must be 3–24 letters, numbers or dashes');
    }
    if (result.error === 'taken') return bad('That board code is taken — pick another', 409);
    const { board, participantId } = result;
    return ok({ participantId, board: store.publicView(board, participantId) });
  },
});

app.http('joinRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/join',
  handler: async (req) => {
    if (rateLimited(req, 'retrojoin', 20, 60_000)) return bad('Too many requests — slow down', 429);
    const { name } = await readBody(req);
    const result = await store.joinBoard(req.params.code, name);
    if (result.error === 'not_found') return bad('Board not found', 404);
    if (result.error === 'full') {
      return bad(`This board is full (max ${store.maxParticipants} members)`, 409);
    }
    const { board, participantId } = result;
    return ok({ participantId, board: store.publicView(board, participantId) });
  },
});

app.http('getRetro', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'retro/{code}',
  handler: async (req) => {
    const participantId = req.query.get('participantId') || '';
    const board = await store.loadBoard(req.params.code);
    if (!board) return bad('Board not found', 404);
    if (store.expireVoting(board)) await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('addRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note',
  handler: async (req) => {
    if (rateLimited(req, 'retronote', 60, 60_000)) return bad('Too many notes — slow down', 429);
    const { participantId, columnId, text } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    if (!store.addNote(board, participantId, columnId, text)) {
      return bad('Could not add note — check the column and text');
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

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
    if (!store.updateNote(board, participantId, req.params.noteId, { text, columnId })) {
      return bad('Could not update this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

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
    if (!store.deleteNote(board, participantId, req.params.noteId)) {
      return bad('Could not delete this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('removeRetroParticipant', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/remove',
  handler: async (req) => {
    const { participantId, targetId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (!store.removeParticipant(board, participantId, targetId)) {
      return bad('Only the facilitator can remove someone from the board', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('retroStartVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/voting/start',
  handler: async (req) => {
    const { participantId, minutes } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    if (!store.startVoting(board, participantId, minutes)) {
      return bad('Only the facilitator can start voting, for 2, 3, 5, 8 or 10 minutes', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('retroExtendVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/voting/extend',
  handler: async (req) => {
    const { participantId, minutes } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (!store.extendVoting(board, participantId, minutes)) {
      return bad('Voting can be extended by 1, 2 or 3 minutes while it is running', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('retroVoting', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/voting',
  handler: async (req) => {
    const { participantId, closed } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    if (!store.setVotingClosed(board, participantId, closed)) {
      return bad('Only the facilitator can close voting', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('moveRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note/{noteId}/move',
  handler: async (req) => {
    const { participantId, columnId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    if (!store.moveNote(board, participantId, req.params.noteId, columnId)) {
      return bad('Could not move this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

app.http('voteRetroNote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/note/{noteId}/vote',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;
    if (board.phase === 'ended') {
      return bad('This retrospective has ended — it is read-only', 403);
    }
    if (!store.toggleNoteVote(board, participantId, req.params.noteId)) {
      return bad('Could not vote on this note', 403);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

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
    return ok({ board: store.publicView(board, participantId) });
  },
});

// GET /api/retro-history — the signed-in account's past retrospectives. Its
// own path, so it can never be read as a board code.
app.http('retroHistory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'retro-history',
  handler: async (req) => {
    const accountId = entitlement.accountIdFromRequest(req);
    if (!accountId) return bad('Please sign in again', 401);
    const id = req.query.get('id') || '';
    const ownerKey = 'ACCT:' + accountId;
    if (id) {
      const archive = await store.getArchive(ownerKey, id);
      if (!archive) return bad('Retrospective not found', 404);
      return ok({ retro: archive });
    }
    const archives = await store.listArchives(ownerKey);
    return ok({
      retros: archives.map((a) => ({
        id: a.id,
        code: a.boardCode || '',
        name: a.name,
        endedAt: a.endedAt,
        noteCount: (a.notes || []).length,
        participants: (a.participants || []).length,
      })),
    });
  },
});

app.http('likeRetroReviewItem', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/review/{itemId}/like',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireParticipant(req.params.code, participantId);
    if (error) return error;

    if (!store.toggleCarryOverLike(board, participantId, req.params.itemId)) {
      return bad('Could not like this item', 404);
    }
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

// POST /api/retro/{code}/notes-hidden  { participantId, hidden }
app.http('setRetroNotesHidden', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/notes-hidden',
  handler: async (req) => {
    const { participantId, hidden } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    store.setNotesHidden(board, participantId, hidden);
    await store.saveBoard(board);
    return ok({ board: store.publicView(board, participantId) });
  },
});

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
    return ok({ board: store.publicView(board, participantId) });
  },
});

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

/**
 * The summary goes to the facilitator's account address and nowhere else:
 * members join by link under a display name, so we hold no address for them.
 */
async function mailSummary(board, archived) {
  if (!archived || !board.ownerKey) return;
  const accountId = String(board.ownerKey).replace(/^ACCT:/i, '').toLowerCase();
  try {
    const host = await users.getById(accountId);
    if (host?.email) await sendRetroSummaryEmail(host.email, archived);
  } catch (err) {
    // A retrospective must still end cleanly if the mail provider is down.
    console.error('[retro] summary email failed', err);
  }
}

app.http('endRetro', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'retro/{code}/end',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { board, error } = await requireFacilitator(req.params.code, participantId);
    if (error) return error;

    const ledgerKey = board.ledgerKey || board.roomCode;
    if (ledgerKey) {
      await store.saveActionItems(ledgerKey, store.actionItemsFromBoard(board));
    }
    if (board.roomCode) {
      const session = await pokerStore.loadSession(board.roomCode);
      if (session && session.retroCode === board.code) {
        session.retroCode = null;
        await pokerStore.saveSession(session);
      }
    }

    store.endBoard(board);
    const archived = await store.archiveBoard(board);
    await store.saveBoard(board);
    await mailSummary(board, archived);
    return ok({ board: store.publicView(board, participantId) });
  },
});
