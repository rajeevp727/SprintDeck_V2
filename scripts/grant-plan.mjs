#!/usr/bin/env node

/**
 * Grants a plan by writing the order document entitlement is read from.
 *
 * The first argument is the account id, which carries the provider — the same
 * address signed in through Google and through Microsoft is two accounts:
 *   node scripts/grant-plan.mjs google:someone@example.com master
 *   node scripts/grant-plan.mjs microsoft:someone@example.com master
 *   node scripts/grant-plan.mjs someone@example.com pro        (password account)
 *
 * Add --write with COSMOS_CONNECTION_STRING set to insert it, or --lifetime
 * for a plan that never expires.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(path.join(repoRoot, 'api', 'package.json'));
const { grantOrder } = apiRequire('./src/migrations/grant-order');

const [accountId, tier = 'master'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const lifetime = process.argv.includes('--lifetime');
const write = process.argv.includes('--write');

if (!accountId) {
  console.error('Usage: node scripts/grant-plan.mjs <accountId> [pro|expert|master] [--lifetime] [--write]');
  console.error('  accountId: google:you@example.com | microsoft:you@example.com | you@example.com');
  process.exit(1);
}

const order = grantOrder(accountId, tier, { lifetime });

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
