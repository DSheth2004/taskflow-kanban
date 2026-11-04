// State pattern: every column a task can be in is a WorkflowState subclass. A state
// owns its own rules (which states it may move to, whether tasks may be created in it),
// so the move service never branches on column names; it just asks the current state.
//
// To add a state: create a subclass in ./states, list it in ./index.js, and point the
// neighbouring states' `transitions` at it. The client reads everything else (columns,
// labels, colours, allowed drops, "Move to" buttons) from GET /api/workflow.
export class WorkflowState {
  /** Unique id stored on tasks (Task.columnId). Never rename once data uses it. */
  id = '';
  /** Column heading shown in the UI. */
  label = '';
  /** Accent colour token; the UI maps it to a palette (slate, indigo, amber, emerald, ...). */
  color = 'slate';
  /** New tasks can only be created in an initial state (exactly one per workflow). */
  isInitial = false;
  /** Ids of the states a task in this state may move to next. Empty = final state. */
  transitions = [];

  get isFinal() {
    return this.transitions.length === 0;
  }

  /** Staying in the same column (reordering) is always allowed. */
  canMoveTo(targetId) {
    return targetId === this.id || this.transitions.includes(targetId);
  }

  toJSON() {
    const { id, label, color, isInitial, transitions, isFinal } = this;
    return { id, label, color, isInitial, isFinal, transitions };
  }
}
