import { describe, it, expect } from 'vitest';
import { sessionAnalytics } from './analytics';
import type { HistoryEntry } from './types';

function round(p: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: Math.random().toString(36),
    title: 't',
    average: null,
    median: null,
    min: null,
    max: null,
    consensus: false,
    votes: [],
    at: 0,
    ...p,
  };
}

describe('sessionAnalytics', () => {
  it('summarizes points, consensus, spread and distribution', () => {
    const history = [
      round({ median: 5, min: 5, max: 5, consensus: true }), // agreed 5, no spread
      round({ median: 6.5, min: 5, max: 8, consensus: false, pushedEstimate: 8 }), // agreed 8, spread 3
      round({ median: 3, min: 2, max: 5, consensus: false }), // agreed 3, spread 3
    ];
    const a = sessionAnalytics(history);
    expect(a.count).toBe(3);
    expect(a.totalPoints).toBe(16); // 5 + 8 + 3
    expect(a.consensusRate).toBe(33); // 1 of 3
    expect(a.contested).toBe(2); // two rounds had spread > 0
    expect(a.avgSpread).toBe(2); // (0 + 3 + 3) / 3 = 2
    expect(a.distribution).toEqual([
      { value: 3, count: 1 },
      { value: 5, count: 1 },
      { value: 8, count: 1 },
    ]);
  });

  it('ignores rounds with no numeric votes', () => {
    const a = sessionAnalytics([round({ median: null })]);
    expect(a).toMatchObject({ count: 0, totalPoints: 0, consensusRate: 0, avgSpread: 0, contested: 0 });
    expect(a.distribution).toEqual([]);
  });
});
