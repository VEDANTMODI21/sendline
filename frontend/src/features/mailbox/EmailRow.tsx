import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { EmailListItem, Folder } from '@/types/api';
import { StatusPill } from '@/components/ui';
import { nameFromAddress } from '@/lib/format';
import { cn } from '@/lib/cn';

export const EmailRow = memo(function EmailRow({ email, folder, starred, onStar }: {
  email: EmailListItem;
  folder: Folder;
  starred: boolean;
  onStar: (id: string) => void;
}) {
  const when = folder === 'scheduled' ? email.scheduledAt : email.sentAt;
  return (
    <li className="group relative border-b border-line">
      <Link
        to={`/emails/${email.id}`}
        className="flex h-12 items-center gap-4 pr-12 pl-4 transition-colors hover:bg-canvas/70 focus-visible:bg-canvas focus-visible:outline-none"
      >
        <span className="w-44 shrink-0 truncate text-[13px] text-ink" title={email.recipient}>
          <span className="text-ink-soft">To: </span>
          {nameFromAddress(email.recipient)}
        </span>
        <span className="flex w-40 shrink-0">
          <StatusPill status={email.status} at={when} />
        </span>
        {folder === 'sent' && email.sentAt && email.status === 'sent' && (
          <span className="hidden shrink-0 text-[11px] text-muted xl:inline">{new Date(email.sentAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-semibold text-ink">{email.subject}</span>
          <span className="text-muted"> - {email.status === 'failed' && email.lastError ? email.lastError : email.preview}</span>
        </span>
      </Link>
      <button
        type="button"
        aria-label={starred ? 'Unstar' : 'Star'}
        aria-pressed={starred}
        onClick={() => onStar(email.id)}
        className="absolute top-1/2 right-4 -translate-y-1/2 text-muted/60 hover:text-amber-500"
      >
        <Star className={cn('size-4', starred && 'fill-amber-400 text-amber-400')} />
      </button>
    </li>
  );
});
