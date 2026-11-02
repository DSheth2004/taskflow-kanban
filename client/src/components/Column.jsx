import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import TaskCard from './TaskCard';
import { PlusIcon } from './Icons';

export const COLUMN_PREFIX = 'column:';

const DOT = {
  todo: 'bg-slate-400',
  in_progress: 'bg-indigo-500',
  done: 'bg-emerald-500',
};

export default function Column({ column, tasks, highlighted, onAddTask, onEditTask }) {
  const { setNodeRef } = useDroppable({ id: COLUMN_PREFIX + column.id });

  return (
    <section
      aria-labelledby={`col-${column.id}`}
      className={`flex flex-col rounded-2xl border p-3 transition-colors ${
        highlighted
          ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-400/60 dark:bg-indigo-400/10'
          : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60'
      }`}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${DOT[column.id]}`} aria-hidden />
        <h2 id={`col-${column.id}`} className="text-sm font-semibold">
          {column.title}
        </h2>
        <span className="rounded-full bg-slate-200 px-2 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {tasks.length}
        </span>
        <button
          className="btn-ghost ml-auto !p-1"
          onClick={() => onAddTask(column.id)}
          aria-label={`Add task to ${column.title}`}
        >
          <PlusIcon width={16} height={16} />
        </button>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={onEditTask} />
          ))}
          {tasks.length === 0 && (
            <li className="rounded-xl border-2 border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Drop cards here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}
