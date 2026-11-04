import { describe, expect, it } from 'vitest';
import { Workflow } from '../src/workflow/Workflow.js';
import { WorkflowState } from '../src/workflow/WorkflowState.js';
import { TodoState } from '../src/workflow/states/TodoState.js';
import { DoneState } from '../src/workflow/states/DoneState.js';
import { workflow } from '../src/workflow/index.js';

describe('the configured workflow', () => {
  it('is To Do -> In Progress -> Done, in that column order', () => {
    expect(workflow.ids).toEqual(['todo', 'in_progress', 'done']);
    expect(workflow.initial.id).toBe('todo');
    expect(workflow.stateOf('done').isFinal).toBe(true);
  });

  it('serialises to what the client needs to draw the board', () => {
    expect(JSON.parse(JSON.stringify(workflow)).states[0]).toEqual({
      id: 'todo',
      label: 'To Do',
      color: 'slate',
      isInitial: true,
      isFinal: false,
      transitions: ['in_progress'],
    });
  });
});

describe('adding a state', () => {
  class ReviewState extends WorkflowState {
    id = 'review';
    label = 'Review';
    color = 'amber';
    transitions = ['done', 'in_progress'];
  }
  class InProgressState extends WorkflowState {
    id = 'in_progress';
    label = 'In Progress';
    transitions = ['review'];
  }
  const wf = new Workflow([
    new TodoState(),
    new InProgressState(),
    new ReviewState(),
    new DoneState(),
  ]);

  it('uses the new transitions', () => {
    expect(wf.stateOf('in_progress').canMoveTo('done')).toBe(false);
    expect(wf.stateOf('in_progress').canMoveTo('review')).toBe(true);
    expect(wf.stateOf('review').canMoveTo('in_progress')).toBe(true);
  });

  it('finds the shortest path through intermediate states', () => {
    expect(wf.pathTo('todo', 'done')).toEqual(['in_progress', 'review', 'done']);
    expect(wf.pathTo('review', 'in_progress')).toEqual(['in_progress']);
    expect(wf.pathTo('done', 'todo')).toBeNull();
    expect(wf.pathTo('review', 'review')).toEqual([]);
  });

  it('explains rejected moves with every allowed target', () => {
    expect(wf.whyNot('review', 'todo')).toBe(
      'A task in Review can only move to Done or In Progress, not To Do.'
    );
    expect(wf.whyNot('done', 'todo')).toContain('final state');
  });
});

describe('workflow validation', () => {
  class Orphan extends WorkflowState {
    id = 'orphan';
    label = 'Orphan';
    isInitial = true;
    transitions = ['nowhere'];
  }

  it('rejects transitions to unknown states', () => {
    expect(() => new Workflow([new Orphan()])).toThrow(/unknown state "nowhere"/);
  });

  it('requires exactly one initial state', () => {
    expect(() => new Workflow([new DoneState()])).toThrow(/exactly one initial/);
  });

  it('rejects duplicate ids', () => {
    expect(() => new Workflow([new TodoState(), new TodoState()])).toThrow(/unique/);
  });
});
