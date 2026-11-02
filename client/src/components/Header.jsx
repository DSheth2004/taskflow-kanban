import { useTheme } from '../hooks/useTheme';
import { useSettingsStore } from '../store/settingsStore';
import { BoltIcon, HistoryIcon, MoonIcon, PlusIcon, SunIcon } from './Icons';

export default function Header({ onNewTask, onOpenActivity }) {
  const { theme, toggle } = useTheme();
  const actor = useSettingsStore((s) => s.actor);
  const setActor = useSettingsStore((s) => s.setActor);
  const chaos = useSettingsStore((s) => s.chaos);
  const toggleChaos = useSettingsStore((s) => s.toggleChaos);

  return (
    <header className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
      <div className="mr-auto flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <h1 className="text-lg font-semibold tracking-tight">TaskFlow</h1>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span className="hidden sm:inline">You are</span>
        <input
          className="input w-36 py-1.5"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Your name"
          aria-label="Your name for the activity log"
        />
      </label>

      <button
        className={`btn ${chaos ? 'bg-rose-600 text-white hover:bg-rose-700' : 'btn-ghost'}`}
        onClick={toggleChaos}
        aria-pressed={chaos}
        title="Make every save fail with a simulated 500, to see the rollback"
      >
        <BoltIcon />
        <span className="hidden sm:inline">Chaos {chaos ? 'on' : 'off'}</span>
      </button>

      <button className="btn-ghost" onClick={onOpenActivity}>
        <HistoryIcon />
        <span className="hidden sm:inline">Activity</span>
      </button>

      <button
        className="btn-ghost"
        onClick={toggle}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      <button className="btn-primary" onClick={onNewTask}>
        <PlusIcon />
        New task
      </button>
    </header>
  );
}
