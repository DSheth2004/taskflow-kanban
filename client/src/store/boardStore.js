import { create } from 'zustand';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { orderBetween, sortedColumn } from '../lib/ordering';
import { createMutationQueue } from '../lib/mutationQueue';
import { createWorkflow } from '../lib/workflow';

const CONTENT_FIELDS = ['title', 'description', 'priority'];

const byId = (list) => Object.fromEntries(list.map((t) => [t.id, t]));
const omit = (obj, key) => {
  const { [key]: _removed, ...rest } = obj;
  return rest;
};
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

function reportError(err, action) {
  if (err.status === 0) toast.error(`${action} failed: you appear to be offline. Changes undone.`);
  else if (err.status === 409) toast.error(`${err.message}`);
  else toast.error(`${action} failed: ${err.message}. Changes undone.`);
}

let seq = 0; // ids local edits so a late response can tell whether it is still the newest

/**
 * State shape
 *   tasks        id -> task as shown on screen (includes optimistic changes)
 *   confirmed    id -> task as last acknowledged by the server (rollback target + version)
 *   pendingMoves id -> seq of the newest unacknowledged move of that card
 *   pendingEdits id -> seq of the newest unacknowledged content edit of that card
 */
export const createBoardStore = () => {
  const queue = createMutationQueue();

  return create((set, get) => ({
    tasks: {},
    confirmed: {},
    pendingMoves: {},
    pendingEdits: {},
    workflow: null, // states + transitions from the server; the board's columns
    status: 'idle', // idle | loading | ready | error
    error: null,
    activityVersion: 0, // bumped after each saved write so the activity drawer refreshes

    whenIdle: () => queue.whenIdle(),

    async loadBoard() {
      set({ status: 'loading', error: null });
      try {
        const [workflow, list] = await Promise.all([api.getWorkflow(), api.listTasks()]);
        const map = byId(list);
        set({
          workflow: createWorkflow(workflow),
          tasks: map,
          confirmed: map,
          pendingMoves: {},
          pendingEdits: {},
          status: 'ready',
        });
      } catch (err) {
        set({ status: 'error', error: err.message });
      }
    },

    // Reloads from the server after a 409 or a rebalance. It runs through the queue, so
    // every request sent before it has settled; anything still pending belongs to a job
    // queued after it, and those local changes are kept on top of the fresh data.
    refresh() {
      queue.enqueue('refresh', async () => {
        let list;
        try {
          list = await api.listTasks();
        } catch {
          return; // keep what we have; the next successful write or reload will fix it
        }
        set((s) => {
          const confirmed = byId(list);
          const tasks = { ...confirmed };
          const pendingMoves = {};
          const pendingEdits = {};
          for (const [id, n] of Object.entries(s.pendingMoves)) {
            if (!tasks[id] || !s.tasks[id]) continue;
            tasks[id] = { ...tasks[id], ...pick(s.tasks[id], ['columnId', 'orderIndex']) };
            pendingMoves[id] = n;
          }
          for (const [id, n] of Object.entries(s.pendingEdits)) {
            if (!tasks[id] || !s.tasks[id]) continue;
            tasks[id] = { ...tasks[id], ...pick(s.tasks[id], CONTENT_FIELDS) };
            pendingEdits[id] = n;
          }
          return { tasks, confirmed, pendingMoves, pendingEdits };
        });
      });
    },

    // ---- moves (optimistic) -------------------------------------------------------

    /** Moves a card so it ends up at `toIndex` among the other cards of `toColumnId`. */
    moveTask(id, toColumnId, toIndex) {
      const { tasks, workflow } = get();
      const task = tasks[id];
      if (!task) return;

      // The card's current state decides where it may go (rules come from the server).
      if (!workflow.stateOf(task.columnId)?.canMoveTo(toColumnId)) {
        toast.error(workflow.whyNot(task.columnId, toColumnId));
        return;
      }

      const others = sortedColumn(tasks, toColumnId).filter((t) => t.id !== id);
      if (task.columnId === toColumnId) {
        const currentIndex = sortedColumn(tasks, toColumnId).findIndex((t) => t.id === id);
        if (currentIndex === toIndex) return; // dropped where it started
      }
      const prev = others[toIndex - 1];
      const next = others[toIndex];

      // 1. Update the screen immediately with a local guess at the orderIndex.
      const n = ++seq;
      set((s) => ({
        tasks: {
          ...s.tasks,
          [id]: {
            ...task,
            columnId: toColumnId,
            orderIndex: orderBetween(prev?.orderIndex, next?.orderIndex),
          },
        },
        pendingMoves: { ...s.pendingMoves, [id]: n },
      }));

      // 2. Queue the server write. If this card already has a move waiting, that job will
      //    pick up this newer position when it runs, so no second request is needed.
      queue.enqueue(`move:${id}`, () => get()._sendMove(id));
    },

    /** Moves a card to the bottom of `toColumnId`, or of its state's first transition. */
    advanceTask(id, toColumnId) {
      const { tasks, workflow } = get();
      const target = toColumnId ?? workflow.stateOf(tasks[id]?.columnId)?.transitions[0];
      if (target) get().moveTask(id, target, sortedColumn(tasks, target).length);
    },

    async _sendMove(id) {
      const { tasks, confirmed, pendingMoves, workflow } = get();
      const n = pendingMoves[id];
      const task = tasks[id];
      if (n == null || !task) return; // already settled by a rollback/refresh, or deleted

      try {
        // Two quick drags (e.g. To Do -> In Progress -> Done) are coalesced into one job,
        // but the server only accepts one transition at a time, so replay every
        // intermediate state first (bottom of that column), then send the final position.
        const fromId = confirmed[id].columnId;
        const path = workflow.pathTo(fromId, task.columnId);
        if (!path) {
          throw Object.assign(new Error(workflow.whyNot(fromId, task.columnId)), { status: 422 });
        }
        let version = confirmed[id].version;
        for (const step of path.slice(0, -1)) {
          const { task: stepSaved } = await api.moveTask(id, {
            toColumnId: step,
            prevId: null,
            nextId: null,
            version,
          });
          version = stepSaved.version;
          set((s) => ({ confirmed: { ...s.confirmed, [id]: stepSaved } }));
        }

        // Neighbours are the closest cards that are not waiting to sync themselves, because
        // only those are guaranteed to be where the server thinks they are. Cards with a
        // pending move get placed relative to this one when their own job runs.
        const latest = get();
        if (!latest.tasks[id]) return; // deleted while the intermediate steps were saving
        const column = sortedColumn(latest.tasks, task.columnId);
        const i = column.findIndex((t) => t.id === id);
        const settled = (t) => latest.pendingMoves[t.id] == null;
        const prev = column.slice(0, i).findLast(settled);
        const next = column.slice(i + 1).find(settled);

        const { task: saved, rebalanced } = await api.moveTask(id, {
          toColumnId: task.columnId,
          prevId: prev?.id ?? null,
          nextId: next?.id ?? null,
          version,
        });
        set((s) => {
          // If the user moved the card again while this request was in flight, keep the
          // newer optimistic position on screen; its own job will confirm it.
          const isLatest = s.pendingMoves[id] === n && s.tasks[id];
          return {
            confirmed: { ...s.confirmed, [id]: saved },
            tasks: isLatest
              ? { ...s.tasks, [id]: { ...s.tasks[id], ...pick(saved, ['columnId', 'orderIndex']) } }
              : s.tasks,
            pendingMoves: isLatest ? omit(s.pendingMoves, id) : s.pendingMoves,
            activityVersion: s.activityVersion + 1,
          };
        });
        // The server renumbered the column, so our other orderIndex values are stale.
        if (rebalanced) get().refresh();
      } catch (err) {
        // Roll back to the last position the server confirmed. Any newer move of this
        // card that is still queued is dropped too (its job sees no pending entry).
        set((s) => {
          const base = s.confirmed[id];
          return {
            tasks:
              base && s.tasks[id]
                ? {
                    ...s.tasks,
                    [id]: { ...s.tasks[id], ...pick(base, ['columnId', 'orderIndex']) },
                  }
                : s.tasks,
            pendingMoves: omit(s.pendingMoves, id),
          };
        });
        reportError(err, 'Move');
        if (err.status === 409 || err.status === 404) get().refresh();
      }
    },

    // ---- content edits (optimistic) ----------------------------------------------

    updateTask(id, changes) {
      const task = get().tasks[id];
      if (!task) return;
      const n = ++seq;
      set((s) => ({
        tasks: { ...s.tasks, [id]: { ...task, ...pick(changes, Object.keys(changes)) } },
        pendingEdits: { ...s.pendingEdits, [id]: n },
      }));
      queue.enqueue(`edit:${id}`, () => get()._sendEdit(id));
    },

    async _sendEdit(id) {
      const { tasks, confirmed, pendingEdits } = get();
      const n = pendingEdits[id];
      const task = tasks[id];
      if (n == null || !task) return;

      const changes = Object.fromEntries(
        CONTENT_FIELDS.filter((k) => task[k] !== confirmed[id][k]).map((k) => [k, task[k]])
      );
      if (Object.keys(changes).length === 0) {
        set((s) => ({ pendingEdits: omit(s.pendingEdits, id) }));
        return;
      }

      try {
        const saved = await api.updateTask(id, { ...changes, version: confirmed[id].version });
        set((s) => {
          const isLatest = s.pendingEdits[id] === n && s.tasks[id];
          return {
            confirmed: { ...s.confirmed, [id]: saved },
            tasks: isLatest
              ? { ...s.tasks, [id]: { ...s.tasks[id], ...pick(saved, CONTENT_FIELDS) } }
              : s.tasks,
            pendingEdits: isLatest ? omit(s.pendingEdits, id) : s.pendingEdits,
            activityVersion: s.activityVersion + 1,
          };
        });
      } catch (err) {
        set((s) => {
          const base = s.confirmed[id];
          return {
            tasks:
              base && s.tasks[id]
                ? { ...s.tasks, [id]: { ...s.tasks[id], ...pick(base, CONTENT_FIELDS) } }
                : s.tasks,
            pendingEdits: omit(s.pendingEdits, id),
          };
        });
        reportError(err, 'Save');
        if (err.status === 409 || err.status === 404) get().refresh();
      }
    },

    // ---- delete (optimistic) -----------------------------------------------------

    deleteTask(id) {
      if (!get().tasks[id]) return;
      set((s) => ({
        tasks: omit(s.tasks, id),
        pendingMoves: omit(s.pendingMoves, id),
        pendingEdits: omit(s.pendingEdits, id),
      }));
      queue.enqueue(`delete:${id}`, async () => {
        try {
          await api.deleteTask(id);
        } catch (err) {
          if (err.status !== 404) {
            // Put the card back exactly as the server last had it.
            set((s) => (s.confirmed[id] ? { tasks: { ...s.tasks, [id]: s.confirmed[id] } } : {}));
            reportError(err, 'Delete');
            return;
          }
        }
        set((s) => ({ confirmed: omit(s.confirmed, id), activityVersion: s.activityVersion + 1 }));
      });
    },

    // ---- create (waits for the server) -------------------------------------------

    // Not optimistic on purpose: a card with a temporary id could be dragged before the
    // real id exists, and every later request would need translating. Creating is rare
    // and the modal shows a spinner, so waiting ~100ms is the simpler trade-off.
    async createTask(data) {
      const saved = await queue.enqueue(null, () => api.createTask(data));
      set((s) => ({
        tasks: { ...s.tasks, [saved.id]: saved },
        confirmed: { ...s.confirmed, [saved.id]: saved },
        activityVersion: s.activityVersion + 1,
      }));
      return saved;
    },
  }));
};

export const useBoardStore = createBoardStore();
