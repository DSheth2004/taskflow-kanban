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

// Prefer the card under the pointer. In the gap between cards, snap to the nearest card in
// that column (so a drop between two cards lands between them, not at the bottom). Fall
// back to the column itself when it is empty, and to closestCorners for keyboard drags.
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
  // One column per workflow state, in the order the server defines them.
  const workflow = useBoardStore((s) => s.workflow);
  const states = workflow.states;
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeId, setActiveId] = useState(null);
  const [overColumnId, setOverColumnId] = useState(null);
  const [visibleColumn, setVisibleColumn] = useState(states[0]?.id);
  const scrollerRef = useRef(null);

  // Derived, never stored: a card exists once in `tasks`, so it can't be in two columns.
  const columns = useMemo(
    () => Object.fromEntries(states.map((c) => [c.id, sortedColumn(tasks, c.id)])),
    [tasks, states]
  );

  const sensors = useSensors(
    // Mouse: a small distance threshold keeps plain clicks working for opening the editor.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Touch: drag starts after a short press, so a normal swipe still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // On narrow screens the columns sit in a horizontal, snapping scroller. Track which one
  // is centred so the tab strip can highlight it, and let the tabs scroll to a column.
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

  // Scrolls only the board (scrollIntoView would also shift the page itself sideways).
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
      toIndex = others.length; // dropped on the column itself: go to the end
    } else if (toColumnId === task.columnId) {
      // Same column: dnd-kit's sortable preview uses arrayMove semantics, where the
      // card takes the index of the card it is over.
      toIndex = columns[toColumnId].findIndex((t) => t.id === over.id);
    } else {
      // Another column: insert above or below the hovered card depending on which
      // half of it the dragged card's centre is in.
      const overIndex = others.findIndex((t) => t.id === over.id);
      const dragged = active.rect.current.translated;
      const below =
        dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
      toIndex = overIndex + (below ? 1 : 0);
    }
    moveTask(active.id, toColumnId, toIndex);
  }

  // While dragging, columns the card's current state can't move to are shown as locked.
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

        {/* Snap scrolling is turned off mid-drag so dnd-kit can auto-scroll smoothly. */}
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
