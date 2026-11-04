import { Workflow } from './Workflow.js';
import { TodoState } from './states/TodoState.js';
import { InProgressState } from './states/InProgressState.js';
import { DoneState } from './states/DoneState.js';

export const workflow = new Workflow([new TodoState(), new InProgressState(), new DoneState()]);
