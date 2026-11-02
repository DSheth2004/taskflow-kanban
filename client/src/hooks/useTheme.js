import { useCallback, useEffect, useState } from 'react';

const KEY = 'taskflow.theme';

function readStored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked (private mode, sandboxed iframe)
  }
}

function apply(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

// The initial theme is already applied by the inline script in index.html; this hook
// only reads it back and handles toggling afterwards.
export function useTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  // Follow OS changes until the user picks a theme explicitly.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      if (readStored()) return;
      const next = e.matches ? 'dark' : 'light';
      apply(next);
      setTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // preference just won't persist
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
