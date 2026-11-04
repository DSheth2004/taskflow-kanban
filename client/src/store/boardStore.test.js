import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../api/client', () => ({
  api: {
    getWorkflow: vi.fn(),
    listTasks: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    createTask: vi.fn(),
  },
}));

const { api } = await import('../api/client');
const { default: toast } = await import('react-hot-toast');
const { createBoardStore } = await import('./boardStore');
const { sortedColumn } = await import('../lib/ordering');

const t = (id, columnId, orderIndex, extra = {}) => ({
  id,
  title: id.toUpperCase(),
  description: '',
  priority: 'Medium',
  columnId,
  orderIndex,
  version: 0,
  ...extra,
});

// What GET /api/workflow returns for the default To Do -> In Progress -> Done board.
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

// A promise we can resolve/reject from the test, to simulate a slow network.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Lets queued jobs start (the queue starts each job on a later microtask).
const flush = () => new Promise((r) => setTimeout(r, 0));

const ids = (store, col) => sortedColumn(store.getState().tasks, col).map((x) => x.id);
const httpError = (status, message = 'boom') => Object.assign(new Error(message), { status });

let store;
beforeEach(async () => {
  vi.clearAllMocks();
  api.getWorkflow.mockResolvedValue(WORKFLOW);
  // a, b, c are in progress (so moving them to Done is legal), d is done, e is new.
  api.listTasks.mockResolvedValue([
    t('a', 'in_progress', 1000),
    t('b', 'in_progress', 2000),
    t('c', 'in_progress', 3000),
    t('d', 'done', 1000),
    t('e', 'todo', 1000),
  ]);
  store = createBoardStore();
  await store.getState().loadBoard();
});

describe('optimistic move', () => {
  it('updates the screen before the server answers', () => {
    api.moveTask.mockReturnValue(new Promise(() => {})); // never resolves
    store.getState().moveTask('a', 'done', 1);
    expect(ids(store, 'done')).toEqual(['d', 'a']);
    expect(ids(store, 'in_progress')).toEqual(['b', 'c']);
    expect(store.getState().pendingMoves.a).toBeDefined();
  });

  it('sends neighbour ids and the confirmed version, then applies the server result', async () => {
    api.moveTask.mockResolvedValue({
      task: t('a', 'done', 2000, { version: 1 }),
      rebalanced: false,
    });
    store.getState().moveTask('a', 'done', 1);
    await store.getState().whenIdle();

    expect(api.moveTask).toHaveBeenCalledWith('a', {
      toColumnId: 'done',
      prevId: 'd',
      nextId: null,
      version: 0,
    });
    const s = store.getState();
    expect(s.tasks.a).toMatchObject({ columnId: 'done', orderIndex: 2000 });
    expect(s.confirmed.a.version).toBe(1);
    expect(s.pendingMoves.a).toBeUndefined();
  });

  it('ignores a drop in the same place', () => {
    store.getState().moveTask('b', 'in_progress', 1);
    expect(api.moveTask).not.toHaveBeenCalled();
    expect(store.getState().pendingMoves).toEqual({});
  });
});

