import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { COLUMNS, PRIORITIES } from '../constants';
import { useBoardStore } from '../store/boardStore';
import { XIcon } from './Icons';

// One modal for both modes: pass `taskId` to edit, or `columnId` to create.
export default function TaskModal({ taskId, columnId, onClose }) {
  const task = useBoardStore((s) => (taskId ? s.tasks[taskId] : null));
  const createTask = useBoardStore((s) => s.createTask);
  const updateTask = useBoardStore((s) => s.updateTask);
  const deleteTask = useBoardStore((s) => s.deleteTask);
  const isEdit = Boolean(taskId);

  const [form, setForm] = useState(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'Medium',
    columnId: task?.columnId ?? columnId ?? 'todo',
  }));
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The task was deleted (here or by a refresh) while the modal was open.
  useEffect(() => {
    if (isEdit && !task) onClose();
  }, [isEdit, task, onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const title = form.title.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title) return;
    if (isEdit) {
      updateTask(taskId, { title, description: form.description, priority: form.priority });
      onClose(); // optimistic: the store rolls back and toasts if the save fails
      return;
    }
    setSubmitting(true);
    try {
      await createTask({ ...form, title });
      onClose();
    } catch (err) {
      toast.error(`Couldn't create task: ${err.message}`);
      setSubmitting(false);
    }
  }

  function handleDelete() {
    deleteTask(taskId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
      >
        <div className="mb-4 flex items-center">
          <h2 id="task-modal-title" className="text-base font-semibold">
            {isEdit ? 'Edit task' : 'New task'}
          </h2>
          <button
            type="button"
            className="btn-ghost ml-auto !p-1"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Title">
            <input
              ref={titleRef}
              className="input"
              value={form.title}
              onChange={set('title')}
              maxLength={120}
              required
              placeholder="What needs doing?"
            />
          </Field>
          <Field label="Description">
            <textarea
              className="input min-h-24 resize-y"
              value={form.description}
              onChange={set('description')}
              maxLength={2000}
              placeholder="Optional details"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={set('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            {!isEdit && (
              <Field label="Column">
                <select className="input" value={form.columnId} onChange={set('columnId')}>
                  {COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <button type="button" className="btn-danger" onClick={handleDelete}>
              Delete
            </button>
          )}
          <button type="button" className="btn-ghost ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title || submitting}>
            {submitting ? 'Creating…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      {children}
    </label>
  );
}
