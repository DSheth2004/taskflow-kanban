export class WorkflowState {
  id = '';

  label = '';

  color = 'slate';

  isInitial = false;

  transitions = [];

  get isFinal() {
    return this.transitions.length === 0;
  }

  canMoveTo(targetId) {
    return targetId === this.id || this.transitions.includes(targetId);
  }

  toJSON() {
    const { id, label, color, isInitial, transitions, isFinal } = this;
    return { id, label, color, isInitial, isFinal, transitions };
  }
}
