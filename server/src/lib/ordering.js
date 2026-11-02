// Fractional ordering: every card has a numeric orderIndex and a column is sorted by it.
// Moving a card only rewrites that one card, giving it a value between its new neighbours.
// The client keeps an identical copy of this file for its optimistic guess.

export const STEP = 1000;

// Below this gap two neighbours are too close to split reliably with doubles,
// so the column gets renumbered (see rebalanceColumn in taskService).
export const MIN_GAP = 1e-6;

export function orderBetween(prev, next) {
  if (prev == null && next == null) return STEP;
  if (prev == null) return next - STEP;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}

export function needsRebalance(prev, next) {
  return prev != null && next != null && next - prev < MIN_GAP;
}
