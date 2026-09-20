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
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(path.join(repoRoot, 'api', 'package.json'));
const users = apiRequire('./src/users-store');

const Tiers = ['free', 'pro', 'expert', 'master'];
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
