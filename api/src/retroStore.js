'use strict';

const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');
const realtime = require('./realtime');

const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
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

async function createBoard(name, facilitatorName, desiredCode, roomCode) {
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
  
  const carry = await loadActionItems(roomCode);
  const board = {
    code,
    name: (name || '').trim().slice(0, maxNameLen) || 'Sprint Retrospective',
    facilitatorId: pid,
    roomCode: normalize(roomCode) || null, 
    
    
    phase: 'review', 
    carryOverItems: carry.map((it) => ({ id: it.id, text: it.text, done: false })),
    columns: defaultColumns(),
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

function addNote(board, participantId, columnId, text) {
  const author = board.participants[participantId];
  if (!author) return false;
  if (!board.columns.some((c) => c.id === columnId)) return false;
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
  if (note.authorId !== participantId) return false; 
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

function deleteNote(board, participantId, noteId) {
  const note = board.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (note.authorId !== participantId && !isFacilitator(board, participantId)) return false;
  board.notes = board.notes.filter((n) => n.id !== noteId);
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

function publicView(board) {
  return {
    code: board.code,
    name: board.name,
    facilitatorId: board.facilitatorId,
    phase: board.phase || 'active',
    carryOverItems: board.carryOverItems || [],
    columns: board.columns,
    notes: board.notes,
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
  saveActionItems,
  publicView,
};
