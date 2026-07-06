import type { HistoryEntry } from './types';

export interface SessionAnalytics {
  count: number; // stories with a numeric estimate
  totalPoints: number; // sum of agreed points (pushedEstimate ?? median)
  consensusRate: number; // % of estimated rounds that reached unanimity (0–100)
  avgSpread: number; // mean (max − min) across estimated rounds, 1 dp
  contested: number; // rounds where votes disagreed (spread > 0)
  distribution: { value: number; count: number }[]; // agreed-point histogram
}

// The value the team settled on for a round: the pushed estimate if any, else the median.
function agreed(h: HistoryEntry): number | null {
  return h.pushedEstimate != null ? h.pushedEstimate : h.median;
}

// Session-level estimation summary, computed from the round history.
// (Cross-sprint velocity/trends would need persisted history + team identity —
// out of reach while the app is anonymous/ephemeral; see README.)
export function sessionAnalytics(history: HistoryEntry[]): SessionAnalytics {
  const numeric = history.filter((h) => h.median != null);
  const count = numeric.length;
  const totalPoints = numeric.reduce((s, h) => s + (agreed(h) ?? 0), 0);
  const consensusRounds = numeric.filter((h) => h.consensus).length;
  const consensusRate = count ? Math.round((consensusRounds / count) * 100) : 0;
  const spreads = numeric.map((h) => (h.max ?? 0) - (h.min ?? 0));
  const avgSpread = count ? Math.round((spreads.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0;
  const contested = spreads.filter((s) => s > 0).length;

  const dist = new Map<number, number>();
  for (const h of numeric) {
    const v = agreed(h);
    if (v != null) dist.set(v, (dist.get(v) ?? 0) + 1);
  }
  const distribution = [...dist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, c]) => ({ value, count: c }));

  return { count, totalPoints, consensusRate, avgSpread, contested, distribution };
}
