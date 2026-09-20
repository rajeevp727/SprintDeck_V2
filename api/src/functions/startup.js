'use strict';

// Applies pending Cosmos migrations once per cold start. Containers are made
// only when missing and applied migrations are skipped, so a re-run is a
// no-op. It never blocks a request: a failure is logged and the next start
// retries.
const { runMigrations } = require('../migrations/runner');

runMigrations({ log: (message) => console.log(`[migrate] ${message}`) })
  .then((result) => {
    if (result.skipped) console.log(`[migrate] skipped — ${result.skipped}`);
    else if (result.applied.length) console.log(`[migrate] applied ${result.applied.length}`);
  })
  .catch((err) => {
    console.error('[migrate] failed', err);
  });
