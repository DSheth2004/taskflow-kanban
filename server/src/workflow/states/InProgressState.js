import { WorkflowState } from '../WorkflowState.js';

export class InProgressState extends WorkflowState {
  id = 'in_progress';
  label = 'In Progress';
  color = 'indigo';
  transitions = ['done'];
}
