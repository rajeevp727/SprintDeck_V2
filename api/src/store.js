'use strict';

// In-memory session store.
// NOTE: Azure Static Web Apps managed Functions can cold-start and (rarely)
// scale to multiple instances. State here is not durable across either event.
// That is acceptable for live estimation with a small team — see README.

/** @type {Map<string, Session>} */
const sessions = new Map();

// The deck is the Fibonacci series (estimation variant: 1, 2, 3, 5, 8…)
// generated up to DECK_MAX — change the max in one place, the deck follows.
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

// Whole-session cleanup limits (memory housekeeping only; participants are
// NEVER removed for being idle). A session is dropped when EITHER:
//   - it has had no activity for SESSION_IDLE_MS (60 min idle), or
//   - its total age exceeds SESSION_MAX_AGE_MS (5h hard cap).
const SESSION_MAX_AGE_MS = 5 * 60 * 60 * 1000; // 5h
const SESSION_IDLE_MS = 60 * 60 * 1000; // 60 min

// Max members per room (moderator included).
const MAX_PARTICIPANTS = 20;

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L ambiguity

function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (sessions.has(code));
  return code;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function pruneSessions() {
  const now = Date.now();
  for (const [code, s] of sessions) {
    const idle = now - s.lastActivity > SESSION_IDLE_MS;
    const tooOld = now - s.createdAt > SESSION_MAX_AGE_MS;
    if (idle || tooOld) sessions.delete(code);
  }
}

function touch(session) {
  session.lastActivity = Date.now();
}

function createSession(name, moderatorName) {
  pruneSessions();
  const code = genCode();
  const pid = genId();
  const now = Date.now();
  /** @type {Session} */
  const session = {
    code,
    name: (name || '').trim() || 'SprintDeck',
    moderatorId: pid,
    story: '', // title of the story currently being estimated
    status: 'waiting', // 'waiting' | 'voting' | 'revealed'
    deck: DECK,
    participants: {},
    queue: [], // upcoming stories: [{ id, title }]
    history: [], // completed estimates: [{ id, title, average, median, min, max, consensus, votes, at }]
    createdAt: now,
    lastActivity: now,
  };
  session.participants[pid] = {
    id: pid,
    name: (moderatorName || '').trim() || 'Moderator',
    vote: null,
  };
  sessions.set(code, session);
  return { session, participantId: pid };
}

function joinSession(code, name) {
  const session = sessions.get(normalize(code));
  if (!session) return { error: 'not_found' };
  if (Object.keys(session.participants).length >= MAX_PARTICIPANTS) {
    return { error: 'full' };
  }
  const pid = genId();
  session.participants[pid] = {
    id: pid,
    name: (name || '').trim() || 'Guest',
    vote: null,
  };
  touch(session);
  return { session, participantId: pid };
}

function getSession(code) {
  return sessions.get(normalize(code)) || null;
}

// Moderator ends the room: remove it entirely. Everyone else's next poll then
// 404s and the client bounces them back to the join screen.
function endSession(code) {
  return sessions.delete(normalize(code));
}

function normalize(code) {
  return (code || '').trim().toUpperCase();
}

function isModerator(session, participantId) {
  return session.moderatorId === participantId;
}

// --- Story queue & history -------------------------------------------------

// Add one or more story titles to the end of the queue.
function addToQueue(session, titles) {
  for (const t of titles) {
    const title = String(t || '').trim();
    if (title) session.queue.push({ id: genId(), title });
  }
  touch(session);
}

function removeFromQueue(session, id) {
  session.queue = session.queue.filter((s) => s.id !== id);
  touch(session);
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
  touch(session);
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
    touch(session);
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

// Build a client-safe view. Votes stay hidden until 'revealed'; the requester
// always sees their own selection so the UI can highlight it.
function publicView(session, requesterId) {
  const revealed = session.status === 'revealed';
  const participants = Object.values(session.participants)
    .map((p) => ({
      id: p.id,
      name: p.name,
      isModerator: p.id === session.moderatorId,
      hasVoted: p.vote !== null,
      // Reveal everyone's vote when revealed; otherwise only the requester's own.
      vote: revealed || p.id === requesterId ? p.vote : null,
    }))
    .sort((a, b) => (a.isModerator === b.isModerator ? 0 : a.isModerator ? -1 : 1));

  const stats = revealed
    ? voteStats(session)
    : { average: null, median: null, min: null, max: null, consensus: false };

  // Highest/lowest voters surface who to discuss with (only when revealed).
  let lowVoters = [];
  let highVoters = [];
  if (revealed && stats.min !== null && stats.max !== stats.min) {
    lowVoters = stats.votes.filter((v) => Number(v.vote) === stats.min).map((v) => v.name);
    highVoters = stats.votes.filter((v) => Number(v.vote) === stats.max).map((v) => v.name);
  }

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
    median: stats.median,
    min: stats.min,
    max: stats.max,
    consensus: stats.consensus,
    lowVoters,
    highVoters,
  };
}

module.exports = {
  MAX_PARTICIPANTS,
  createSession,
  joinSession,
  getSession,
  endSession,
  isModerator,
  publicView,
  addToQueue,
  removeFromQueue,
  startStory,
  saveAndAdvance,
  touch,
};
