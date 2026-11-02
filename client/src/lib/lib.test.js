import { describe, expect, it } from 'vitest';
import { orderBetween, sortedColumn } from './ordering';
import { createMutationQueue } from './mutationQueue';

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
    expect(q.enqueue('k', job)).not.toBeNull(); // starts on next tick
    expect(q.enqueue('k', job)).toBeNull(); // first one hasn't started yet -> coalesced
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
