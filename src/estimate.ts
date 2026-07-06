// Snap a round's median to the nearest deck value — the prefilled suggestion the
// moderator confirms before pushing an estimate to a connected tool.
export function nearestDeckValue(median: number | null, deck: string[]): string {
  const nums = deck.map(Number).filter(Number.isFinite);
  if (median == null || nums.length === 0) return deck[0] ?? '';
  let best = nums[0];
  for (const n of nums) if (Math.abs(n - median) < Math.abs(best - median)) best = n;
  return String(best);
}
