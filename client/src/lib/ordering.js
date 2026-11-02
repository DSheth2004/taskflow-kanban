// Same midpoint math as server/src/lib/ordering.js. The client uses it only for its
// optimistic guess; the server's orderIndex replaces it once the move is confirmed.

export const STEP = 1000;

export function orderBetween(prev, next) {
  if (prev == null && next == null) return STEP;
  if (prev == null) return next - STEP;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}

// Columns are derived from the id -> task map, so a card can only ever appear once.
export function sortedColumn(tasks, columnId) {
  return Object.values(tasks)
    .filter((t) => t.columnId === columnId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}
