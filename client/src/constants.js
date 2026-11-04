// Columns are not listed here: they come from the server's workflow (GET /api/workflow).

// Accent colours a workflow state can name with its `color` token. Written out in full so
// Tailwind keeps the classes; a state with an unknown token falls back to slate.
export const STATE_ACCENTS = {
  slate: 'bg-slate-400',
  gray: 'bg-gray-400',
  indigo: 'bg-indigo-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  teal: 'bg-teal-500',
  emerald: 'bg-emerald-500',
};

export const PRIORITIES = ['Low', 'Medium', 'High'];

// Light/dark pairs checked for WCAG AA (>= 4.5:1) text contrast on their own backgrounds.
export const PRIORITY_STYLES = {
  Low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  High: 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300',
};
