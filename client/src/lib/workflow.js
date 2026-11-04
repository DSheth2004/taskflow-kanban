export function createWorkflow({ states }) {
  const byId = new Map(
    states.map((s) => [
      s.id,
      { ...s, canMoveTo: (targetId) => targetId === s.id || s.transitions.includes(targetId) },
    ])
  );
  const list = [...byId.values()];

  const stateOf = (id) => byId.get(id) ?? null;
  const labelOf = (id) => byId.get(id)?.label ?? id;

  function pathTo(fromId, toId) {
    if (fromId === toId) return [];
    const previous = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift();
      for (const next of stateOf(id)?.transitions ?? []) {
        if (previous.has(next)) continue;
        previous.set(next, id);
        if (next === toId) {
          const path = [];
          for (let step = toId; step !== fromId; step = previous.get(step)) path.unshift(step);
          return path;
        }
        queue.push(next);
      }
    }
    return null;
  }

  function whyNot(fromId, toId) {
    const from = stateOf(fromId);
    if (!from) return `This task is in an unknown state (${fromId}).`;
    if (from.isFinal) return `${from.label} is the final state; tasks there can only be reordered.`;
    const allowed = from.transitions.map(labelOf).join(' or ');
    return `A task in ${from.label} can only move to ${allowed}, not ${labelOf(toId)}.`;
  }

  return {
    states: list,
    initial: list.find((s) => s.isInitial),
    stateOf,
    labelOf,
    pathTo,
    whyNot,
  };
}
