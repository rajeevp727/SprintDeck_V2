'use strict';

const { CosmosClient } = require('@azure/cosmos');

// ───────────────────────────────────────────────────────────────────────────
// Backend selection.
// If a Cosmos DB connection string is configured (app setting
// COSMOS_CONNECTION_STRING), sessions are persisted in Cosmos — shared across
// every Function instance and durable across cold starts. This fixes "room not
// available" (instance split) and "rooms expired" (cold-start memory loss).
// Cosmos native TTL also auto-deletes idle rooms (see IDLE_SECONDS below).
// Without a connection string it falls back to an in-memory Map (single
// instance only) so local dev / unconfigured deploys still run.
// ───────────────────────────────────────────────────────────────────────────
const CONN = process.env.COSMOS_CONNECTION_STRING || '';
const DB_NAME = 'sprintdeck';
const CONTAINER_NAME = 'sessions';

const memory = new Map(); // fallback when no connection string
let containerPromise = null;

function getContainer() {
  if (!CONN) return null;
  if (!containerPromise) {
    const client = new CosmosClient(CONN);
    containerPromise = (async () => {
      // Provisioned (free-tier) accounts need shared throughput; serverless
      // accounts reject it — try with, fall back to without.
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: DB_NAME, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: DB_NAME }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: CONTAINER_NAME,
        partitionKey: { paths: ['/code'] },
        // Native TTL: a room auto-deletes this many seconds after its last write
        // (_ts), giving us automatic idle expiry without any cleanup job.
        defaultTtl: SESSION_IDLE_MS / 1000,
      });
      return container;
    })().catch((e) => {
      // Don't cache a failed init (bad/rotated key, transient outage) — reset so
      // the next request retries instead of replaying the same stale error.
      containerPromise = null;
      throw e;
    });
  }
  return containerPromise;
}

// Low-level persistence (code already normalized to upper-case).
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

