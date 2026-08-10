import type { HistoryEntry } from './types';

export interface SessionAnalytics {
  count: number; 
  totalPoints: number; 
  consensusRate: number; 
  avgSpread: number; 
  contested: number; 
  distribution: { value: number; count: number }[]; 
}

function agreed(h: HistoryEntry): number | null {
  return h.pushedEstimate != null ? h.pushedEstimate : h.median;
}

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
