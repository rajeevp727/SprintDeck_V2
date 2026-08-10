'use strict';

const { WebPubSubServiceClient } = require('@azure/web-pubsub');

const conn = process.env.WEBPUBSUB_CONNECTION_STRING || '';
const hub = 'sprintdeck';

let client = null;
function svc() {
  if (!conn) return null;
  if (!client) client = new WebPubSubServiceClient(conn, hub);
  return client;
}

async function negotiate(group) {
  const s = svc();
  if (!s) return null;
  const token = await s.getClientAccessToken({
    groups: [group],
    roles: [`webpubsub.sendToGroup.${group}`],
  });
  return token.url;
}

async function notifyGroup(group) {
  const s = svc();
  if (!s) return;
  try {
    await s.group(group).sendToAll({ t: 'changed' });
  } catch { void 0; }
}

module.exports = { negotiate, notifyGroup };
