'use strict';

const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');
const realtime = require('./realtime');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = process.env.COSMOS_DB_NAME || 'sprintdeck';
const containerName = 'retros';

const memory = new Map(); 
const containerCache = new Map(); 

const boardMaxAgeMs = 8 * 60 * 60 * 1000; 
const boardIdleMs = 4 * 60 * 60 * 1000; 
const maxParticipants = 30;
const maxNoteLen = 500;
const maxNotes = 500; 
const maxNameLen = 80;

const ledgerContainerName = 'retroledger';
const ledgerTtlSeconds = 90 * 24 * 60 * 60; 
const ledgerMemory = new Map(); 

const participantColors = [
  '#ffd76a', '#a0e8a4', '#8fd0ff', '#f7a8c4', '#c9b3ff',
  '#ffb38a', '#7fe3d4', '#ffd0e0', '#c7e59a', '#9ab8ff',
];

function colorForSeq(seq) {
  return participantColors[seq % participantColors.length];
}

function containerFor(name, ttlSeconds) {
  if (!conn) return null;
  if (!containerCache.has(name)) {
    const client = new CosmosClient(conn);
    const promise = (async () => {
      
      
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: dbName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: dbName }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: name,
        partitionKey: { paths: ['/code'] },
        defaultTtl: ttlSeconds,
      });
      return container;
    })().catch((e) => {
      containerCache.delete(name); 
      throw e;
    });
    containerCache.set(name, promise);
  }
  return containerCache.get(name);
}

const getContainer = () => containerFor(containerName, boardIdleMs / 1000);

async function readRaw(code) {
  const c = getContainer();
  if (c) {
    try {
      const { resource } = await (await c).item(code, code).read();
      return resource ? resource.doc : null;
    } catch (err) {
      if (err.code === 404) return null;
      throw err;
    }
  }
  return memory.get(code) || null;
}

async function writeRaw(board) {
  const c = getContainer();
  if (c) {
    await (await c).items.upsert({
      id: board.code,
      code: board.code,
      doc: board,
      ttl: boardIdleMs / 1000, 
    });
  } else {
    memory.set(board.code, board);
  }
}

async function removeRaw(code) {
  const c = getContainer();
  if (c) {
    try {
      await (await c).item(code, code).delete();
    } catch (err) {
      if (err.code !== 404) throw err;
    }
  } else {
    memory.delete(code);
  }
}

const getLedgerContainer = () => containerFor(ledgerContainerName, ledgerTtlSeconds);

/**
 * Which ledger a board's action items belong to. A retro started from a
 * planning room follows the room; a standalone one follows the host's account,
 * so their next retrospective opens on what they agreed last time.
 */
function ledgerKeyFor(roomCode, ownerKey) {
  if (normalize(roomCode)) return normalize(roomCode);
  return ownerKey ? 'ACCT:' + normalize(ownerKey) : '';
}

async function loadActionItems(roomCode) {
  const key = normalize(roomCode);
  if (!key) return [];
  const c = getLedgerContainer();
  if (c) {
    try {
      const { resource } = await (await c).item(key, key).read();
      return resource ? resource.items || [] : [];
    } catch (err) {
      if (err.code === 404) return [];
      throw err;
    }
  }
  return ledgerMemory.get(key) || [];
}

async function saveActionItems(roomCode, items) {
  const key = normalize(roomCode);
  if (!key) return;
  const c = getLedgerContainer();
  if (c) {
    await (await c).items.upsert({ id: key, code: key, items, ttl: ledgerTtlSeconds });
  } else {
    ledgerMemory.set(key, items);
  }
}

const codeChars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; 

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += codeChars[crypto.randomInt(codeChars.length)];
  return code;
}

function genId() {
  return crypto.randomUUID();
}

function normalize(code) {
  return (code || '').trim().toUpperCase();
}

function isExpired(b) {
  const now = Date.now();
  return now - b.lastActivity > boardIdleMs || now - b.createdAt > boardMaxAgeMs;
}

async function genUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (await readRaw(code));
  return code;
}

const codeRe = /^[A-Z0-9-]{3,24}$/;

