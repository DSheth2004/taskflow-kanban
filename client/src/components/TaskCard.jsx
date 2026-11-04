import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '../store/boardStore';
import PriorityBadge from './PriorityBadge';
import { PencilIcon } from './Icons';

function TaskCard({ task, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { columnId: task.columnId },
  });
  const saving = useBoardStore(
    (s) => s.pendingMoves[task.id] != null || s.pendingEdits[task.id] != null
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}

      className={`select-none [-webkit-touch-callout:none] ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable task"
      onClick={() => onEdit(task.id)}
    >
      <TaskCardView task={task} saving={saving} onEdit={onEdit} />
    </li>
  );
}

export default memo(TaskCard);

export function TaskCardView({ task, saving = false, overlay = false, onEdit }) {
  return (
    <article
      className={`group cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow active:cursor-grabbing dark:border-slate-700/80 dark:bg-slate-800 dark:hover:border-slate-600 ${
        overlay ? 'rotate-1 shadow-xl ring-2 ring-indigo-500/50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-sm font-medium leading-snug break-words">{task.title}</h3>
        {onEdit && (
          <button
            className="-m-1.5 rounded-md p-1.5 text-slate-500 opacity-0 transition hover:bg-slate-100 focus-visible:opacity-100 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-700 [@media(hover:none)]:opacity-100"

            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task.id);
            }}
            aria-label={`Edit ${task.title}`}
          >
            <PencilIcon width={14} height={14} />
          </button>
        )}
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
          {task.description}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.tags?.map((tag) => (
          <span
            key={tag}
            className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
          >
            #{tag}
          </span>
        ))}
        {saving && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
            Saving
          </span>
        )}
      </div>
    </article>
  );
}
