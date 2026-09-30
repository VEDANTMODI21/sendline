import { useCallback, useSyncExternalStore } from 'react';

// Stars are a per-browser convenience (not part of the scheduling domain), so they live locally.
const KEY = 'sendline:starred';
const listeners = new Set<() => void>();

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
let snapshot = read();

export function useStarred() {
  const starred = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
  const toggle = useCallback((id: string) => {
    const next = new Set(snapshot);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    snapshot = next;
    try {
      localStorage.setItem(KEY, JSON.stringify([...next].slice(-500)));
    } catch {
      /* storage unavailable: keep in memory */
    }
    listeners.forEach((l) => l());
  }, []);
  return { starred, toggle };
}