function defaultColumns() {
  return [
    { id: genId(), title: 'What went well', color: '#5ec47f' },
    { id: genId(), title: 'What to improve', color: '#efb45e' },
    { id: genId(), title: 'What went wrong', color: '#e2646a' },
    { id: genId(), title: 'Action items', color: '#4f7cff' },
  ];
}

async function loadBoard(code) {
  const b = await readRaw(normalize(code));
  if (!b) return null;
  if (isExpired(b)) {
    await removeRaw(b.code);
    return null;
  }
  return b;
}

async function saveBoard(board) {
  board.lastActivity = Date.now();
  await writeRaw(board);
  realtime.notifyGroup('retro:' + board.code); 
}

async function deleteBoard(code) {
  const norm = normalize(code);
  await removeRaw(norm);
  realtime.notifyGroup('retro:' + norm);
}

async function createBoard(name, facilitatorName, desiredCode, roomCode, ownerKey) {
  let code;
  const wanted = normalize(desiredCode);
  if (wanted) {
    if (!codeRe.test(wanted)) return { error: 'invalid' };
    if (await loadBoard(wanted)) return { error: 'taken' };
    code = wanted;
  } else {
    code = await genUniqueCode();
  }
  const pid = genId();
  const now = Date.now();
  
  const ledgerKey = ledgerKeyFor(roomCode, ownerKey);
  const carry = await loadActionItems(ledgerKey);
  const board = {
    code,
    name: (name || '').trim().slice(0, maxNameLen) || 'Sprint Retrospective',
    facilitatorId: pid,
    roomCode: normalize(roomCode) || null, 
    ledgerKey: ledgerKey || null,
    
    
    phase: 'review', 
    carryOverItems: carry.map((it) => ({ id: it.id, text: it.text, done: false, likes: [] })),
    columns: defaultColumns(),
    votingClosed: false,
    votingEndsAt: null,
    notes: [], 
    participants: {
      [pid]: { id: pid, name: (facilitatorName || '').trim().slice(0, maxNameLen) || 'Facilitator', color: colorForSeq(0) },
    },
    colorSeq: 1, 
    createdAt: now,
    lastActivity: now,
  };
  await writeRaw(board);
  return { board, participantId: pid };
}

async function joinBoard(code, name) {
  const board = await loadBoard(code);
  if (!board) return { error: 'not_found' };
  if (Object.keys(board.participants).length >= maxParticipants) {
    return { error: 'full' };
  }
  const pid = genId();
  const seq = board.colorSeq || Object.keys(board.participants).length;
  board.participants[pid] = { id: pid, name: (name || '').trim().slice(0, maxNameLen) || 'Guest', color: colorForSeq(seq) };
  board.colorSeq = seq + 1;
  await saveBoard(board);
  return { board, participantId: pid };
}

function isFacilitator(board, participantId) {
  return board.facilitatorId === participantId;
}

function leaveBoard(board, participantId) {
  if (participantId === board.facilitatorId) return false;
  if (!board.participants[participantId]) return false;
  delete board.participants[participantId];
  return true;
}

function isActionColumnId(board, columnId) {
  const action = actionColumn(board);
  return !!action && action.id === columnId;
}

/** Who may write in a column: the facilitator owns Action items, members own the rest. */
function canWriteColumn(board, participantId, columnId) {
  if (isActionColumnId(board, columnId)) return isFacilitator(board, participantId);
  if (isFacilitator(board, participantId)) return false;
  return !board.votingClosed;
}

function addNote(board, participantId, columnId, text) {
  const author = board.participants[participantId];
  if (!author) return false;
  if (!board.columns.some((c) => c.id === columnId)) return false;
  if (!canWriteColumn(board, participantId, columnId)) return false;
  if (board.notes.length >= maxNotes) return false; 
  const body = String(text || '').trim();
  if (!body) return false;
  board.notes.push({
    id: genId(),
    columnId,
    authorId: participantId,
    authorName: author.name,
    text: body.slice(0, maxNoteLen),
    color: author.color || colorForSeq(0),
    createdAt: Date.now(),
  });
  return true;
}

