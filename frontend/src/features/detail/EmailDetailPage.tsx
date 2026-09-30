import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ExternalLink, Star, Trash2 } from 'lucide-react';
import { Avatar, ErrorState, FullPageSpinner, IconButton, StatusPill, statusLabel, useToast } from '@/components/ui';
import { useCancelEmail, useEmail, useSession } from '@/hooks/queries';
import { useStarred } from '@/hooks/useStarred';
import { longTime, nameFromAddress, relative } from '@/lib/format';
import { cn } from '@/lib/cn';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-ink">{children}</dd>
    </>
  );
}

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const email = useEmail(id);
  const me = useSession().data;
  const cancel = useCancelEmail();
  const { starred, toggle } = useStarred();
  const [showMeta, setShowMeta] = useState(false);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'));

  if (email.isPending) return <FullPageSpinner />;
  if (email.isError) return <ErrorState message={email.error.message} onRetry={() => email.refetch()} />;
  const e = email.data;
  const cancellable = e.status === 'scheduled' || e.status === 'deferred';
  const shownAt = e.sentAt ?? e.scheduledAt;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3">
        <IconButton label="Back" onClick={back} className="text-ink">
          <ArrowLeft className="size-5" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium">
          {e.subject} <span className="text-muted">|</span>{' '}
          <span className="font-mono text-sm text-muted uppercase">{e.id.slice(0, 8)}</span>
        </h1>
        <IconButton label={starred.has(e.id) ? 'Unstar' : 'Star'} onClick={() => toggle(e.id)}>
          <Star className={cn('size-4', starred.has(e.id) && 'fill-amber-400 text-amber-400')} />
        </IconButton>
        <IconButton
          label={cancellable ? 'Cancel this scheduled email' : 'Only pending emails can be cancelled'}
          disabled={!cancellable || cancel.isPending}
          onClick={() =>
            cancel.mutate(e.id, {
              onSuccess: () => toast.success('Scheduled email cancelled'),
              onError: (err) => toast.error('Could not cancel', err.message),
            })
          }
        >
          <Trash2 className="size-4" />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        {me && <Avatar src={me.avatarUrl} name={me.name || me.email} size={28} />}
      </header>

      <article className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-3">
            <Avatar name={e.senderName} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px]">
                <b className="font-semibold">{e.senderName}</b> <span className="text-muted">&lt;{e.senderEmail}&gt;</span>
              </p>
              <button type="button" onClick={() => setShowMeta((s) => !s)} className="mt-0.5 flex items-center gap-1 text-xs text-muted hover:text-ink">
                to {nameFromAddress(e.recipient)} <ChevronDown className={cn('size-3 transition-transform', showMeta && 'rotate-180')} />
              </button>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-muted">
              <span>{longTime(shownAt)}</span>
              <StatusPill status={e.status} at={e.scheduledAt} />
            </div>
          </div>

          {showMeta && (
            <dl className="mt-3 ml-12 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-line bg-canvas/60 p-3 text-xs">
              <Meta label="To">{e.recipient}</Meta>
              <Meta label="From">{e.senderEmail}</Meta>
              <Meta label="Status">{statusLabel[e.status]}</Meta>
              <Meta label={e.sentAt ? 'Sent' : 'Scheduled for'}>
                {longTime(shownAt)} ({relative(shownAt)})
              </Meta>
              <Meta label="Attempts">{e.attempts}</Meta>
              {e.messageId && <Meta label="Message-ID">{e.messageId}</Meta>}
              {e.lastError && <Meta label="Last error">{e.lastError}</Meta>}
            </dl>
          )}

          {e.status === 'deferred' && (
            <p className="mt-4 ml-12 rounded-md bg-amber-tint px-3 py-2 text-xs text-amber-ink">
              This sender reached its hourly limit, so this email was moved to the next window. It keeps its place in line and goes out {relative(e.scheduledAt)}.
            </p>
          )}

          <div className="prose-mail mt-6 ml-12" dangerouslySetInnerHTML={{ __html: e.bodyHtml }} />

          {e.previewUrl && (
            <a href={e.previewUrl} target="_blank" rel="noreferrer" className="mt-8 ml-12 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-xs text-ink-soft hover:bg-canvas">
              <ExternalLink className="size-3.5" /> Open the delivered message in Ethereal
            </a>
          )}
        </div>
      </article>
    </div>
  );
}
