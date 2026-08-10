'use strict';

const { app } = require('@azure/functions');
const realtime = require('../realtime');
const retroStore = require('../retroStore');
const whiteboardStore = require('../whiteboardStore');
const { rateLimited } = require('../ratelimit');

const noCache = { 'Cache-Control': 'no-store' };

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

    const retroMatch = group.match(/^retro:(.+)$/);
    if (retroMatch) {
      const board = await retroStore.loadBoard(retroMatch[1]);
      if (!board || !board.participants[participantId]) {
        return { status: 200, jsonBody: { url: null }, headers: noCache };
      }
      const url = await realtime.negotiate(group);
      return { status: 200, jsonBody: { url: url || null }, headers: noCache };
    }

    const wbMatch = group.match(/^whiteboard:(.+)$/);
    if (wbMatch) {
      const board = await whiteboardStore.loadBoard(wbMatch[1]);
      if (!board || !board.participants[participantId]) {
        return { status: 200, jsonBody: { url: null }, headers: noCache };
      }
      const url = await realtime.negotiate(group);
      return { status: 200, jsonBody: { url: url || null }, headers: noCache };
    }

    return { status: 400, jsonBody: { error: 'unsupported group' }, headers: noCache };
  },
});