describe('rollback', () => {
  it('puts the card back and shows a toast when the server fails', async () => {
    api.moveTask.mockRejectedValue(httpError(500));
    store.getState().moveTask('a', 'done', 0);
    expect(ids(store, 'done')).toEqual(['a', 'd']);

    await store.getState().whenIdle();
    expect(ids(store, 'in_progress')).toEqual(['a', 'b', 'c']);
    expect(ids(store, 'done')).toEqual(['d']);
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('rolls back when offline (network error)', async () => {
    api.moveTask.mockRejectedValue(httpError(0, 'offline'));
    store.getState().moveTask('c', 'in_progress', 0);
    await store.getState().whenIdle();
    expect(ids(store, 'in_progress')).toEqual(['a', 'b', 'c']);
  });

  it('refetches the board on a 409 conflict', async () => {
    api.moveTask.mockRejectedValue(httpError(409));
    store.getState().moveTask('a', 'done', 0);
    await store.getState().whenIdle();
    expect(api.listTasks).toHaveBeenCalledTimes(2); // initial load + refresh
  });

  it('restores a deleted card if the delete fails', async () => {
    api.deleteTask.mockRejectedValue(httpError(500));
    store.getState().deleteTask('b');
    expect(store.getState().tasks.b).toBeUndefined();
    await store.getState().whenIdle();
    expect(store.getState().tasks.b).toMatchObject({ title: 'B', orderIndex: 2000 });
  });

  it('reverts only the edited fields when an edit fails', async () => {
    api.updateTask.mockRejectedValue(httpError(500));
    store.getState().updateTask('a', { title: 'Renamed' });
    expect(store.getState().tasks.a.title).toBe('Renamed');
    await store.getState().whenIdle();
    expect(store.getState().tasks.a.title).toBe('A');
  });
});

describe('rapid interactions', () => {
  it('serialises requests and coalesces repeated moves of the same card', async () => {
    const first = deferred();
    api.moveTask.mockReturnValueOnce(first.promise);
    api.moveTask.mockResolvedValue({
      task: t('a', 'done', 3000, { version: 2 }),
      rebalanced: false,
    });

    const { moveTask } = store.getState();
    moveTask('a', 'done', 1); //        request #1: below d
    await flush(); //                   ...now in flight
    moveTask('a', 'done', 0); //        queued behind it: above d
    moveTask('a', 'done', 1); //        same card: folded into the queued job

    expect(api.moveTask).toHaveBeenCalledTimes(1);
    first.resolve({ task: t('a', 'done', 2000, { version: 1 }), rebalanced: false });
    await store.getState().whenIdle();

    // Two requests in total, the second carrying the newest position and version.
    expect(api.moveTask).toHaveBeenCalledTimes(2);
    expect(api.moveTask.mock.calls[1]).toEqual([
      'a',
      { toColumnId: 'done', prevId: 'd', nextId: null, version: 1 },
    ]);
    expect(ids(store, 'done')).toEqual(['d', 'a']);
  });

  it('does not let a stale response overwrite a newer optimistic position', async () => {
    const first = deferred();
    const second = deferred();
    api.moveTask.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store.getState().moveTask('a', 'done', 1); // below d
    await flush();
    store.getState().moveTask('a', 'done', 0); // user moved it above d while #1 is in flight

    first.resolve({ task: t('a', 'done', 2000, { version: 1 }), rebalanced: false });
    await flush();

    // Response #1 arrived, but the card stays where the user last put it.
    expect(ids(store, 'done')).toEqual(['a', 'd']);
    expect(store.getState().confirmed.a.version).toBe(1);

    second.resolve({ task: t('a', 'done', 500, { version: 2 }), rebalanced: false });
    await store.getState().whenIdle();
    expect(store.getState().tasks.a).toMatchObject({ columnId: 'done', orderIndex: 500 });
  });

  it('never shows a card twice, whatever order responses arrive in', async () => {
    api.moveTask.mockImplementation(async (id, { toColumnId }) => ({
      task: { ...store.getState().confirmed[id], columnId: toColumnId, version: 9 },
      rebalanced: false,
    }));
    const { moveTask } = store.getState();
    moveTask('a', 'done', 0);
    moveTask('b', 'done', 1);
    moveTask('a', 'done', 2);
    moveTask('c', 'done', 0);
    moveTask('e', 'in_progress', 0);
    await store.getState().whenIdle();

    const all = ['todo', 'in_progress', 'done'].flatMap((col) => ids(store, col));
    expect(all.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('picks neighbours that are not themselves waiting to sync', async () => {
    const first = deferred();
    api.moveTask.mockReturnValueOnce(first.promise);
    api.moveTask.mockResolvedValue({
      task: t('b', 'done', 3000, { version: 1 }),
      rebalanced: false,
    });

    store.getState().moveTask('a', 'done', 1); // a below d, in flight
    store.getState().moveTask('b', 'done', 2); // b below a, queued
    first.resolve({ task: t('a', 'done', 2000, { version: 1 }), rebalanced: false });
    await store.getState().whenIdle();

    // When b's job ran, a was already confirmed, so it is a valid neighbour.
    expect(api.moveTask.mock.calls[1][1]).toMatchObject({ prevId: 'a', nextId: null });
  });

  it('refreshes after the server rebalanced a column', async () => {
    api.moveTask.mockResolvedValue({
      task: t('a', 'done', 2000, { version: 1 }),
      rebalanced: true,
    });
    store.getState().moveTask('a', 'done', 1);
    await store.getState().whenIdle();
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });
});

describe('workflow states', () => {
  it.each([
    ['e', 'done', 'To Do can only move to In Progress'], // skipping a step
    ['a', 'todo', 'In Progress can only move to Done'], // going backwards
    ['d', 'in_progress', 'final state'], // leaving the final state
  ])('blocks %s -> %s locally, without calling the API', (id, to, message) => {
    const before = store.getState().tasks[id];
    store.getState().moveTask(id, to, 0);
    expect(store.getState().tasks[id]).toBe(before);
    expect(store.getState().pendingMoves).toEqual({});
    expect(api.moveTask).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(message));
  });

  it('advances a card one step to the bottom of the next column', async () => {
    api.moveTask.mockResolvedValue({
      task: t('e', 'in_progress', 4000, { version: 1 }),
      rebalanced: false,
    });
    store.getState().advanceTask('e');
    expect(ids(store, 'in_progress')).toEqual(['a', 'b', 'c', 'e']);
    await store.getState().whenIdle();
    expect(api.moveTask).toHaveBeenCalledWith('e', {
      toColumnId: 'in_progress',
      prevId: 'c',
      nextId: null,
      version: 0,
    });
  });

  it('does nothing when advancing a card that is already done', () => {
    store.getState().advanceTask('d');
    expect(api.moveTask).not.toHaveBeenCalled();
  });

  it('replays each step when two quick moves are coalesced into one job', async () => {
    api.moveTask
      .mockResolvedValueOnce({
        task: t('e', 'in_progress', 4000, { version: 1 }),
        rebalanced: false,
      })
      .mockResolvedValueOnce({ task: t('e', 'done', 2000, { version: 2 }), rebalanced: false });

    // Both drags happen before the first request starts, so they share one job.
    store.getState().moveTask('e', 'in_progress', 3);
    store.getState().moveTask('e', 'done', 1);
    await store.getState().whenIdle();

    expect(api.moveTask.mock.calls).toEqual([
      ['e', { toColumnId: 'in_progress', prevId: null, nextId: null, version: 0 }],
      ['e', { toColumnId: 'done', prevId: 'd', nextId: null, version: 1 }],
    ]);
    expect(store.getState().tasks.e).toMatchObject({ columnId: 'done', orderIndex: 2000 });
    expect(store.getState().pendingMoves).toEqual({});
  });
});

// The store only knows what the server sends, so a new state needs no client changes.
describe('a workflow with an extra state from the server', () => {
  beforeEach(async () => {
    api.getWorkflow.mockResolvedValue({
      states: [
        { id: 'todo', label: 'To Do', isInitial: true, transitions: ['in_progress'] },
        { id: 'in_progress', label: 'In Progress', transitions: ['review'] },
        { id: 'review', label: 'Review', transitions: ['done', 'in_progress'] },
        { id: 'done', label: 'Done', isFinal: true, transitions: [] },
      ],
    });
    api.listTasks.mockResolvedValue([t('a', 'in_progress', 1000), t('r', 'review', 1000)]);
    store = createBoardStore();
    await store.getState().loadBoard();
  });

  it('exposes the new column in server order', () => {
    expect(store.getState().workflow.states.map((s) => s.label)).toEqual([
      'To Do',
      'In Progress',
      'Review',
      'Done',
    ]);
  });

  it('enforces the new transitions', () => {
    store.getState().moveTask('a', 'done', 0); // In Progress must now go through Review
    expect(api.moveTask).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'A task in In Progress can only move to Review, not Done.'
    );

    api.moveTask.mockReturnValue(new Promise(() => {}));
    store.getState().moveTask('r', 'in_progress', 0); // Review can send work back
    expect(ids(store, 'in_progress')).toEqual(['r', 'a']);
  });
});
