import { WorkflowState } from '../WorkflowState.js';

// No transitions: Done is the final state (tasks there can only be reordered).
export class DoneState extends WorkflowState {
  id = 'done';
  label = 'Done';
  color = 'emerald';
}
