import { Workflow } from './Workflow.js';
import { TodoState } from './states/TodoState.js';
import { InProgressState } from './states/InProgressState.js';
import { DoneState } from './states/DoneState.js';

// The board's states, in column order. This list (plus each state's `transitions`) is the
// only thing to change to add, remove or reorder columns. The UI picks it up from
// GET /api/workflow without any code changes.
//
// Example: a "Review" step between In Progress and Done would be a ReviewState class with
// transitions = ['done'], listed here after InProgressState, and InProgressState's
// transitions changed to ['review'].
//
// Removing a state that tasks are still in: move those tasks first, e.g.
//   db.tasks.updateMany({ columnId: 'review' }, { $set: { columnId: 'done' } })
export const workflow = new Workflow([new TodoState(), new InProgressState(), new DoneState()]);
