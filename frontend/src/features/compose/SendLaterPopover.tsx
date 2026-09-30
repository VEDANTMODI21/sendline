import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button, Popover } from '@/components/ui';
import { toLocalInput } from '@/lib/format';
import { cn } from '@/lib/cn';

function tomorrowAt(hour: number | null) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (hour === null) d.setHours(9, 0, 0, 0);
  else d.setHours(hour, 0, 0, 0);
  return d;
}

const PRESETS: { label: string; at: () => Date }[] = [
  { label: 'Tomorrow', at: () => tomorrowAt(null) },
  { label: 'Tomorrow, 10:00 AM', at: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', at: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', at: () => tomorrowAt(15) },
];

export function SendLaterPopover({ open, onClose, value, onPick }: {
  open: boolean;
  onClose: () => void;
  value: Date | null;
  onPick: (d: Date | null) => void;
}) {
  const [draft, setDraft] = useState(value ? toLocalInput(value) : '');
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    if (!draft) {
      onPick(null);
      return onClose();
    }
    const d = new Date(draft);
    if (Number.isNaN(d.getTime())) return setError('Pick a valid date and time.');
    if (d.getTime() < Date.now() - 60_000) return setError('That time is in the past.');
    onPick(d);
    onClose();
  };

  return (
    <Popover open={open} onClose={onClose} className="w-72 p-4">
      <p className="text-[13px] font-medium">Send Later</p>
      <label className="mt-3 flex items-center gap-2 border-b border-line pb-2">
        <input
          type="datetime-local"
          aria-label="Pick date & time"
          value={draft}
          min={toLocalInput(new Date())}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          className="flex-1 bg-transparent text-xs text-ink outline-none [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
        <Calendar className="size-4 text-muted" />
      </label>
      {!draft && <p className="mt-1 text-[11px] text-muted">Pick date &amp; time</p>}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <ul className="mt-3 flex flex-col">
        {PRESETS.map((p) => {
          const d = p.at();
          const selected = draft === toLocalInput(d);
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => setDraft(toLocalInput(d))}
                className={cn('w-full rounded-md px-2 py-2 text-left text-xs text-ink-soft hover:bg-canvas', selected && 'bg-brand-50 text-brand-700')}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { onPick(null); onClose(); }}>
          {value ? 'Send now instead' : 'Cancel'}
        </Button>
        <Button variant="outline" pill size="sm" onClick={done}>
          Done
        </Button>
      </div>
    </Popover>
  );
}
