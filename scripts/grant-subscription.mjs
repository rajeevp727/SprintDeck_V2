#!/usr/bin/env node
'use strict';

/**
 * Grant a confirmed subscription in Cosmos (owner/admin use).
 *
 * Usage:
 *   COSMOS_CONNECTION_STRING="..." node scripts/grant-subscription.mjs mrrajeev18@gmail.com master
 *
 * Then in the browser console (while signed in):
 *   localStorage.setItem('sprintdeck.subscription', JSON.stringify({ orderId: '<printed-id>' }));
 *   location.reload();
 */

const path = require('path');
const store = require(path.join(__dirname, '../api/src/payments-store'));

async function main() {
  const email = process.argv[2];
  const tier = process.argv[3] || 'master';
  if (!email) {
    console.error('Usage: node scripts/grant-subscription.mjs <email> [pro|expert|master]');
    process.exit(1);
  }
  if (!process.env.COSMOS_CONNECTION_STRING) {
    console.error('Set COSMOS_CONNECTION_STRING to your production Cosmos connection string.');
    process.exit(1);
  }

  const result = await store.grantSubscription(email, tier);
  if (result.error) {
    console.error('Failed:', result.error);
    process.exit(1);
  }

  const { order } = result;
  console.log('\n✅ Subscription granted\n');
  console.log(`  Email:  ${order.email}`);
  console.log(`  Tier:   ${order.tier}`);
  console.log(`  Order:  ${order.id}`);
  console.log(`  Active: 30 days from ${new Date(order.confirmedAt).toISOString()}\n`);
  console.log('In your browser (signed in to SprintDeck), run:\n');
  console.log(`  localStorage.setItem('sprintdeck.subscription', JSON.stringify({ orderId: '${order.id}' }));`);
  console.log('  location.reload();\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
