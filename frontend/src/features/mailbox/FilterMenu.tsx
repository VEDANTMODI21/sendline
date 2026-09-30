import { useState } from 'react';
import { Check, Filter } from 'lucide-react';
import type { EmailStatus, Folder } from '@/types/api';
import { IconButton, Popover, statusLabel } from '@/components/ui';

const OPTIONS: Record<Folder, EmailStatus[]> = {
  scheduled: ['scheduled', 'deferred', 'sending'],
  sent: ['sent', 'failed'],
};

export function FilterMenu({ folder, value, onChange }: { folder: Folder; value: EmailStatus[]; onChange: (v: EmailStatus[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (s: EmailStatus) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="relative">
      <IconButton label="Filter by status" active={value.length > 0} onClick={() => setOpen((o) => !o)}>
        <Filter className="size-4" />
      </IconButton>
      <Popover open={open} onClose={() => setOpen(false)} className="w-56 p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Status</p>
        {OPTIONS[folder].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-canvas"
          >
            <span className="flex size-4 items-center justify-center rounded border border-line">
              {value.includes(s) && <Check className="size-3 text-brand-600" />}
            </span>
            {statusLabel[s]}
          </button>
        ))}
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-xs text-brand-700 hover:bg-canvas">
            Clear filter
          </button>
        )}
      </Popover>
    </div>
  );
}
