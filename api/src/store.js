'use strict';

// @azure/cosmos is required lazily inside getContainer() so this module can be
// imported (e.g. by unit tests) without the dependency being installed/loaded.

// ───────────────────────────────────────────────────────────────────────────
// Backend selection.
// If a Cosmos DB connection string is configured (app setting
// COSMOS_CONNECTION_STRING), sessions are persisted in Cosmos — shared across
// every Function instance and durable across cold starts. This fixes "room not
// available" (instance split) and "rooms expired" (cold-start memory loss).
// Cosmos native TTL also auto-deletes idle rooms (see idleSeconds below).
// Without a connection string it falls back to an in-memory Map (single
// instance only) so local dev / unconfigured deploys still run.
// ───────────────────────────────────────────────────────────────────────────
const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = 'sprintdeck';
const containerName = 'sessions';

const memory = new Map(); // fallback when no connection string
let containerPromise = null;

function getContainer() {
  if (!conn) return null;
  if (!containerPromise) {
    const { CosmosClient } = require('@azure/cosmos');
    const client = new CosmosClient(conn);
    containerPromise = (async () => {
      // Provisioned (free-tier) accounts need shared throughput; serverless
      // accounts reject it — try with, fall back to without.
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: dbName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: dbName }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: containerName,
        partitionKey: { paths: ['/code'] },
        // Native TTL: a room auto-deletes this many seconds after its last write
        // (_ts), giving us automatic idle expiry without any cleanup job.
        defaultTtl: sessionIdleMs / 1000,
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
      ttl: sessionIdleMs / 1000, // refresh idle expiry on every write
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
const deckMax = 21;

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

const deck = buildFibonacciDeck(deckMax);

// ───────────────────────────────────────────────────────────────────────────
// Limits
// ───────────────────────────────────────────────────────────────────────────
// A session is treated as gone when EITHER it has had no activity for
// sessionIdleMs or its total age exceeds sessionMaxAgeMs. "Activity" includes a
// member polling the room (see touchSession), so an open room stays alive while
// anyone is viewing it; idle expiry only fires once everyone has left. Override
// via app settings SESSION_IDLE_HOURS (default 2) and SESSION_MAX_AGE_HOURS
// (default 24). Cosmos native TTL uses sessionIdleMs, refreshed on each touch.
const sessionIdleMs = (Number(process.env.SESSION_IDLE_HOURS) || 2) * 60 * 60 * 1000;
const sessionMaxAgeMs = (Number(process.env.SESSION_MAX_AGE_HOURS) || 24) * 60 * 60 * 1000;
const maxParticipants = 20; // moderator included
// A polled read keeps the room alive, but only refreshes its lifetime once per
// this window (not on every 1.5s poll) to avoid hammering Cosmos RUs.
const touchIntervalMs = 5 * 60 * 1000;

const codeChars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L ambiguity

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += codeChars[Math.floor(Math.random() * codeChars.length)];
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
  return now - s.lastActivity > sessionIdleMs || now - s.createdAt > sessionMaxAgeMs;
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

// Keep an actively-viewed room alive: a polling read counts as activity, so a
// room open in someone's browser doesn't age out from under them. Throttled to
// touchIntervalMs. Uses a Cosmos partial patch (not a full upsert) so a
// concurrent vote/message write is never clobbered by a stale read-modify-write.
async function touchSession(session) {
  const now = Date.now();
  if (now - session.lastActivity < touchIntervalMs) return;
  session.lastActivity = now;
  const c = getContainer();
  if (c) {
    try {
      await (await c).item(session.code, session.code).patch([
        { op: 'set', path: '/doc/lastActivity', value: now },
        { op: 'set', path: '/ttl', value: Math.floor(sessionIdleMs / 1000) },
      ]);
    } catch {
      /* best-effort keep-alive — ignore transient patch failures */
    }
  }
  // In-memory fallback: `session` is the stored object reference, so mutating
  // lastActivity above already persists it; no write needed.
}

async function genUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (await readRaw(code));
  return code;
}

const codeRe = /^[A-Z0-9-]{3,24}$/;

async function createSession(name, moderatorName, desiredCode, chatEnabled) {
  let code;
  const wanted = normalize(desiredCode);
  if (wanted) {
    if (!codeRe.test(wanted)) return { error: 'invalid' };
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
    finished: false, // moderator clicked Finish → unlocks Results
    currentEntryId: null, // history entry id for the story being estimated
    currentLinear: null, // { linearId, identifier } when the current story is a Linear issue
    deck: deck,
    participants: {
      [pid]: { id: pid, name: (moderatorName || '').trim() || 'Moderator', vote: null },
    },
    queue: [], // [{ id, title, linearId?, identifier? }]
    history: [], // [{ id, title, average, median, min, max, consensus, votes, at }]
    chatEnabled: !!chatEnabled, // shared team chat unlocked by moderator's PRO+ plan
    messages: [], // [{ id, participantId, name, text, at, replyTo }]
    createdAt: now,
    lastActivity: now,
  };
  await writeRaw(session);
  return { session, participantId: pid };
}

async function joinSession(code, name) {
  const session = await loadSession(code);
  if (!session) return { error: 'notFound' };
  if (Object.keys(session.participants).length >= maxParticipants) {
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

// Moderator removes a participant. The moderator can't be kicked.
function kickParticipant(session, targetId) {
  if (targetId === session.moderatorId) return false;
  if (!session.participants[targetId]) return false;
  delete session.participants[targetId];
  return true;
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

// Queue resolved Linear issues, carrying the linkage needed to write estimates
// back later. Title is the plain description; the identifier is stored separately
// so the UI can render it as a clickable "ENG-876" link before the description.
function addLinearToQueue(session, issues) {
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue?.linearId || !issue?.identifier) continue;
    const label = String(issue.title || '').trim();
    session.queue.push({
      id: genId(),
      title: label || issue.identifier,
      linearId: issue.linearId,
      identifier: issue.identifier,
      url: issue.url ?? `https://linear.app/trivinna/issue/${issue.identifier}`,
      estimate: issue.estimate ?? null,
      status: issue.status ?? null,
    });
  }
}

function removeFromQueue(session, id) {
  session.queue = session.queue.filter((s) => s.id !== id);
}

// Reorder the queue to match the given list of story ids (any not listed are
// appended in their existing order, so a stale client can't drop stories).
function reorderQueue(session, orderedIds) {
  const ids = Array.isArray(orderedIds) ? orderedIds : [];
  const byId = new Map(session.queue.map((s) => [s.id, s]));
  const reordered = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) {
      reordered.push(item);
      byId.delete(id);
    }
  }
  for (const item of session.queue) if (byId.has(item.id)) reordered.push(item);
  session.queue = reordered;
}

// Open a voting round. Uses an explicit title if given, else the next queued
// story. A story is OPTIONAL — with no title and an empty queue this starts a
// plain "just vote" round (story = '').
function startStory(session, explicitTitle) {
  let title = String(explicitTitle || '').trim();
  // A queued story (pulled when no explicit title is given) may be Linear-backed;
  // remember its linkage for this round so reveal can carry it into history.
  session.currentLinear = null;
  if (!title && session.queue.length > 0) {
    const next = session.queue.shift();
    title = next.title;
    if (next.linearId && next.identifier) {
      session.currentLinear = {
        linearId: next.linearId,
        identifier: next.identifier,
        title: next.title,
        url: next.url ?? null,
      };
    }
  }
  // Starting fresh after a finished session (results were viewed) wipes the old
  // history so the new round starts clean. A mid-session next story keeps it.
  if (session.finished) session.history = [];
  // No story name (just-vote mode) → auto-number the iteration so results read well.
  if (!title) title = `Iteration ${session.history.length + 1}`;
  session.story = title;
  for (const p of Object.values(session.participants)) p.vote = null;
  session.status = 'voting';
  session.finished = false; // starting a round un-finishes the session
  session.currentEntryId = null; // next reveal creates a fresh history entry
}

// Reveal the current story and auto-save its result to history. Re-revealing
// the same story (after "Vote again") updates the same entry instead of
// duplicating it.
function revealAndSave(session) {
  session.status = 'revealed';
  const stats = voteStats(session);
  const linear = session.currentLinear || {};
  const data = {
    title: session.story,
    ...stats,
    linearId: linear.linearId ?? null,
    identifier: linear.identifier ?? null,
    url: linear.url ?? null,
    pushedEstimate: null,
    at: Date.now(),
  };
  const idx = session.currentEntryId
    ? session.history.findIndex((h) => h.id === session.currentEntryId)
    : -1;
  if (idx >= 0) {
    // Re-reveal (after "Vote again") — keep any estimate already pushed to Linear.
    const prev = session.history[idx];
    session.history[idx] = { id: session.currentEntryId, ...data, pushedEstimate: prev.pushedEstimate ?? null };
  } else {
    const id = genId();
    session.history.push({ id, ...data });
    session.currentEntryId = id;
  }
}

// Record that a history entry's estimate was written back to Linear.
function markPushed(session, entryId, estimate) {
  const entry = session.history.find((h) => h.id === entryId);
  if (!entry) return false;
  entry.pushedEstimate = estimate;
  entry.pushedAt = Date.now();
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Team chat (PRO+). Operates on a loaded session (sync); caller persists.
// ───────────────────────────────────────────────────────────────────────────
const MaxMessageLen = 2000;
const MaxReplyExcerpt = 140;
const MaxMessages = 200; // ring buffer — keep only the most recent

// Append a message; returns it, or null if the sender isn't in the room / text
// is empty. replyTo is a snapshot { id, name, excerpt } so the quote survives
// after the original scrolls out of the retained window.
function addMessage(session, participantId, text, replyTo) {
  const p = session.participants[participantId];
  if (!p) return null;
  const clean = String(text || '').trim().slice(0, MaxMessageLen);
  if (!clean) return null;
  if (!Array.isArray(session.messages)) session.messages = [];

  let reply = null;
  if (replyTo && replyTo.id) {
    reply = {
      id: String(replyTo.id).slice(0, 64),
      name: String(replyTo.name || '').slice(0, 80),
      excerpt: String(replyTo.excerpt || replyTo.text || '').slice(0, MaxReplyExcerpt),
    };
  }

  const message = { id: genId(), participantId, name: p.name, text: clean, at: Date.now(), replyTo: reply, likes: [] };
  session.messages.push(message);
  if (session.messages.length > MaxMessages) session.messages = session.messages.slice(-MaxMessages);
  return message;
}

function getMessages(session) {
  return Array.isArray(session.messages) ? session.messages : [];
}

// Toggle a participant's like on a message. Returns the message, or null if not
// found. likes is an array of participant ids (its length is the like count).
function toggleLike(session, messageId, participantId) {
  const msgs = Array.isArray(session.messages) ? session.messages : [];
  const message = msgs.find((m) => m.id === messageId);
  if (!message) return null;
  if (!Array.isArray(message.likes)) message.likes = [];
  const i = message.likes.indexOf(participantId);
  if (i >= 0) message.likes.splice(i, 1);
  else message.likes.push(participantId);
  return message;
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
    finished: !!session.finished,
    currentEntryId: session.currentEntryId ?? null,
    currentLinear: session.currentLinear ?? null,
    deck: session.deck,
    moderatorId: session.moderatorId,
    participants,
    queue: session.queue,
    history: session.history,
    average: stats.average,
    consensus: stats.consensus,
    chatEnabled: !!session.chatEnabled, // messages load separately, not in this poll
  };
}

module.exports = {
  maxParticipants,
  loadSession,
  saveSession,
  touchSession,
  deleteSession,
  createSession,
  joinSession,
  isModerator,
  kickParticipant,
  publicView,
  addToQueue,
  addLinearToQueue,
  removeFromQueue,
  reorderQueue,
  startStory,
  revealAndSave,
  markPushed,
  addMessage,
  getMessages,
  toggleLike,
};
