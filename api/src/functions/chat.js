'use strict';

// Team chat (PRO+) backed by Azure Web PubSub. Clients negotiate a room-scoped
// access URL, connect, and join the room group. Sending POSTs to /chat/message,
// which persists the message and broadcasts it to the group for live delivery.
// Degrades gracefully when WEBPUBSUB_CONNECTION_STRING is unset.

const { app } = require('@azure/functions');
const store = require('../store');

const noCache = { 'Cache-Control': 'no-store' };
function ok(body) {
  return { status: 200, jsonBody: body, headers: noCache };
}
function bad(message, status = 400) {
  return { status, jsonBody: { error: message }, headers: noCache };
}
async function readBody(req) {
  try {
    return (await req.json()) || {};
  } catch {
    return {};
  }
}

const Conn = process.env.WEBPUBSUB_CONNECTION_STRING || '';
const Hub = 'chat';
let serviceClient = null;

function getServiceClient() {
  if (!Conn) return null;
  if (!serviceClient) {
    const { WebPubSubServiceClient } = require('@azure/web-pubsub');
    serviceClient = new WebPubSubServiceClient(Conn, Hub);
  }
  return serviceClient;
}

function chatAvailable() {
  return !!Conn;
}

// Load the session and confirm the caller may use chat: it must be unlocked,
// and the caller must be a participant who is NOT the moderator. Chat is a
// team-members-only back-channel — the moderator can neither read nor post.
async function requireChatMember(code, participantId) {
  if (!chatAvailable()) return { error: bad('Chat is not available', 503) };
  const session = await store.loadSession(code);
  if (!session) return { error: bad('Session not found', 404) };
  if (!session.chatEnabled) return { error: bad('Chat is not enabled for this room', 403) };
  if (!participantId || !session.participants[participantId]) {
    return { error: bad('You are not in this session', 403) };
  }
  if (store.isModerator(session, participantId)) {
    return { error: bad('Chat is for team members only', 403) };
  }
  return { session };
}

app.http('chatStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'chat/status',
  handler: async () => ok({ available: chatAvailable() }),
});

// Moderator unlocks chat after subscribing post-create.
app.http('enableChat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/chat/enable',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const session = await store.loadSession(req.params.code);
    if (!session) return bad('Session not found', 404);
    if (!store.isModerator(session, participantId)) {
      return bad('Only the moderator can enable chat', 403);
    }
    session.chatEnabled = true;
    await store.saveSession(session);
    return ok({ session: store.publicView(session, participantId) });
  },
});

// Returns a Web PubSub client access URL scoped to the room group.
app.http('chatNegotiate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/chat/negotiate',
  handler: async (req) => {
    const { participantId } = await readBody(req);
    const { session, error } = await requireChatMember(req.params.code, participantId);
    if (error) return error;

    const group = session.code;
    const token = await getServiceClient().getClientAccessToken({
      userId: participantId,
      groups: [group],
      roles: [`webpubsub.joinLeaveGroup.${group}`],
    });
    return ok({ url: token.url });
  },
});

// History on join.
app.http('chatHistory', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'session/{code}/chat/messages',
  handler: async (req) => {
    const participantId = req.query.get('participantId');
    const { session, error } = await requireChatMember(req.params.code, participantId);
    if (error) return error;
    return ok({ messages: store.getMessages(session) });
  },
});

// Persist a message, then broadcast it to the room group.
app.http('chatMessage', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/chat/message',
  handler: async (req) => {
    const { participantId, text, replyTo } = await readBody(req);
    const { session, error } = await requireChatMember(req.params.code, participantId);
    if (error) return error;

    const message = store.addMessage(session, participantId, text, replyTo);
    if (!message) return bad('Message is empty');
    await store.saveSession(session);

    try {
      await getServiceClient().group(session.code).sendToAll({ type: 'message', message });
    } catch {
      /* delivery failure is non-fatal — message is persisted */
    }
    return ok({ message });
  },
});

// Toggle the caller's like on a message, then broadcast the new like list.
app.http('chatLike', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'session/{code}/chat/like',
  handler: async (req) => {
    const { participantId, messageId } = await readBody(req);
    const { session, error } = await requireChatMember(req.params.code, participantId);
    if (error) return error;

    const message = store.toggleLike(session, messageId, participantId);
    if (!message) return bad('Message not found', 404);
    await store.saveSession(session);

    try {
      await getServiceClient()
        .group(session.code)
        .sendToAll({ type: 'like', messageId: message.id, likes: message.likes });
    } catch {
      /* non-fatal */
    }
    return ok({ messageId: message.id, likes: message.likes });
  },
});
