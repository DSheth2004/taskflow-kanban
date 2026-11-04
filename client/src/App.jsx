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

  const [modal, setModal] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const addTask = useCallback(() => setModal({}), []);
  const editTask = useCallback((taskId) => setModal({ taskId }), []);
  const closeModal = useCallback(() => setModal(null), []);
  const closeActivity = useCallback(() => setActivityOpen(false), []);

  return (
    <div className="flex h-dvh flex-col">
      <Header onNewTask={addTask} onOpenActivity={() => setActivityOpen(true)} />

      <main className="min-h-0 flex-1 pt-3 sm:pt-4">
        {status === 'loading' && <BoardSkeleton />}
        {status === 'error' && (
          <div className="mx-4 mt-16 max-w-md rounded-xl sm:mx-auto border border-rose-200 bg-white p-6 text-center dark:border-rose-400/30 dark:bg-slate-900">
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
        position="bottom-center"
        containerStyle={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
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
    <div
      className="flex h-full gap-3 overflow-hidden px-4 pb-4 sm:gap-4 sm:px-6"
      aria-busy="true"
      aria-label="Loading board"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-full w-[86vw] max-w-sm shrink-0 animate-pulse rounded-2xl bg-slate-200/70 md:w-0 md:max-w-none md:flex-1 dark:bg-slate-900"
        />
      ))}
    </div>
  );
}
