'use strict';

// GET /api/health — what the running API is actually connected to. Names and
// booleans only: enough to tell a misconfigured deployment from a broken one,
// nothing that would help an attacker.
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

const noCache = { 'Cache-Control': 'no-store' };

function endpointHost(conn) {
  const match = /AccountEndpoint=https?:\/\/([^:/;]+)/i.exec(conn || '');
  return match ? match[1] : '';
}

async function usersContainer(conn, dbName) {
  const client = new CosmosClient(conn);
  const { resources } = await client
    .database(dbName)
    .container('users')
    .items.query({ query: 'SELECT VALUE COUNT(1) FROM c WHERE NOT IS_DEFINED(c.type)' })
    .fetchAll();
  return resources[0] ?? 0;
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => {
    const conn = process.env.COSMOS_CONNECTION_STRING || '';
    const dbName = process.env.COSMOS_DB_NAME || 'sprintdeck';
    const body = {
      storage: conn ? 'cosmos' : 'memory',
      db: dbName,
      cosmosHost: endpointHost(conn),
      jwtConfigured: !!process.env.JWT_SECRET,
      emailConfigured: !!(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY),
    };

    if (conn) {
      try {
        body.accounts = await usersContainer(conn, dbName);
        body.usersReadable = true;
      } catch (err) {
        body.usersReadable = false;
        body.error = String(err?.code || err?.message || err).slice(0, 160);
      }
    }
    return { status: 200, jsonBody: body, headers: noCache };
  },
});
