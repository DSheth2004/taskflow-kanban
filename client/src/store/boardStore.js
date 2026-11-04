import { create } from 'zustand';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { orderBetween, sortedColumn } from '../lib/ordering';
import { createMutationQueue } from '../lib/mutationQueue';
import { createWorkflow } from '../lib/workflow';

const CONTENT_FIELDS = ['title', 'description', 'priority', 'tags'];

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

let seq = 0;

export const createBoardStore = () => {
  const queue = createMutationQueue();

  return create((set, get) => ({
    tasks: {},
    confirmed: {},
    pendingMoves: {},
    pendingEdits: {},
    workflow: null,
    status: 'idle',
    error: null,
    activityVersion: 0,

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

    refresh() {
      queue.enqueue('refresh', async () => {
        let list;
        try {
          list = await api.listTasks();
        } catch {
          return;
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

    moveTask(id, toColumnId, toIndex) {
      const { tasks, workflow } = get();
      const task = tasks[id];
      if (!task) return;

      if (!workflow.stateOf(task.columnId)?.canMoveTo(toColumnId)) {
        toast.error(workflow.whyNot(task.columnId, toColumnId));
        return;
      }

      const others = sortedColumn(tasks, toColumnId).filter((t) => t.id !== id);
      if (task.columnId === toColumnId) {
        const currentIndex = sortedColumn(tasks, toColumnId).findIndex((t) => t.id === id);
        if (currentIndex === toIndex) return;
      }
      const prev = others[toIndex - 1];
      const next = others[toIndex];

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

      queue.enqueue(`move:${id}`, () => get()._sendMove(id));
    },

    advanceTask(id, toColumnId) {
      const { tasks, workflow } = get();
      const target = toColumnId ?? workflow.stateOf(tasks[id]?.columnId)?.transitions[0];
      if (target) get().moveTask(id, target, sortedColumn(tasks, target).length);
    },

    async _sendMove(id) {
      const { tasks, confirmed, pendingMoves, workflow } = get();
      const n = pendingMoves[id];
      const task = tasks[id];
      if (n == null || !task) return;

      try {
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

        const latest = get();
        if (!latest.tasks[id]) return;
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

        if (rebalanced) get().refresh();
      } catch (err) {
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
        CONTENT_FIELDS.filter((k) => !sameValue(task[k], confirmed[id][k])).map((k) => [k, task[k]])
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
            set((s) => (s.confirmed[id] ? { tasks: { ...s.tasks, [id]: s.confirmed[id] } } : {}));
            reportError(err, 'Delete');
            return;
          }
        }
        set((s) => ({ confirmed: omit(s.confirmed, id), activityVersion: s.activityVersion + 1 }));
      });
    },

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
