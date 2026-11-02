import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { COLUMN_TITLES } from '../constants';
import { useBoardStore } from '../store/boardStore';
import { XIcon } from './Icons';

const POLL_MS = 10_000; // picks up other people's changes while the drawer is open

const ACTION_STYLE = {
  created: 'bg-emerald-500',
  updated: 'bg-amber-500',
  moved: 'bg-indigo-500',
  deleted: 'bg-rose-500',
};

function describe(entry) {
  const title = <span className="font-medium">&ldquo;{entry.taskTitle}&rdquo;</span>;
  switch (entry.action) {
    case 'created':
      return (
        <>
          Created {title} in {COLUMN_TITLES[entry.to]}
        </>
      );
    case 'moved':
      return entry.from === entry.to ? (
        <>
          Reordered {title} in {COLUMN_TITLES[entry.to]}
        </>
      ) : (
        <>
          Moved {title} from {COLUMN_TITLES[entry.from]} to {COLUMN_TITLES[entry.to]}
        </>
      );
    case 'updated':
      return (
        <>
          Updated {entry.changes?.join(', ') ?? 'details'} of {title}
        </>
      );
    case 'deleted':
      return <>Deleted {title}</>;
    default:
      return title;
  }
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function ActivityDrawer({ open, onClose }) {
  const activityVersion = useBoardStore((s) => s.activityVersion);
  // Kept together so a poll can merge the newest page without losing older loaded pages.
  const [log, setLog] = useState({ items: [], cursor: null });
  const [state, setState] = useState('idle'); // idle | loading | error

  // Loads the newest page and keeps any older entries already fetched via "Load older".
  const loadLatest = useCallback(async () => {
    try {
      const page = await api.listActivity();
      setLog((prev) => {
        const oldest = page.items.at(-1)?.id;
        // ObjectId hex strings sort by creation time.
        const older = oldest ? prev.items.filter((i) => i.id < oldest) : [];
        return {
          items: [...page.items, ...older],
          cursor: older.length ? prev.cursor : page.nextCursor,
        };
      });
      setState('idle');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadLatest();
    const timer = setInterval(loadLatest, POLL_MS);
    return () => clearInterval(timer);
  }, [open, activityVersion, loadLatest]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function loadMore() {
    setState('loading');
    try {
      const page = await api.listActivity({ before: log.cursor });
      setLog((prev) => ({ items: [...prev.items, ...page.items], cursor: page.nextCursor }));
      setState('idle');
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900 dark:ring-1 dark:ring-slate-800 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Activity log"
        aria-hidden={!open}
        inert={open ? undefined : ''}
      >
        <div className="flex items-center border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold">Activity</h2>
          <button className="btn-ghost ml-auto !p-1" onClick={onClose} aria-label="Close activity">
            <XIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'error' && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-400/10 dark:text-rose-200">
              Couldn&apos;t load activity.{' '}
              <button className="underline" onClick={loadLatest}>
                Retry
              </button>
            </p>
          )}
          {log.items.length === 0 && state !== 'error' && (
            <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No activity yet. Create or move a card and it will show up here.
            </p>
          )}
          <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
            {log.items.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${ACTION_STYLE[entry.action]}`}
                  aria-hidden
                />
                <p className="text-sm leading-snug">{describe(entry)}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {entry.actor} · {timeFormat.format(new Date(entry.createdAt))}
                </p>
              </li>
            ))}
          </ol>
          {log.cursor && (
            <button
              className="btn-ghost mt-4 w-full"
              onClick={loadMore}
              disabled={state === 'loading'}
            >
              {state === 'loading' ? 'Loading…' : 'Load older'}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
