'use strict';

/**
 * Cosmos migrations.
 *
 * Containers are created only when missing, and each migration is applied at
 * most once: the ledger row is claimed with create(), so a second instance
 * starting at the same time loses the race with a 409 and skips the work
 * rather than repeating it.
 */

const migrations = require('./list');

const LedgerContainer = 'migrations';

function connectionString() {
  return process.env.COSMOS_CONNECTION_STRING || '';
}

function dbName() {
  return process.env.COSMOS_DB_NAME || 'sprintdeck';
}

/** Migrations whose ledger row is absent. */
function pendingMigrations(all, appliedIds) {
  const applied = new Set(appliedIds);
  return all.filter((migration) => !applied.has(migration.id));
}

/** A migration must carry a unique id and an up(). */
function assertValidMigrations(all) {
  const seen = new Set();
  for (const migration of all) {
    if (!migration || typeof migration.id !== 'string' || !migration.id) {
      throw new Error('migration is missing an id');
    }
    if (typeof migration.up !== 'function') {
      throw new Error(`migration ${migration.id} is missing up()`);
    }
    if (seen.has(migration.id)) throw new Error(`duplicate migration id ${migration.id}`);
    seen.add(migration.id);
  }
  return all;
}

async function openDatabase(client) {
  const id = dbName();
  try {
    const { database } = await client.databases.createIfNotExists({ id, throughput: 400 });
    return database;
  } catch {
    const { database } = await client.databases.createIfNotExists({ id });
    return database;
  }
}

async function openContainer(database, id) {
  const { container } = await database.containers.createIfNotExists({
    id,
    partitionKey: { paths: ['/id'] },
  });
  return container;
}

async function appliedIds(ledger) {
  const { resources } = await ledger.items.query('SELECT c.id FROM c').fetchAll();
  return resources.map((row) => row.id);
}

/**
 * Applies every pending migration. Without a connection string there is no
 * database to migrate — the stores run in memory — so this is a no-op.
 */
async function runMigrations({ log = () => {} } = {}) {
  const conn = connectionString();
  if (!conn) return { skipped: 'no-connection-string', applied: [] };

  assertValidMigrations(migrations);

  const { CosmosClient } = require('@azure/cosmos');
  const client = new CosmosClient(conn);
  const database = await openDatabase(client);
  const ledger = await openContainer(database, LedgerContainer);
  const pending = pendingMigrations(migrations, await appliedIds(ledger));
  if (pending.length === 0) return { applied: [] };

  const applied = [];
  for (const migration of pending) {
    try {
      // Claiming the ledger row first means a concurrent instance gets the 409
      // instead of running the same migration twice.
      await ledger.items.create({
        id: migration.id,
        description: migration.description || '',
        appliedAt: Date.now(),
      });
    } catch (err) {
      if (err && err.code === 409) {
        log(`${migration.id}: already claimed by another instance`);
        continue;
      }
      throw err;
    }

    try {
      await migration.up({
        database,
        container: (name) => openContainer(database, name),
        log: (message) => log(`${migration.id}: ${message}`),
      });
      applied.push(migration.id);
      log(`${migration.id}: applied`);
    } catch (err) {
      // Release the claim so the next start retries rather than skipping a
      // migration that never ran.
      try {
        await ledger.item(migration.id, migration.id).delete();
      } catch {
        void 0;
      }
      throw err;
    }
  }
  return { applied };
}

module.exports = {
  runMigrations,
  pendingMigrations,
  assertValidMigrations,
  migrations,
};
