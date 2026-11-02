import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../api/client', () => ({
  api: {
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
  api.listTasks.mockResolvedValue([
    t('a', 'todo', 1000),
    t('b', 'todo', 2000),
    t('c', 'todo', 3000),
    t('d', 'done', 1000),
  ]);
  store = createBoardStore();
  await store.getState().loadBoard();
});

describe('optimistic move', () => {
  it('updates the screen before the server answers', () => {
    api.moveTask.mockReturnValue(new Promise(() => {})); // never resolves
    store.getState().moveTask('a', 'done', 1);
    expect(ids(store, 'done')).toEqual(['d', 'a']);
    expect(ids(store, 'todo')).toEqual(['b', 'c']);
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
    store.getState().moveTask('b', 'todo', 1);
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
    expect(ids(store, 'todo')).toEqual(['a', 'b', 'c']);
    expect(ids(store, 'done')).toEqual(['d']);
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('rolls back when offline (network error)', async () => {
    api.moveTask.mockRejectedValue(httpError(0, 'offline'));
    store.getState().moveTask('c', 'todo', 0);
    await store.getState().whenIdle();
    expect(ids(store, 'todo')).toEqual(['a', 'b', 'c']);
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
      task: t('a', 'done', 500, { version: 2 }),
      rebalanced: false,
    });

    const { moveTask } = store.getState();
    moveTask('a', 'in_progress', 0);
    await flush(); //                   request #1 is now in flight
    moveTask('a', 'todo', 2); //        queued behind it
    moveTask('a', 'done', 0); //        same card: folded into the queued job

    expect(api.moveTask).toHaveBeenCalledTimes(1);
    first.resolve({ task: t('a', 'in_progress', 1000, { version: 1 }), rebalanced: false });
    await store.getState().whenIdle();

    // Two requests in total, the second carrying the newest target and version.
    expect(api.moveTask).toHaveBeenCalledTimes(2);
    expect(api.moveTask.mock.calls[1]).toEqual([
      'a',
      { toColumnId: 'done', prevId: null, nextId: 'd', version: 1 },
    ]);
    expect(ids(store, 'done')).toEqual(['a', 'd']);
  });

  it('does not let a stale response overwrite a newer optimistic position', async () => {
    const first = deferred();
    const second = deferred();
    api.moveTask.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store.getState().moveTask('a', 'in_progress', 0);
    await flush();
    store.getState().moveTask('a', 'done', 0); // user moved it again while #1 is in flight

    first.resolve({ task: t('a', 'in_progress', 1000, { version: 1 }), rebalanced: false });
    await flush();

    // Response #1 arrived, but the card stays where the user last put it.
    expect(store.getState().tasks.a.columnId).toBe('done');
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
    moveTask('a', 'in_progress', 0);
    moveTask('c', 'in_progress', 0);
    moveTask('b', 'todo', 0);
    await store.getState().whenIdle();

    const all = ['todo', 'in_progress', 'done'].flatMap((col) => ids(store, col));
    expect(all.sort()).toEqual(['a', 'b', 'c', 'd']);
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
