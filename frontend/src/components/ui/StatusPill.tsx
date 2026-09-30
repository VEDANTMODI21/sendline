import { AlertCircle, Clock, Hourglass, Loader2, Ban } from 'lucide-react';
import type { EmailStatus } from '@/types/api';
import { pillTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const base = 'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap';

/** Scheduled rows show *when* (amber clock pill, like the design); finished rows show the outcome. */
export function StatusPill({ status, at }: { status: EmailStatus; at?: string | null }) {
  switch (status) {
    case 'scheduled':
      return (
        <span className={cn(base, 'border-amber-line bg-amber-tint text-amber-ink')}>
          <Clock className="size-3" /> {at ? pillTime(at) : 'Scheduled'}
        </span>
      );
    case 'deferred':
      return (
        <span className={cn(base, 'border-amber-line bg-amber-tint text-amber-ink')} title="Hourly limit reached — moved to the next window">
          <Hourglass className="size-3" /> {at ? pillTime(at) : 'Deferred'}
        </span>
      );
    case 'sending':
      return (
        <span className={cn(base, 'border-brand-200 bg-brand-50 text-brand-700')}>
          <Loader2 className="size-3 animate-spin" /> Sending
        </span>
      );
    case 'sent':
      return <span className={cn(base, 'border-line bg-canvas text-ink-soft')}>Sent</span>;
    case 'failed':
      return (
        <span className={cn(base, 'border-red-200 bg-red-50 text-red-600')}>
          <AlertCircle className="size-3" /> Failed
        </span>
      );
    case 'cancelled':
      return (
        <span className={cn(base, 'border-line bg-canvas text-muted')}>
          <Ban className="size-3" /> Cancelled
        </span>
      );
  }
}

export const statusLabel: Record<EmailStatus, string> = {
  scheduled: 'Scheduled',
  deferred: 'Deferred (rate limit)',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
