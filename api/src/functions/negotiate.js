'use strict';

const { app } = require('@azure/functions');
const realtime = require('../realtime');
const retroStore = require('../retroStore');
const { rateLimited } = require('../ratelimit');

const noCache = { 'Cache-Control': 'no-store' };

// GET /api/negotiate?group=retro:CODE&participantId=...  → { url } (null when
// Web PubSub isn't configured OR the caller isn't a member of the board, so the
// client transparently falls back to polling). Only retro groups are supported,
// and a token (with group send, for the typing indicator) is issued only to a
// verified board member — not to anyone who names a group.
app.http('negotiate', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'negotiate',
  handler: async (req) => {
    if (rateLimited(req, 'negotiate', 30, 60_000)) {
      return { status: 429, jsonBody: { error: 'Too many requests' }, headers: noCache };
    }
    const group = req.query.get('group') || '';
    const participantId = req.query.get('participantId') || '';
    const match = group.match(/^retro:(.+)$/);
    if (!match) return { status: 400, jsonBody: { error: 'unsupported group' }, headers: noCache };

    const board = await retroStore.loadBoard(match[1]);
    if (!board || !board.participants[participantId]) {
      return { status: 200, jsonBody: { url: null }, headers: noCache }; // non-member → poll
    }
    const url = await realtime.negotiate(group);
    return { status: 200, jsonBody: { url: url || null }, headers: noCache };
  },
});
