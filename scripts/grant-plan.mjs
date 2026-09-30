#!/usr/bin/env node

/**
 * Sets a plan on an account. The plan lives on the user document — tier plus
 * lifetime, with an expiry for a timed plan — so this edits `users`.
 *
 * The account id carries the provider, because the same address signed in
 * through Google and through Microsoft is two accounts:
 *   node scripts/grant-plan.mjs google:you@example.com master --lifetime
 *   node scripts/grant-plan.mjs microsoft:you@example.com pro
 *   node scripts/grant-plan.mjs you@example.com expert        (password account)
 *
 * Prints the fields to paste into Data Explorer, or applies them with --write
 * when COSMOS_CONNECTION_STRING is set. Pass free to take a plan away.
 *
 * When you do not know which account is the live one:
 *   node scripts/grant-plan.mjs --find you@example.com
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(path.join(repoRoot, 'api', 'package.json'));
const users = apiRequire('./src/users-store');

const Tiers = ['free', 'pro', 'expert', 'master'];

// One address can hold an account per sign-in provider, and only the one you
// actually signed in with is the one the plan gate reads.
if (process.argv.includes('--find')) {
  const email = process.argv[process.argv.indexOf('--find') + 1];
  if (!email) {
    console.error('Usage: node scripts/grant-plan.mjs --find you@example.com');
    process.exit(1);
  }
  if (!process.env.COSMOS_CONNECTION_STRING) {
    console.error('Set COSMOS_CONNECTION_STRING to read from Cosmos.');
    process.exit(1);
  }
  const accounts = await users.accountsForEmail(email);
  if (accounts.length === 0) {
    console.error(`No account on ${email}.`);
    process.exit(1);
  }
  console.log(`
Accounts on ${email}:
`);
  for (const account of accounts) {
    const plan = users.planFor(account);
    const devices = Array.isArray(account.sessions) ? account.sessions.length : 0;
    console.log(`  ${account.id}`);
    console.log(
      `      name: ${account.name || '-'}   plan: ${plan.tier}${plan.lifetime ? ' (lifetime)' : ''}` +
        `   signed in on: ${devices} device${devices === 1 ? '' : 's'}`,
    );
  }
  console.log(`
The one you are signed in as is the one with devices > 0.
`);
  process.exit(0);
}

const [accountId, tier = 'master'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const lifetime = process.argv.includes('--lifetime');
const write = process.argv.includes('--write');

if (!accountId || !Tiers.includes(String(tier).toLowerCase())) {
  console.error(`Usage: node scripts/grant-plan.mjs <accountId> [${Tiers.join('|')}] [--lifetime] [--write]`);
  console.error('  accountId: google:you@example.com | microsoft:you@example.com | you@example.com');
  process.exit(1);
}

const now = Date.now();
const fields = {
  tier: String(tier).toLowerCase(),
  lifetime,
  planGrantedAt: now,
  planExpiresAt: lifetime || tier === 'free' ? null : now + 30 * 24 * 60 * 60 * 1000,
};

if (!write) {
  console.log(`\nAdd these fields to the "${accountId}" document in the users container:\n`);
  console.log(JSON.stringify(fields, null, 2));
  console.log('\nOr re-run with --write and COSMOS_CONNECTION_STRING set.\n');
  process.exit(0);
}

if (!process.env.COSMOS_CONNECTION_STRING) {
  console.error('Set COSMOS_CONNECTION_STRING to write to Cosmos.');
  process.exit(1);
}

const user = await users.setPlan(accountId, { tier: fields.tier, lifetime });
if (!user) {
  console.error(`No account "${accountId}" — check the id in the users container.`);
  process.exit(1);
}
console.log(
  `\n${user.tier} set on ${user.id}` +
    `${user.lifetime ? ' (lifetime)' : ` (until ${new Date(user.planExpiresAt).toISOString()})`}\n`,
);
