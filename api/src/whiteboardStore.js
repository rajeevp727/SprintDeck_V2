'use strict';

const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');
const realtime = require('./realtime');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'whiteboards';

const memory = new Map();
const containerCache = new Map();

const boardMaxAgeMs = 8 * 60 * 60 * 1000;
const boardIdleMs = 4 * 60 * 60 * 1000;
const maxParticipants = 30;
const maxNameLen = 80;
const maxElements = 2000;

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

function defaultViewport() {
  return { x: 0, y: 0, zoom: 1 };
}

function ensureAcl(board) {
  if (!board.access) board.access = board.roomCode ? 'room' : 'open';
  if (!board.writers) board.writers = {};
  if (board.shareToken === undefined) board.shareToken = null;
  if (!board.presence) board.presence = {};
  if (!board.followPresenter) board.followPresenter = false;
  return board;
}

async function loadBoard(code) {
  const b = await readRaw(normalize(code));
  if (!b) return null;
  if (isExpired(b)) {
    await removeRaw(b.code);
    return null;
  }
  return ensureAcl(b);
}

async function saveBoard(board) {
  board.lastActivity = Date.now();
  await writeRaw(board);
  realtime.notifyGroup('whiteboard:' + board.code);
}

async function deleteBoard(code) {
  const norm = normalize(code);
  await removeRaw(norm);
  realtime.notifyGroup('whiteboard:' + norm);
}

async function createBoard(name, facilitatorName, desiredCode, roomCode, opts = {}) {
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
  const linkedRoom = normalize(roomCode) || null;
  const access = opts.access || (linkedRoom ? 'room' : 'open');
  const board = ensureAcl({
    code,
    name: (name || '').trim().slice(0, maxNameLen) || 'Whiteboard',
    facilitatorId: pid,
    roomCode: linkedRoom,
    access,
    shareToken: null,
    writers: {},
    presence: {},
    followPresenter: false,
    phase: 'active',
    elements: [],
    viewport: defaultViewport(),
    participants: {
      [pid]: { id: pid, name: (facilitatorName || '').trim().slice(0, maxNameLen) || 'Facilitator' },
    },
    createdAt: now,
    lastActivity: now,
  });

  
  if (Array.isArray(opts.seedParticipants)) {
    for (const sp of opts.seedParticipants) {
      if (!sp || !sp.id || sp.id === pid) continue;
      if (Object.keys(board.participants).length >= maxParticipants) break;
      board.participants[sp.id] = {
        id: sp.id,
        name: (sp.name || 'Teammate').trim().slice(0, maxNameLen),
      };
    }
  }

  await writeRaw(board);
  return { board, participantId: pid };
}

function canJoin(board, { shareToken, roomParticipantId } = {}) {
  const access = board.access || 'open';
  if (access === 'open') return { ok: true };
  if (access === 'link') {
    if (shareToken && board.shareToken && shareToken === board.shareToken) return { ok: true };
    
    if (roomParticipantId && board.roomCode) return { ok: true, needRoomProof: true };
    return { ok: false, error: 'forbidden' };
  }
  if (access === 'room') {
    if (roomParticipantId && board.roomCode) return { ok: true, needRoomProof: true };
    
    return { ok: false, error: 'room_only' };
  }
  return { ok: false, error: 'forbidden' };
}

async function joinBoard(code, name, opts = {}) {
  const board = await loadBoard(code);
  if (!board) return { error: 'not_found' };

  
  if (opts.participantId && board.participants[opts.participantId]) {
    const p = board.participants[opts.participantId];
    if (name && name.trim()) p.name = name.trim().slice(0, maxNameLen);
    await saveBoard(board);
    return { board, participantId: opts.participantId };
  }

  const gate = canJoin(board, opts);
  if (!gate.ok) return { error: gate.error || 'forbidden' };

  if (Object.keys(board.participants).length >= maxParticipants) {
    return { error: 'full' };
  }
  const pid = genId();
  board.participants[pid] = { id: pid, name: (name || '').trim().slice(0, maxNameLen) || 'Guest' };
  await saveBoard(board);
  return { board, participantId: pid };
}

function isFacilitator(board, participantId) {
  return board.facilitatorId === participantId;
}

function canWrite(board, participantId) {
  if (!board.participants[participantId]) return false;
  if (board.phase === 'ended') return false;
  if (isFacilitator(board, participantId)) return true;
  return !!(board.writers && board.writers[participantId]);
}

function leaveBoard(board, participantId) {
  if (participantId === board.facilitatorId) return false;
  if (!board.participants[participantId]) return false;
  delete board.participants[participantId];
  if (board.writers) delete board.writers[participantId];
  if (board.presence) delete board.presence[participantId];
  return true;
}

