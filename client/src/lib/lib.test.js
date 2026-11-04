import { describe, expect, it } from 'vitest';
import { orderBetween, sortedColumn } from './ordering';
import { createMutationQueue } from './mutationQueue';
import { createWorkflow } from './workflow';
import { parseTags } from '../constants';

const WORKFLOW = {
  states: [
    {
      id: 'todo',
      label: 'To Do',
      color: 'slate',
      isInitial: true,
      isFinal: false,
      transitions: ['in_progress'],
    },
    {
      id: 'in_progress',
      label: 'In Progress',
      color: 'indigo',
      isInitial: false,
      isFinal: false,
      transitions: ['done'],
    },
    {
      id: 'done',
      label: 'Done',
      color: 'emerald',
      isInitial: false,
      isFinal: true,
      transitions: [],
    },
  ],
};
const wf = createWorkflow(WORKFLOW);
const stateOf = wf.stateOf;

describe('orderBetween', () => {
  it('handles empty, top, bottom and middle', () => {
    expect(orderBetween(null, null)).toBe(1000);
    expect(orderBetween(null, 1000)).toBe(0);
    expect(orderBetween(2000, null)).toBe(3000);
    expect(orderBetween(1000, 2000)).toBe(1500);
  });
});

describe('sortedColumn', () => {
  it('filters by column and sorts by orderIndex', () => {
    const tasks = {
      a: { id: 'a', columnId: 'todo', orderIndex: 2 },
      b: { id: 'b', columnId: 'done', orderIndex: 1 },
      c: { id: 'c', columnId: 'todo', orderIndex: 1 },
    };
    expect(sortedColumn(tasks, 'todo').map((t) => t.id)).toEqual(['c', 'a']);
  });
});

describe('mutation queue', () => {
  it('runs jobs one at a time in order', async () => {
    const q = createMutationQueue();
    const log = [];
    const job = (name, ms) => () => new Promise((r) => setTimeout(() => (log.push(name), r()), ms));
    q.enqueue(null, job('slow', 20));
    q.enqueue(null, job('fast', 0));
    await q.whenIdle();
    expect(log).toEqual(['slow', 'fast']);
  });

  it('drops a job whose key is already waiting, but not one that already started', async () => {
    const q = createMutationQueue();
    let runs = 0;
    const job = () => Promise.resolve(runs++);
    expect(q.enqueue('k', job)).not.toBeNull();
    expect(q.enqueue('k', job)).toBeNull();
    await q.whenIdle();
    expect(q.enqueue('k', job)).not.toBeNull();
    await q.whenIdle();
    expect(runs).toBe(2);
  });

  it('keeps going after a job fails', async () => {
    const q = createMutationQueue();
    const failed = q.enqueue(null, () => Promise.reject(new Error('x')));
    const ok = q.enqueue(null, () => Promise.resolve('done'));
    await expect(failed).rejects.toThrow('x');
    await expect(ok).resolves.toBe('done');
  });
});

describe('workflow states', () => {
  it('only allows staying put or moving one step forward', () => {
    expect(stateOf('todo').canMoveTo('todo')).toBe(true);
    expect(stateOf('todo').canMoveTo('in_progress')).toBe(true);
    expect(stateOf('todo').canMoveTo('done')).toBe(false);
    expect(stateOf('in_progress').canMoveTo('todo')).toBe(false);
    expect(stateOf('in_progress').canMoveTo('done')).toBe(true);
    expect(stateOf('done').canMoveTo('in_progress')).toBe(false);
  });

  it('knows the initial and final states', () => {
    expect(wf.initial).toBe(stateOf('todo'));
    expect(stateOf('done').isFinal).toBe(true);
  });

  it('lists the steps between two states, or null when going backwards', () => {
    expect(wf.pathTo('todo', 'done')).toEqual(['in_progress', 'done']);
    expect(wf.pathTo('in_progress', 'in_progress')).toEqual([]);
    expect(wf.pathTo('done', 'todo')).toBeNull();
  });

  it('keeps showing ids of states that no longer exist (old activity entries)', () => {
    expect(wf.labelOf('in_progress')).toBe('In Progress');
    expect(wf.labelOf('archived')).toBe('archived');
    expect(stateOf('archived')).toBeNull();
  });
});

describe('parseTags', () => {
  it('splits on commas, trims, lower-cases, de-duplicates and caps at 5', () => {
    expect(parseTags(' Frontend, bug ,,BUG, a, b, c, d')).toEqual([
      'frontend',
      'bug',
      'a',
      'b',
      'c',
    ]);
    expect(parseTags('')).toEqual([]);
  });
});