async function writeRaw(session) {
  const c = getContainer();
  if (c) {
    await (await c).items.upsert({
      id: session.code,
      code: session.code,
      doc: session,
      ttl: SESSION_IDLE_MS / 1000, // refresh idle expiry on every write
    });
  } else {
    memory.set(session.code, session);
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

// ───────────────────────────────────────────────────────────────────────────
// Deck
// ───────────────────────────────────────────────────────────────────────────
const DECK_MAX = 21;

function buildFibonacciDeck(max) {
  const deck = [1];
  if (max >= 2) deck.push(2);
  while (deck.length >= 2) {
    const next = deck[deck.length - 1] + deck[deck.length - 2];
    if (next > max) break;
    deck.push(next);
  }
  return deck.map(String);
}

const DECK = buildFibonacciDeck(DECK_MAX);

// ───────────────────────────────────────────────────────────────────────────
// Limits
// ───────────────────────────────────────────────────────────────────────────
// A session is treated as gone when EITHER it has had no activity for
// SESSION_IDLE_MS (2h) or its total age exceeds SESSION_MAX_AGE_MS (5h).
const SESSION_MAX_AGE_MS = 5 * 60 * 60 * 1000; // 5h
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 2h
const MAX_PARTICIPANTS = 20; // moderator included

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L ambiguity

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalize(code) {
  return (code || '').trim().toUpperCase();
}

function isExpired(s) {
  const now = Date.now();
  return now - s.lastActivity > SESSION_IDLE_MS || now - s.createdAt > SESSION_MAX_AGE_MS;
}

// ───────────────────────────────────────────────────────────────────────────
// Public session API (all async — they hit storage)
// ───────────────────────────────────────────────────────────────────────────

// Load a session, lazily dropping it if it has expired.
async function loadSession(code) {
  const s = await readRaw(normalize(code));
  if (!s) return null;
  if (isExpired(s)) {
    await removeRaw(s.code);
    return null;
  }
  return s;
}

// Persist a session; every save bumps lastActivity (keeps the room alive).
async function saveSession(session) {
  session.lastActivity = Date.now();
  await writeRaw(session);
}

async function deleteSession(code) {
  await removeRaw(normalize(code));
}

async function genUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (await readRaw(code));
  return code;
}

const CODE_RE = /^[A-Z0-9-]{3,24}$/;

async function createSession(name, moderatorName, desiredCode) {
  let code;
  const wanted = normalize(desiredCode);
  if (wanted) {
    if (!CODE_RE.test(wanted)) return { error: 'invalid' };
    if (await loadSession(wanted)) return { error: 'taken' };
    code = wanted;
  } else {
    code = await genUniqueCode();
  }
  const pid = genId();
  const now = Date.now();
  const session = {
    code,
    name: (name || '').trim() || 'SprintDeck',
    moderatorId: pid,
    story: '',
    status: 'waiting', // 'waiting' | 'voting' | 'revealed'
    deck: DECK,
    participants: {
      [pid]: { id: pid, name: (moderatorName || '').trim() || 'Moderator', vote: null },
    },
    queue: [], // [{ id, title }]
    history: [], // [{ id, title, average, median, min, max, consensus, votes, at }]
    createdAt: now,
    lastActivity: now,
  };
  await writeRaw(session);
  return { session, participantId: pid };
}

async function joinSession(code, name) {
  const session = await loadSession(code);
  if (!session) return { error: 'not_found' };
  if (Object.keys(session.participants).length >= MAX_PARTICIPANTS) {
    return { error: 'full' };
  }
  const pid = genId();
  session.participants[pid] = { id: pid, name: (name || '').trim() || 'Guest', vote: null };
  await saveSession(session);
  return { session, participantId: pid };
}

function isModerator(session, participantId) {
  return session.moderatorId === participantId;
}

// ───────────────────────────────────────────────────────────────────────────
// Domain mutators — operate on a loaded session object (sync); the caller
// persists with saveSession afterwards.
// ───────────────────────────────────────────────────────────────────────────
function addToQueue(session, titles) {
  for (const t of titles) {
    const title = String(t || '').trim();
    if (title) session.queue.push({ id: genId(), title });
  }
}

function removeFromQueue(session, id) {
  session.queue = session.queue.filter((s) => s.id !== id);
}

// Start estimating a story: an explicit title if given, else the next queued
// one. Clears votes and opens voting. Returns false if there's nothing to start.
function startStory(session, explicitTitle) {
  let title = String(explicitTitle || '').trim();
  if (!title && session.queue.length > 0) title = session.queue.shift().title;
  if (!title) return false;
  session.story = title;
  for (const p of Object.values(session.participants)) p.vote = null;
  session.status = 'voting';
  return true;
}

// Snapshot the current revealed result into history, then advance to the next
// queued story (or back to 'waiting' if the queue is empty).
function saveAndAdvance(session) {
  if (session.story) {
    const stats = voteStats(session);
    session.history.push({ id: genId(), title: session.story, ...stats, at: Date.now() });
  }
  if (!startStory(session)) {
    session.story = '';
    session.status = 'waiting';
  }
}

// Numeric stats over the current votes (ignores non-numeric like ? / ☕).
function voteStats(session) {
  const votes = Object.values(session.participants)
    .filter((p) => p.vote !== null)
    .map((p) => ({ name: p.name, vote: p.vote }));
  const nums = votes
    .map((v) => Number(v.vote))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  let average = null;
  let median = null;
  let min = null;
  let max = null;
  let consensus = false;
  if (nums.length > 0) {
    average = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    const mid = Math.floor(nums.length / 2);
    median = nums.length % 2 ? nums[mid] : Math.round(((nums[mid - 1] + nums[mid]) / 2) * 100) / 100;
    min = nums[0];
    max = nums[nums.length - 1];
    consensus = nums.every((n) => n === nums[0]);
  }
  return { votes, average, median, min, max, consensus };
}

// Client-safe view. Votes stay hidden until 'revealed'; the requester always
// sees their own selection so the UI can highlight it.
function publicView(session, requesterId) {
  const revealed = session.status === 'revealed';
  const participants = Object.values(session.participants)
    .map((p) => ({
      id: p.id,
      name: p.name,
      isModerator: p.id === session.moderatorId,
      hasVoted: p.vote !== null,
      vote: revealed || p.id === requesterId ? p.vote : null,
    }))
    .sort((a, b) => (a.isModerator === b.isModerator ? 0 : a.isModerator ? -1 : 1));

  const stats = revealed ? voteStats(session) : { average: null, consensus: false };

  return {
    code: session.code,
    name: session.name,
    story: session.story,
    status: session.status,
    deck: session.deck,
    moderatorId: session.moderatorId,
    participants,
    queue: session.queue,
    history: session.history,
    average: stats.average,
    consensus: stats.consensus,
  };
}

module.exports = {
  MAX_PARTICIPANTS,
  loadSession,
  saveSession,
  deleteSession,
  createSession,
  joinSession,
  isModerator,
  publicView,
  addToQueue,
  removeFromQueue,
  startStory,
  saveAndAdvance,
};
