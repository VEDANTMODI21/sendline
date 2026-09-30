import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'sendline:theme';
const listeners = new Set<() => void>();

/** Saved choice wins; otherwise follow the OS setting. */
function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current: Theme = initial();
const apply = (t: Theme) => document.documentElement.setAttribute('data-theme', t);
apply(current);

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  const setTheme = useCallback((t: Theme) => {
    current = t;
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* keep in memory */
    }
    listeners.forEach((l) => l());
  }, []);
  const toggle = useCallback(() => setTheme(current === 'dark' ? 'light' : 'dark'), [setTheme]);
  return { theme, setTheme, toggle };
}
