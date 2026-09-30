import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Sender } from '@/types/api';
import { Popover, Spinner } from '@/components/ui';

export function SenderSelect({ senders, value, onChange, loading }: {
  senders: Sender[];
  value: number | null;
  onChange: (id: number) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = senders.find((s) => s.id === value);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        id="compose-from"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-2 rounded-md bg-canvas px-2.5 text-[13px] text-ink hover:bg-line/60"
      >
        {loading ? <Spinner className="size-3.5" /> : current?.email ?? 'Choose sender'}
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-80 p-1.5">
        {senders.length === 0 && <p className="px-2.5 py-2 text-xs text-muted">No senders configured on the server.</p>}
        {senders.map((s) => {
          const pct = Math.min(100, Math.round((s.usage.used / s.usage.cap) * 100));
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-canvas"
            >
              <span className="mt-0.5 w-4">{s.id === value && <Check className="size-4 text-brand-600" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{s.displayName}</span>
                <span className="block truncate text-[11px] text-muted">{s.email}</span>
                <span className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-canvas">
                    <span className={`block h-full rounded-full ${pct >= 100 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                  </span>
                  {s.usage.used}/{s.usage.cap} this window
                </span>
              </span>
            </button>
          );
        })}
      </Popover>
    </div>
  );
}
