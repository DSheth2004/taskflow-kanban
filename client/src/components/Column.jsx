import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { STATE_ACCENTS } from '../constants';
import TaskCard from './TaskCard';
import { PlusIcon } from './Icons';

export const COLUMN_PREFIX = 'column:';

export default function Column({ column, tasks, highlighted, blocked, onAddTask, onEditTask }) {
  const { setNodeRef } = useDroppable({ id: COLUMN_PREFIX + column.id });

  const canCreate = column.isInitial;

  return (
    <section
      id={`column-${column.id}`}
      aria-labelledby={`col-${column.id}`}
      className={`flex h-full w-[86vw] max-w-sm shrink-0 snap-center flex-col overflow-hidden rounded-2xl border transition md:w-0 md:min-w-56 md:max-w-md md:flex-1 ${
        blocked
          ? 'border-dashed border-slate-300 bg-slate-50 opacity-50 dark:border-slate-700 dark:bg-slate-900/60'
          : highlighted
            ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-400/60 dark:bg-indigo-400/10'
            : 'border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60'
      }`}
    >
      <div
        className={`h-1 shrink-0 ${STATE_ACCENTS[column.color] ?? STATE_ACCENTS.slate}`}
        aria-hidden
      />
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
        <h2 id={`col-${column.id}`} className="text-sm font-semibold">
          {column.label}
        </h2>
        <span className="rounded-full bg-slate-200 px-2 text-xs font-medium tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {tasks.length}
        </span>
        {blocked && (
          <span className="ml-auto text-xs font-medium text-slate-600 dark:text-slate-400">
            Not allowed
          </span>
        )}
        {canCreate && !blocked && (
          <button
            className="btn-ghost -mr-1 ml-auto !p-1.5"
            onClick={() => onAddTask(column.id)}
            aria-label={`Add task to ${column.label}`}
          >
            <PlusIcon width={16} height={16} />
          </button>
        )}
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-3"
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={onEditTask} />
          ))}
          {tasks.length === 0 && (
            <li className="rounded-xl border-2 border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {canCreate ? 'No tasks yet. Add one with +' : 'Drop cards here'}
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
