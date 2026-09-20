#!/usr/bin/env node

/**
 * Grants a plan by writing the order document entitlement is read from.
 *
 * Print the document to paste into Data Explorer:
 *   node scripts/grant-plan.mjs someone@example.com master
 *
 * Or write it straight to Cosmos:
 *   COSMOS_CONNECTION_STRING="..." node scripts/grant-plan.mjs someone@example.com master --write
 *
 * Add --lifetime for a plan that never expires (allowlisted emails only).
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(path.join(repoRoot, 'api', 'package.json'));
const { grantOrder } = apiRequire('./src/migrations/grant-order');

const [email, tier = 'master'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const lifetime = process.argv.includes('--lifetime');
const write = process.argv.includes('--write');

if (!email) {
  console.error('Usage: node scripts/grant-plan.mjs <email> [pro|expert|master] [--lifetime] [--write]');
  process.exit(1);
}

const order = grantOrder(email, tier, { lifetime });

if (!write) {
  console.log(`\nPaste this into the "payments" container in Data Explorer:\n`);
  console.log(JSON.stringify(order, null, 2));
  console.log('\nOr re-run with --write and COSMOS_CONNECTION_STRING set.\n');
  process.exit(0);
}

const conn = process.env.COSMOS_CONNECTION_STRING;
if (!conn) {
  console.error('Set COSMOS_CONNECTION_STRING to write to Cosmos.');
  process.exit(1);
}

const { CosmosClient } = apiRequire('@azure/cosmos');
const client = new CosmosClient(conn);
const { database } = await client.databases.createIfNotExists({ id: process.env.COSMOS_DB_NAME || 'sprintdeck' });
const { container } = await database.containers.createIfNotExists({
  id: 'payments',
  partitionKey: { paths: ['/id'] },
});
await container.items.upsert(order);
console.log(`\n${order.tier} granted to ${order.email}${order.lifetime ? ' (lifetime)' : ' (30 days)'} — order ${order.id}\n`);
