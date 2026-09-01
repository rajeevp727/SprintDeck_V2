'use strict';

const crypto = require('crypto');
const conn = process.env.COSMOS_CONNECTION_STRING || '';
const dbName = process.env.COSMOS_DB_NAME || 'sprintdeck';
const containerName = 'sessions';
const maxNameLen = 80;
const maxTitleLen = 200;
const maxQueue = 100;

const memory = new Map(); 
let containerPromise = null;

function getContainer() {
  if (!conn) return null;
  if (!containerPromise) {
    const { CosmosClient } = require('@azure/cosmos');
    const client = new CosmosClient(conn);
    containerPromise = (async () => {
      
      
      let database;
      try {
        ({ database } = await client.databases.createIfNotExists({ id: dbName, throughput: 400 }));
      } catch {
        ({ database } = await client.databases.createIfNotExists({ id: dbName }));
      }
      const { container } = await database.containers.createIfNotExists({
        id: containerName,
        partitionKey: { paths: ['/code'] },
        
        
        defaultTtl: sessionIdleMs / 1000,
      });
      return container;
    })().catch((e) => {
      
      
      containerPromise = null;
      throw e;
    });
  }
  return containerPromise;
}

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
      ttl: sessionIdleMs / 1000, 
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

const sessionIdleMs = (Number(process.env.SESSION_IDLE_HOURS) || 2) * 60 * 60 * 1000;
const sessionMaxAgeMs = (Number(process.env.SESSION_MAX_AGE_HOURS) || 24) * 60 * 60 * 1000;
const maxParticipants = 20; 

const touchIntervalMs = 5 * 60 * 1000;

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

function isExpired(s) {
  const now = Date.now();
  return now - s.lastActivity > sessionIdleMs || now - s.createdAt > sessionMaxAgeMs;
}

async function loadSession(code) {
  const s = await readRaw(normalize(code));
  if (!s) return null;
  if (isExpired(s)) {
    await removeRaw(s.code);
    return null;
  }
  return s;
}

async function saveSession(session) {
  session.lastActivity = Date.now();
  await writeRaw(session);
}

async function deleteSession(code) {
  await removeRaw(normalize(code));
}

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
    } catch { void 0; }
  }
  
  
}

async function genUniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (await readRaw(code));
  return code;
}

const codeRe = /^[A-Z0-9-]{3,24}$/;

async function createSession(name, moderatorName, desiredCode) {
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
    name: (name || '').trim().slice(0, maxNameLen) || 'SprintDeck',
    moderatorId: pid,
    story: '',
    status: 'waiting', 
    finished: false, 
    currentEntryId: null, 
    currentLinear: null, 
    deck: deck,
    participants: {
      [pid]: { id: pid, name: (moderatorName || '').trim().slice(0, maxNameLen) || 'Moderator', vote: null },
    },
    queue: [], 
    history: [], 
    chatEnabled: false, 
    messages: [], 
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
  session.participants[pid] = { id: pid, name: (name || '').trim().slice(0, maxNameLen) || 'Guest', vote: null };
  await saveSession(session);
  return { session, participantId: pid };
}

function isModerator(session, participantId) {
  return session.moderatorId === participantId;
}

function kickParticipant(session, targetId) {
  if (targetId === session.moderatorId) return false;
  if (!session.participants[targetId]) return false;
  delete session.participants[targetId];
  return true;
}

function addToQueue(session, titles) {
  for (const t of titles) {
    if (session.queue.length >= maxQueue) break; 
    const title = String(t || '').trim().slice(0, maxTitleLen);
    if (title) session.queue.push({ id: genId(), title });
  }
}

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

function startStory(session, explicitTitle) {
  let title = String(explicitTitle || '').trim();

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

  if (session.finished) session.history = [];

  if (!title) title = `Iteration ${session.history.length + 1}`;
  session.story = title.slice(0, maxTitleLen);
  for (const p of Object.values(session.participants)) p.vote = null;
  session.status = 'voting';
  session.finished = false; 
  session.currentEntryId = null; 
}

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
    
    const prev = session.history[idx];
    session.history[idx] = { id: session.currentEntryId, ...data, pushedEstimate: prev.pushedEstimate ?? null };
  } else {
    const id = genId();
    session.history.push({ id, ...data });
    session.currentEntryId = id;
  }
}

function markPushed(session, entryId, estimate) {
  const entry = session.history.find((h) => h.id === entryId);
  if (!entry) return false;
  entry.pushedEstimate = estimate;
  entry.pushedAt = Date.now();
  return true;
}

const MaxMessageLen = 2000;
const MaxReplyExcerpt = 140;
const MaxMessages = 200; 

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

function toggleLike(session, messageId, participantId) {
  const msgs = Array.isArray(session.messages) ? session.messages : [];
  const message = msgs.find((m) => m.id === messageId);
  if (!message) return null;
  const p = session.participants[participantId];
  if (!p) return null;
  const likes = (Array.isArray(message.likes) ? message.likes : []).map((l) =>
    typeof l === 'string' ? { id: l, name: '', at: 0 } : l,
  );
  const i = likes.findIndex((l) => l.id === participantId);
  if (i >= 0) likes.splice(i, 1);
  else likes.push({ id: participantId, name: p.name, at: Date.now() });
  message.likes = likes;
  return message;
}

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
    chatEnabled: !!session.chatEnabled, 
    retroCode: session.retroCode ?? null, 
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
