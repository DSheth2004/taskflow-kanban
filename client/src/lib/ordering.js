export const STEP = 1000;

export function orderBetween(prev, next) {
  if (prev == null && next == null) return STEP;
  if (prev == null) return next - STEP;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}

export function sortedColumn(tasks, columnId) {
  return Object.values(tasks)
    .filter((t) => t.columnId === columnId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}
