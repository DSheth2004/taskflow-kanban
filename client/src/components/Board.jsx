import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { sortedColumn } from '../lib/ordering';
import { useBoardStore } from '../store/boardStore';
import Column, { COLUMN_PREFIX } from './Column';
import { TaskCardView } from './TaskCard';

const columnIdOf = (droppableId) =>
  String(droppableId).startsWith(COLUMN_PREFIX) ? droppableId.slice(COLUMN_PREFIX.length) : null;

function collisionDetection(args) {
  const hits = pointerWithin(args);
  const cardHit = hits.find((h) => !columnIdOf(h.id));
  if (cardHit) return [cardHit];

  const columnHit = hits.find((h) => columnIdOf(h.id));
  if (columnHit) {
    const columnId = columnIdOf(columnHit.id);
    const cards = args.droppableContainers.filter(
      (c) => c.data.current?.columnId === columnId && c.id !== args.active.id
    );
    return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [columnHit];
  }
  return closestCorners(args);
}

export default function Board({ onAddTask, onEditTask }) {
  const tasks = useBoardStore((s) => s.tasks);

  const workflow = useBoardStore((s) => s.workflow);
  const states = workflow.states;
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeId, setActiveId] = useState(null);
  const [overColumnId, setOverColumnId] = useState(null);
  const [visibleColumn, setVisibleColumn] = useState(states[0]?.id);
  const scrollerRef = useRef(null);

  const columns = useMemo(
    () => Object.fromEntries(states.map((c) => [c.id, sortedColumn(tasks, c.id)])),
    [tasks, states]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),

    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const centre = scroller.scrollLeft + scroller.clientWidth / 2;
    let closest = states[0]?.id;
    let best = Infinity;
    for (const column of states) {
      const el = document.getElementById(`column-${column.id}`);
      if (!el) continue;
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centre);
      if (distance < best) [best, closest] = [distance, column.id];
    }
    setVisibleColumn(closest);
  }

  function showColumn(columnId) {
    const scroller = scrollerRef.current;
    const el = document.getElementById(`column-${columnId}`);
    if (!scroller || !el) return;
    const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
    scroller.scrollTo({ left, behavior: 'smooth' });
  }

  function targetColumnOf(over) {
    if (!over) return null;
    return columnIdOf(over.id) ?? tasks[over.id]?.columnId ?? null;
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    setOverColumnId(null);
    const task = tasks[active.id];
    const toColumnId = targetColumnOf(over);
    if (!task || !toColumnId) return;

    const others = columns[toColumnId].filter((t) => t.id !== active.id);
    let toIndex;
    if (columnIdOf(over.id)) {
      toIndex = others.length;
    } else if (toColumnId === task.columnId) {
      toIndex = columns[toColumnId].findIndex((t) => t.id === over.id);
    } else {
      const overIndex = others.findIndex((t) => t.id === over.id);
      const dragged = active.rect.current.translated;
      const below =
        dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
      toIndex = overIndex + (below ? 1 : 0);
    }
    moveTask(active.id, toColumnId, toIndex);
  }

  const activeState = tasks[activeId] ? workflow.stateOf(tasks[activeId].columnId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragOver={({ over }) => setOverColumnId(targetColumnOf(over))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverColumnId(null);
      }}
    >
      <div className="flex h-full flex-col">
        <nav
          aria-label="Columns"
          className="mx-4 mb-3 flex shrink-0 gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1 [scrollbar-width:none] sm:mx-6 md:hidden dark:bg-slate-800/70"
        >
          {states.map((column) => (
            <button
              key={column.id}
              onClick={() => showColumn(column.id)}
              aria-current={visibleColumn === column.id ? 'true' : undefined}
              className={`flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                visibleColumn === column.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {column.label}
              <span className="tabular-nums opacity-70">{columns[column.id].length}</span>
            </button>
          ))}
        </nav>

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className={`relative flex min-h-0 flex-1 gap-3 overflow-x-auto md:[&>:first-child]:ml-auto md:[&>:last-child]:mr-auto overscroll-x-contain px-4 pb-4 [scrollbar-width:none] sm:gap-4 sm:px-6 md:[scrollbar-width:auto] [&::-webkit-scrollbar]:hidden md:[&::-webkit-scrollbar]:block ${
            activeId ? '' : 'snap-x snap-mandatory'
          } md:snap-none`}
        >
          {states.map((column) => (
            <Column
              key={column.id}
              column={column}
              tasks={columns[column.id]}
              highlighted={overColumnId === column.id && tasks[activeId]?.columnId !== column.id}
              blocked={activeState ? !activeState.canMoveTo(column.id) : false}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId && tasks[activeId] ? <TaskCardView task={tasks[activeId]} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
