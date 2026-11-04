// The context that holds the states. It validates the configuration once at startup and
// answers questions that span several states (paths, error messages). Rules about a
// single state stay on that state.
export class Workflow {
  constructor(states) {
    this.states = states; // board column order = array order
    this.byId = new Map(states.map((s) => [s.id, s]));

    if (this.byId.size !== states.length) throw new Error('Workflow state ids must be unique');
    const initial = states.filter((s) => s.isInitial);
    if (initial.length !== 1) throw new Error('Workflow needs exactly one initial state');
    for (const state of states) {
      for (const target of state.transitions) {
        if (!this.byId.has(target)) {
          throw new Error(`State "${state.id}" has a transition to unknown state "${target}"`);
        }
      }
    }
    this.initial = initial[0];
  }

  get ids() {
    return this.states.map((s) => s.id);
  }

  has(id) {
    return this.byId.has(id);
  }

  stateOf(id) {
    const state = this.byId.get(id);
    if (!state) throw new Error(`Unknown workflow state "${id}"`);
    return state;
  }

  /** Shortest list of states to pass through to get from one state to another
   *  ([] for the same state, null if it can't be reached). */
  pathTo(fromId, toId) {
    if (fromId === toId) return [];
    const previous = new Map([[fromId, null]]);
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift();
      for (const next of this.stateOf(id).transitions) {
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

  /** Human-readable reason a move is not allowed. */
  whyNot(fromId, toId) {
    const from = this.stateOf(fromId);
    if (from.isFinal) return `${from.label} is the final state; tasks there can only be reordered.`;
    const allowed = from.transitions.map((id) => this.stateOf(id).label).join(' or ');
    return `A task in ${from.label} can only move to ${allowed}, not ${this.stateOf(toId).label}.`;
  }

  toJSON() {
    return { states: this.states.map((s) => s.toJSON()) };
  }
}
