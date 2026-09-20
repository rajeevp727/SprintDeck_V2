import { describe, it, expect, beforeEach } from 'vitest';
import runner from './runner.js';

const { pendingMigrations, assertValidMigrations, runMigrations, migrations } = runner;

describe('pendingMigrations', () => {
  const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns everything when the ledger is empty', () => {
    expect(pendingMigrations(all, []).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips the ones already recorded', () => {
    expect(pendingMigrations(all, ['a', 'c']).map((m) => m.id)).toEqual(['b']);
  });

  it('returns nothing once all are applied', () => {
    expect(pendingMigrations(all, ['a', 'b', 'c'])).toEqual([]);
  });
});

describe('assertValidMigrations', () => {
  it('accepts the shipped list', () => {
    expect(() => assertValidMigrations(migrations)).not.toThrow();
  });

  it('rejects a migration with no up()', () => {
    expect(() => assertValidMigrations([{ id: 'x' }])).toThrow(/missing up/);
  });

  it('rejects a migration with no id', () => {
    expect(() => assertValidMigrations([{ up: async () => {} }])).toThrow(/missing an id/);
  });

  it('rejects duplicate ids', () => {
    const dupe = { id: 'x', up: async () => {} };
    expect(() => assertValidMigrations([dupe, { ...dupe }])).toThrow(/duplicate/);
  });
});

describe('runMigrations without Cosmos', () => {
  beforeEach(() => {
    delete process.env.COSMOS_CONNECTION_STRING;
  });

  it('does nothing when there is no database to migrate', async () => {
    const result = await runMigrations();
    expect(result.skipped).toBe('no-connection-string');
    expect(result.applied).toEqual([]);
  });
});

describe('the shipped migrations', () => {
  it('are ordered by id and uniquely numbered', () => {
    const ids = migrations.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('name their file number first, so order is readable', () => {
    for (const id of migrations.map((m) => m.id)) {
      expect(id).toMatch(/^\d{4}_/);
    }
  });
});
