#!/usr/bin/env node

/**
 * Applies pending Cosmos migrations from the command line. The API runs the
 * same code on start, so this is for running them ahead of a deploy.
 *
 * Usage:
 *   COSMOS_CONNECTION_STRING="..." npm run migrate
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The runner and @azure/cosmos both live in the API package.
const apiRequire = createRequire(path.join(repoRoot, 'api', 'package.json'));
const { runMigrations } = apiRequire('./src/migrations/runner');

if (!process.env.COSMOS_CONNECTION_STRING) {
  console.error('Set COSMOS_CONNECTION_STRING to the Cosmos account connection string.');
  process.exit(1);
}

const result = await runMigrations({ log: (message) => console.log(`  ${message}`) });
console.log(result.applied.length ? `\nApplied ${result.applied.length} migration(s).\n` : '\nUp to date.\n');
