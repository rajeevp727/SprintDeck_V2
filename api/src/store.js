'use strict';

// In-memory session store.
// NOTE: Azure Static Web Apps managed Functions can cold-start and (rarely)
// scale to multiple instances. State here is not durable across either event.
// That is acceptable for live estimation with a small team — see README.

/** @type {Map<string, Session>} */
const sessions = new Map();

// The deck is the Fibonacci series (planning-poker variant: 1, 2, 3, 5, 8…)
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

// Prune sessions with no activity for this long, and participants not seen recently.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const PARTICIPANT_TTL_MS = 30 * 1000; // 30s — covers a couple missed polls

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
    if (now - s.lastActivity > SESSION_TTL_MS) sessions.delete(code);
  }
}

function pruneParticipants(session) {
  const now = Date.now();
  for (const [pid, p] of Object.entries(session.participants)) {
    // Never prune the moderator — they hold the session together.
    if (pid === session.moderatorId) continue;
    if (now - p.lastSeen > PARTICIPANT_TTL_MS) delete session.participants[pid];
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
    name: (name || '').trim() || 'Planning Poker',
    moderatorId: pid,
    story: '',
    status: 'waiting', // 'waiting' | 'voting' | 'revealed'
    deck: DECK,
    participants: {},
    createdAt: now,
    lastActivity: now,
  };
  session.participants[pid] = {
    id: pid,
    name: (moderatorName || '').trim() || 'Moderator',
    vote: null,
    lastSeen: now,
  };
  sessions.set(code, session);
  return { session, participantId: pid };
}

function joinSession(code, name) {
  const session = sessions.get(normalize(code));
  if (!session) return { error: 'not_found' };
  // Free up seats from anyone who already left before checking capacity.
  pruneParticipants(session);
  if (Object.keys(session.participants).length >= MAX_PARTICIPANTS) {
    return { error: 'full' };
  }
  const pid = genId();
  session.participants[pid] = {
    id: pid,
    name: (name || '').trim() || 'Guest',
    vote: null,
    lastSeen: Date.now(),
  };
  touch(session);
  return { session, participantId: pid };
}

function getSession(code) {
  return sessions.get(normalize(code)) || null;
}

function normalize(code) {
  return (code || '').trim().toUpperCase();
}

function isModerator(session, participantId) {
  return session.moderatorId === participantId;
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

  let average = null;
  let consensus = false;
  if (revealed) {
    const nums = Object.values(session.participants)
      .map((p) => Number(p.vote))
      .filter((n) => Number.isFinite(n));
    if (nums.length > 0) {
      average = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
      consensus = nums.every((n) => n === nums[0]);
    }
  }

  return {
    code: session.code,
    name: session.name,
    story: session.story,
    status: session.status,
    deck: session.deck,
    moderatorId: session.moderatorId,
    participants,
    average,
    consensus,
  };
}

module.exports = {
  sessions,
  DECK,
  MAX_PARTICIPANTS,
  createSession,
  joinSession,
  getSession,
  isModerator,
  publicView,
  pruneParticipants,
  touch,
};
