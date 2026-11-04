// The workflow is defined on the server (server/src/workflow: one class per state) and
// fetched from GET /api/workflow. This turns that JSON into an object the UI can ask
// questions of. Nothing here knows any state by name, so adding, removing or reordering
// states on the server changes the board with no client code changes.
//
// The server stays the authority; these checks only give instant feedback (blocked
// drops, greyed-out columns) before a request is sent.
export function createWorkflow({ states }) {
  const byId = new Map(
    states.map((s) => [
      s.id,
      { ...s, canMoveTo: (targetId) => targetId === s.id || s.transitions.includes(targetId) },
    ])
  );
  const list = [...byId.values()];

  const stateOf = (id) => byId.get(id) ?? null;
  const labelOf = (id) => byId.get(id)?.label ?? id; // ids of removed states still display

  /** Shortest list of states to pass through from one state to another
   *  ([] for the same state, null if unreachable). Mirrors Workflow.pathTo on the server. */
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
