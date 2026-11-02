import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { COLUMNS } from '../constants';
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
  const moveTask = useBoardStore((s) => s.moveTask);
  const [activeId, setActiveId] = useState(null);
  const [overColumnId, setOverColumnId] = useState(null);

  // Derived, never stored: a card exists once in `tasks`, so it can't be in two columns.
  const columns = useMemo(
    () => Object.fromEntries(COLUMNS.map((c) => [c.id, sortedColumn(tasks, c.id)])),
    [tasks]
  );

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks working for opening the editor.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
      <div className="grid items-start gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            column={column}
            tasks={columns[column.id]}
            highlighted={overColumnId === column.id && tasks[activeId]?.columnId !== column.id}
            onAddTask={onAddTask}
            onEditTask={onEditTask}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId && tasks[activeId] ? <TaskCardView task={tasks[activeId]} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
