import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/settingsStore';
import { BoltIcon, HistoryIcon, MoonIcon, PlusIcon, SunIcon } from './Icons';

// One row on every screen size: labels collapse to icons on narrow screens instead of
// the row wrapping. The display name lives in the Activity drawer.
export default function Header({ onNewTask, onOpenActivity }) {
  const { theme, toggle } = useTheme();
  const chaos = useSettingsStore((s) => s.chaos);
  const toggleChaos = useSettingsStore((s) => s.toggleChaos);

  return (
    <header className="sticky top-0 z-20 flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white/80 px-4 py-2.5 backdrop-blur sm:gap-2 sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mr-auto flex min-w-0 items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
        <h1 className="truncate text-lg font-semibold tracking-tight">TaskFlow</h1>
      </div>

      <button
        className={`btn !px-2.5 sm:!px-3 ${chaos ? 'bg-rose-600 text-white hover:bg-rose-700' : 'btn-ghost'}`}
        onClick={toggleChaos}
        aria-pressed={chaos}
        aria-label={`Chaos mode ${chaos ? 'on' : 'off'}`}
        title="Make every save fail with a simulated 500, to see the rollback"
      >
        <BoltIcon />
        <span className="hidden lg:inline">Chaos {chaos ? 'on' : 'off'}</span>
      </button>

      <button
        className="btn-ghost !px-2.5 sm:!px-3"
        onClick={onOpenActivity}
        aria-label="Activity"
        title="Activity"
      >
        <HistoryIcon />
        <span className="hidden lg:inline">Activity</span>
      </button>

      <button
        className="btn-ghost !px-2.5 sm:!px-3"
        onClick={toggle}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        title="Toggle theme"
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      <button
        className="btn-primary ml-1 !px-2.5 sm:!px-3"
        onClick={onNewTask}
        aria-label="New task"
      >
        <PlusIcon />
        <span className="hidden sm:inline">New task</span>
      </button>
    </header>
  );
}
