import { WorkflowState } from '../WorkflowState.js';

export class TodoState extends WorkflowState {
  id = 'todo';
  label = 'To Do';
  color = 'slate';
  isInitial = true;
  transitions = ['in_progress'];
}
