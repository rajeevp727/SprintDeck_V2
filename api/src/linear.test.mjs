import { describe, it, expect, vi, afterEach } from 'vitest';
import linear from './linear.js';

describe('getEstimationTickets (mock)', () => {
  it('returns tickets with a mock linearId and a Linear url', () => {
    const tickets = linear.getEstimationTickets();
    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      expect(t.linearId).toMatch(/^mock-/);
      expect(t.url).toContain('linear.app');
      expect(typeof t.identifier).toBe('string');
    }
  });
});

describe('isMockId', () => {
  it('detects the mock- prefix', () => {
    expect(linear.isMockId('mock-ENG-1')).toBe(true);
    expect(linear.isMockId('real-uuid')).toBe(false);
    expect(linear.isMockId(null)).toBe(false);
    expect(linear.isMockId(undefined)).toBe(false);
  });
});

describe('resolveIssues', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns empty without calling the API when no valid ids are given', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await linear.resolveIssues(['', 'bad', 'nodash']);
    expect(out).toEqual({ resolved: [], missing: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves found issues and reports missing ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            i0: { id: 'uuid-1', identifier: 'ENG-1', title: 'First', estimate: null },
            i1: null, // not found
          },
        }),
      })),
    );
    process.env.LINEAR_API_KEY = 'test-key';
    const { resolved, missing } = await linear.resolveIssues(['ENG-1', 'ENG-2']);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ identifier: 'ENG-1', linearId: 'uuid-1' });
    expect(missing).toEqual(['ENG-2']);
  });
});