function updateNote(board, participantId, noteId, patch) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (isActionColumnId(board, note.columnId)) {
    if (!isFacilitator(board, participantId)) return false;
  } else if (note.authorId !== participantId) {
    return false;
  } else if (board.votingClosed && !patch.columnId) {
    // The board is frozen for members once voting ends.
    return false;
  }
  if (typeof patch.text === 'string') {
    const body = patch.text.trim();
    if (!body) return false;
    note.text = body.slice(0, maxNoteLen);
  }
  if (typeof patch.columnId === 'string') {
    if (!board.columns.some((c) => c.id === patch.columnId)) return false;
    note.columnId = patch.columnId;
  }
  return true;
}

/** The Action items column, matched by title so older boards keep working. */
function actionColumn(board) {
  return (board.columns || []).find((c) => /action items/i.test(c.title)) || null;
}

const VotingMinutes = [2, 3, 5, 8, 10];

/**
 * Opens voting for a fixed number of minutes. Everyone sees the same deadline,
 * and the board closes itself when it passes so nobody has to watch a clock.
 */
function startVoting(board, participantId, minutes) {
  if (!isFacilitator(board, participantId)) return false;
  const chosen = Number(minutes);
  if (!VotingMinutes.includes(chosen)) return false;
  board.votingClosed = false;
  board.votingEndsAt = Date.now() + chosen * 60 * 1000;
  return true;
}

const ExtendMinutes = [1, 2, 3];

/**
 * Adds time to a vote already in progress, for when the room needs another
 * minute. Extending from the deadline rather than from now keeps the clock
 * honest if the facilitator is a second late.
 */
function extendVoting(board, participantId, minutes) {
  if (!isFacilitator(board, participantId)) return false;
  if (board.votingClosed || !board.votingEndsAt) return false;
  const chosen = Number(minutes);
  if (!ExtendMinutes.includes(chosen)) return false;
  board.votingEndsAt = Math.max(Date.now(), board.votingEndsAt) + chosen * 60 * 1000;
  return true;
}

/**
 * Closing voting freezes the tally so the board can be read top-down. The
 * facilitator can stop early, or reopen if the team is not finished.
 */
function setVotingClosed(board, participantId, closed) {
  if (!isFacilitator(board, participantId)) return false;
  board.votingClosed = !!closed;
  board.votingEndsAt = closed ? null : board.votingEndsAt;
  return true;
}

/** The deadline closes voting on its own, whoever loads the board next. */
function expireVoting(board) {
  if (board.votingClosed || !board.votingEndsAt) return false;
  if (Date.now() < board.votingEndsAt) return false;
  board.votingClosed = true;
  board.votingEndsAt = null;
  return true;
}

/**
 * Removes a member from the board. Their notes stay: the retrospective is a
 * record of what was said, not of who is still in the room.
 */
function removeParticipant(board, participantId, targetId) {
  if (!isFacilitator(board, participantId)) return false;
  if (!targetId || targetId === board.facilitatorId) return false;
  if (!board.participants[targetId]) return false;
  delete board.participants[targetId];
  return true;
}

/**
 * Only the facilitator decides what becomes an action item, and only once the
 * clock has stopped — the team picks by voting before anything is promoted.
 */
function moveNote(board, participantId, noteId, targetColumnId) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (!isFacilitator(board, participantId)) return false;
  if (!votingIsOver(board)) return false;
  if (!board.columns.some((c) => c.id === targetColumnId)) return false;
  if (note.columnId === targetColumnId) return true;
  note.previousColumnId = note.columnId;
  note.columnId = targetColumnId;
  return true;
}

/**
 * One vote per participant per note, toggled off by voting again. Nobody votes
 * for their own note — the point is what the rest of the team thinks.
 */
function toggleNoteVote(board, participantId, noteId) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (!board.participants[participantId]) return false;
  if (note.authorId === participantId) return false;
  // Votes count only while the clock is running: not before the facilitator
  // starts it, and not after it stops.
  if (!board.votingEndsAt || votingIsOver(board)) return false;
  const votes = Array.isArray(note.votes) ? note.votes : [];
  note.votes = votes.includes(participantId)
    ? votes.filter((id) => id !== participantId)
    : [...votes, participantId];
  return true;
}

/**
 * You may remove what you wrote, and nothing else. Discussion notes are settled
 * once the clock stops: what the team voted on stays on the board.
 */
