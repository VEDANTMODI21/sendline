import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const Ctx = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );
  const icon = { success: <CheckCircle2 className="size-4 text-brand-600" />, error: <AlertCircle className="size-4 text-red-500" />, info: <Info className="size-4 text-sky-500" /> };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn('animate-toast pointer-events-auto flex gap-2.5 rounded-lg border border-line bg-white p-3 shadow-pop')}>
            <span className="mt-0.5">{icon[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs break-words text-muted">{t.body}</p>}
            </div>
            <button aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => dismiss(t.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  if (!push) throw new Error('useToast must be used inside <ToastProvider>');
  return useMemo(
    () => ({
      success: (title: string, body?: string) => push({ tone: 'success', title, body }),
      error: (title: string, body?: string) => push({ tone: 'error', title, body }),
      info: (title: string, body?: string) => push({ tone: 'info', title, body }),
    }),
    [push],
  );
}
