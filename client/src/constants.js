export const COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export const COLUMN_TITLES = Object.fromEntries(COLUMNS.map((c) => [c.id, c.title]));

export const PRIORITIES = ['Low', 'Medium', 'High'];

// Light/dark pairs checked for WCAG AA (>= 4.5:1) text contrast on their own backgrounds.
export const PRIORITY_STYLES = {
  Low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  High: 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300',
};