function setWriter(board, facilitatorId, targetId, allow) {
  if (!isFacilitator(board, facilitatorId)) return false;
  if (!board.participants[targetId]) return false;
  if (targetId === board.facilitatorId) return true;
  if (!board.writers) board.writers = {};
  if (allow) board.writers[targetId] = true;
  else delete board.writers[targetId];
  return true;
}

function enableShareLink(board, facilitatorId) {
  if (!isFacilitator(board, facilitatorId)) return null;
  board.shareToken = crypto.randomBytes(16).toString('hex');
  board.access = 'link';
  return board.shareToken;
}

function revokeShareLink(board, facilitatorId) {
  if (!isFacilitator(board, facilitatorId)) return false;
  board.shareToken = null;
  board.access = board.roomCode ? 'room' : 'open';
  return true;
}

function setFollowPresenter(board, facilitatorId, enabled) {
  if (!isFacilitator(board, facilitatorId)) return false;
  board.followPresenter = !!enabled;
  return true;
}

function updateViewport(board, participantId, viewport) {
  if (!isFacilitator(board, participantId)) return false;
  board.viewport = {
    x: Number(viewport.x) || 0,
    y: Number(viewport.y) || 0,
    zoom: Math.min(3, Math.max(0.25, Number(viewport.zoom) || 1)),
  };
  return true;
}

function setPresence(board, participantId, patch) {
  if (!board.participants[participantId]) return false;
  if (!board.presence) board.presence = {};
  const prev = board.presence[participantId] || {};
  board.presence[participantId] = {
    id: participantId,
    name: board.participants[participantId].name,
    x: patch.x ?? prev.x ?? 0,
    y: patch.y ?? prev.y ?? 0,
    tool: patch.tool ?? prev.tool ?? 'select',
    editingId: patch.editingId ?? null,
    at: Date.now(),
  };
  return true;
}

function addElement(board, participantId, element) {
  if (!canWrite(board, participantId)) return false;
  const author = board.participants[participantId];
  if (board.elements.length >= maxElements) return false;
  const el = {
    id: genId(),
    ...element,
    createdAt: Date.now(),
    createdBy: participantId,
    createdByName: author.name,
  };
  board.elements.push(el);
  return el;
}

function updateElement(board, participantId, elementId, patch) {
  if (!canWrite(board, participantId)) return false;
  const idx = board.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return false;
  const el = board.elements[idx];
  
  const { id, createdAt, createdBy, createdByName, ...rest } = patch || {};
  board.elements[idx] = { ...el, ...rest };
  return true;
}

function deleteElement(board, participantId, elementId) {
  if (!canWrite(board, participantId)) return false;
  const idx = board.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return false;
  board.elements.splice(idx, 1);
  return true;
}

function clearElements(board, participantId) {
  if (!isFacilitator(board, participantId)) return false;
  board.elements = [];
  return true;
}

function endBoard(board) {
  board.phase = 'ended';
}

function publicView(board, viewerId) {
  ensureAcl(board);
  const now = Date.now();
  const presence = Object.values(board.presence || {})
    .filter((p) => now - (p.at || 0) < 15000)
    .map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      tool: p.tool,
      editingId: p.editingId || null,
      isFacilitator: p.id === board.facilitatorId,
    }));

  return {
    code: board.code,
    name: board.name,
    facilitatorId: board.facilitatorId,
    roomCode: board.roomCode || null,
    access: board.access,
    hasShareLink: !!board.shareToken,
    
    shareToken: viewerId && isFacilitator(board, viewerId) ? board.shareToken : null,
    phase: board.phase || 'active',
    elements: board.elements,
    viewport: board.viewport || defaultViewport(),
    followPresenter: !!board.followPresenter,
    writers: Object.keys(board.writers || {}),
    canWrite: viewerId ? canWrite(board, viewerId) : false,
    isFacilitator: viewerId ? isFacilitator(board, viewerId) : false,
    participants: Object.values(board.participants).map((p) => ({
      id: p.id,
      name: p.name,
      isFacilitator: p.id === board.facilitatorId,
      canWrite: canWrite(board, p.id),
    })),
    presence,
  };
}

module.exports = {
  maxParticipants,
  loadBoard,
  saveBoard,
  deleteBoard,
  createBoard,
  joinBoard,
  isFacilitator,
  canWrite,
  leaveBoard,
  setWriter,
  enableShareLink,
  revokeShareLink,
  setFollowPresenter,
  updateViewport,
  setPresence,
  addElement,
  updateElement,
  deleteElement,
  clearElements,
  endBoard,
  publicView,
};
