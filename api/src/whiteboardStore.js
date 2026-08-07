'use strict';

const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');
const realtime = require('./realtime');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'whiteboards';

const memory = new Map();
const containerCache = new Map();

const boardMaxAgeMs = 8 * 60 * 60 * 1000; // 8h
const boardIdleMs = 4 * 60 * 60 * 1000; // 4h
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
  realtime.notifyGroup('whiteboard:' + board.code);
}

async function deleteBoard(code) {
  const norm = normalize(code);
  await removeRaw(norm);
  realtime.notifyGroup('whiteboard:' + norm);
}

async function createBoard(name, facilitatorName, desiredCode, roomCode, subRef) {
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
  const board = {
    code,
    name: (name || '').trim().slice(0, maxNameLen) || 'Whiteboard',
    facilitatorId: pid,
    roomCode: normalize(roomCode) || null,
    phase: 'active',
    elements: [],
    viewport: defaultViewport(),
    participants: {
      [pid]: { id: pid, name: (facilitatorName || '').trim().slice(0, maxNameLen) || 'Facilitator' },
    },
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
  board.participants[pid] = { id: pid, name: (name || '').trim().slice(0, maxNameLen) || 'Guest' };
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

function addElement(board, participantId, element) {
  const author = board.participants[participantId];
  if (!author) return false;
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
  const idx = board.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return false;
  const el = board.elements[idx];
  if (el.createdBy !== participantId && !isFacilitator(board, participantId)) return false;
  board.elements[idx] = { ...el, ...patch };
  return true;
}

function deleteElement(board, participantId, elementId) {
  const idx = board.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return false;
  const el = board.elements[idx];
  if (el.createdBy !== participantId && !isFacilitator(board, participantId)) return false;
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

function publicView(board) {
  return {
    code: board.code,
    name: board.name,
    facilitatorId: board.facilitatorId,
    phase: board.phase || 'active',
    elements: board.elements,
    viewport: board.viewport || defaultViewport(),
    participants: Object.values(board.participants).map((p) => ({
      id: p.id,
      name: p.name,
      isFacilitator: p.id === board.facilitatorId,
    })),
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
  leaveBoard,
  addElement,
  updateElement,
  deleteElement,
  clearElements,
  endBoard,
  publicView,
};
