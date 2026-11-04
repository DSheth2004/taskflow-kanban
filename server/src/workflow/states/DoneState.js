import { WorkflowState } from '../WorkflowState.js';

export class DoneState extends WorkflowState {
  id = 'done';
  label = 'Done';
  color = 'emerald';
}
