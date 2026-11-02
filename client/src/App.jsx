import { useCallback, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { useBoardStore } from './store/boardStore';
import Header from './components/Header';
import Board from './components/Board';
import TaskModal from './components/TaskModal';
import ActivityDrawer from './components/ActivityDrawer';

export default function App() {
  const loadBoard = useBoardStore((s) => s.loadBoard);
  const status = useBoardStore((s) => s.status);
  const error = useBoardStore((s) => s.error);
  // null = closed, { columnId } = create, { taskId } = edit
  const [modal, setModal] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Stable callbacks so memoised task cards don't re-render when App does.
  const addTask = useCallback((columnId) => setModal({ columnId }), []);
  const editTask = useCallback((taskId) => setModal({ taskId }), []);
  const closeModal = useCallback(() => setModal(null), []);
  const closeActivity = useCallback(() => setActivityOpen(false), []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onNewTask={() => setModal({ columnId: 'todo' })}
        onOpenActivity={() => setActivityOpen(true)}
      />

      <main className="flex-1 px-4 pb-8 sm:px-6">
        {status === 'loading' && <BoardSkeleton />}
        {status === 'error' && (
          <div className="mx-auto mt-16 max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center dark:border-rose-400/30 dark:bg-slate-900">
            <p className="font-medium">Couldn&apos;t load the board</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{error}</p>
            <button className="btn-primary mt-4" onClick={loadBoard}>
              Try again
            </button>
          </div>
        )}
        {status === 'ready' && <Board onAddTask={addTask} onEditTask={editTask} />}
      </main>

      {modal && <TaskModal {...modal} onClose={closeModal} />}
      <ActivityDrawer open={activityOpen} onClose={closeActivity} />

      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            '!bg-white !text-slate-900 dark:!bg-slate-800 dark:!text-slate-100 !text-sm !shadow-lg',
        }}
      />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="Loading board">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-96 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-900" />
      ))}
    </div>
  );
}