function deleteNote(board, participantId, noteId) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (!canDeleteNote(board, participantId, note)) return false;
  board.notes = board.notes.filter((n) => n.id !== noteId);
  return true;
}

function canDeleteNote(board, participantId, note) {
  // An action item is the facilitator's to drop, whoever first wrote the note
  // it came from: a member must not be able to delete an agreed action just
  // because it started life as theirs.
  if (isActionColumnId(board, note.columnId)) return isFacilitator(board, participantId);
  if (note.authorId !== participantId) return false;
  return !votingIsOver(board);
}

/**
 * Anyone in the room can back a carried-over item. Likes say which of last
 * sprint's promises the team still cares about, so they are open to members
 * while ticking one off stays the facilitator's call.
 */
function toggleCarryOverLike(board, participantId, itemId) {
  if (!board.participants[participantId]) return false;
  if (board.phase === 'ended') return false;
  const item = (board.carryOverItems || []).find((i) => i.id === itemId);
  if (!item) return false;
  const likes = Array.isArray(item.likes) ? item.likes : [];
  item.likes = likes.includes(participantId)
    ? likes.filter((id) => id !== participantId)
    : [...likes, participantId];
  return true;
}

function toggleCarryOverItem(board, itemId) {
  const item = (board.carryOverItems || []).find((i) => i.id === itemId);
  if (!item) return false;
  item.done = !item.done;
  return true;
}

function openBoard(board) {
  board.phase = 'active';
}

function endBoard(board) {
  board.phase = 'ended';
}

function actionItemsFromBoard(board) {
  const col = board.columns.find((c) => /action items/i.test(c.title));
  if (!col) return [];
  return board.notes.filter((n) => n.columnId === col.id).map((n) => ({ id: n.id, text: n.text }));
}

function votingIsOver(board) {
  return !!board.votingClosed || (!!board.votingEndsAt && Date.now() >= board.votingEndsAt);
}

function publicView(board, viewerId) {
  const action = actionColumn(board);
  const hideActions = !!action && !votingIsOver(board) && board.facilitatorId !== viewerId;
  const columns = hideActions ? board.columns.filter((c) => c.id !== action.id) : board.columns;
  const visibleNotes = hideActions
    ? (board.notes || []).filter((n) => n.columnId !== action.id)
    : board.notes || [];
  return {
    code: board.code,
    name: board.name,
    facilitatorId: board.facilitatorId,
    phase: board.phase || 'active',
    votingClosed: votingIsOver(board),
    votingEndsAt: board.votingEndsAt || null,
    carryOverItems: (board.carryOverItems || []).map((item) => {
      const likes = Array.isArray(item.likes) ? item.likes : [];
      const { likes: _likes, ...rest } = item;
      return { ...rest, likeCount: likes.length, likedByMe: !!viewerId && likes.includes(viewerId) };
    }),
    columns,
    notes: visibleNotes.map((note) => {
      const votes = Array.isArray(note.votes) ? note.votes : [];
      const { votes: _votes, ...rest } = note;
      return { ...rest, voteCount: votes.length, votedByMe: !!viewerId && votes.includes(viewerId) };
    }),
    participants: Object.values(board.participants)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color || colorForSeq(0),
        isFacilitator: p.id === board.facilitatorId,
      }))
      .sort((a, b) => (a.isFacilitator === b.isFacilitator ? 0 : a.isFacilitator ? -1 : 1)),
  };
}

module.exports = {
  ExtendMinutes,
  extendVoting,
  votingIsOver,
  VotingMinutes,
  startVoting,
  expireVoting,
  removeParticipant,
  canWriteColumn,
  isActionColumnId,
  setVotingClosed,
  moveNote,
  toggleNoteVote,
  actionColumn,
  maxParticipants,
  loadBoard,
  saveBoard,
  deleteBoard,
  createBoard,
  joinBoard,
  isFacilitator,
  leaveBoard,
  addNote,
  updateNote,
  deleteNote,
  toggleCarryOverItem,
  openBoard,
  endBoard,
  actionItemsFromBoard,
  ledgerKeyFor,
  toggleCarryOverLike,
  saveActionItems,
  publicView,
};
