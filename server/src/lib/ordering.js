export const STEP = 1000;

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
