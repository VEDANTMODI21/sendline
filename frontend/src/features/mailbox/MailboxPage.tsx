import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, RotateCw, Search, Send, X } from 'lucide-react';
import type { EmailStatus, Folder } from '@/types/api';
import { Button, EmptyState, ErrorState, IconButton, Input, ListSkeleton, Spinner, useToast } from '@/components/ui';
import { useEmailFeed, useInvalidateMail } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useStarred } from '@/hooks/useStarred';
import { cn } from '@/lib/cn';
import { EmailRow } from './EmailRow';
import { FilterMenu } from './FilterMenu';

const SLACK_RESULT: Record<string, ['success' | 'error' | 'info', string, string?]> = {
  connected: ['success', 'Slack connected', 'You will be alerted when a sender hits its hourly limit.'],
  cancelled: ['info', 'Slack connection cancelled'],
  failed: ['error', 'Slack connection failed', 'Please try again.'],
  state_mismatch: ['error', 'Slack connection expired', 'Start again from the account menu.'],
  not_configured: ['error', 'Slack is not configured', 'Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET on the server.'],
};

export function MailboxPage({ folder }: { folder: Folder }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<EmailStatus[]>([]);
  const q = useDebounced(query.trim(), 300);
  const feed = useEmailFeed(folder, q, status);
  const invalidate = useInvalidateMail();
  const { starred, toggle } = useStarred();
  const [spinning, setSpinning] = useState(false);

  // Reset filters when switching folders.
  useEffect(() => setStatus([]), [folder]);

  // One-shot toast after returning from Slack OAuth.
  useEffect(() => {
    const r = params.get('slack');
    if (!r) return;
    const [tone, title, body] = SLACK_RESULT[r] ?? ['error', 'Slack returned an unexpected result'];
    toast[tone](title, body);
    params.delete('slack');
    setParams(params, { replace: true });
  }, [params, setParams, toast]);

  const refresh = async () => {
    setSpinning(true);
    await invalidate();
    setTimeout(() => setSpinning(false), 400);
  };

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const engine = feed.data?.pages[0]?.search?.engine;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-4 py-3">
        <Input
          className="max-w-3xl flex-1 rounded-full"
          placeholder="Search"
          aria-label={`Search ${folder} emails`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leading={<Search className="size-4 text-muted" />}
        />
        {query && (
          <IconButton label="Clear search" onClick={() => setQuery('')}>
            <X className="size-4" />
          </IconButton>
        )}
        <FilterMenu folder={folder} value={status} onChange={setStatus} />
        <IconButton label="Refresh" onClick={refresh}>
          <RotateCw className={cn('size-4', spinning && 'animate-spin')} />
        </IconButton>
        {engine && (
          <span className="ml-1 hidden rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted md:inline" title="Search backend used for this query">
            via {engine === 'elasticsearch' ? 'Elasticsearch' : 'Postgres fallback'}
          </span>
        )}
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-2" aria-label={`${folder} emails`}>
        {feed.isPending ? (
          <ListSkeleton />
        ) : feed.isError && !items.length ? (
          <ErrorState message={feed.error.message} onRetry={() => feed.refetch()} />
        ) : !items.length ? (
          q || status.length ? (
            <EmptyState icon={<Search className="size-5" />} title="No matches" hint="Try another word, or clear the filter." />
          ) : folder === 'scheduled' ? (
            <EmptyState
              icon={<Clock className="size-5" />}
              title="Nothing scheduled"
              hint="Compose an email, upload your leads and pick a start time — it will wait here until it is sent."
              action={<Button pill variant="outline" onClick={() => navigate('/compose')}>Compose</Button>}
            />
          ) : (
            <EmptyState icon={<Send className="size-5" />} title="No sent emails yet" hint="Emails appear here as soon as the worker delivers them." />
          )
        ) : (
          <>
            <ul>
              {items.map((e) => (
                <EmailRow key={e.id} email={e} folder={folder} starred={starred.has(e.id)} onStar={toggle} />
              ))}
            </ul>
            <div className="flex justify-center py-4">
              {feed.hasNextPage ? (
                <Button variant="ghost" size="sm" onClick={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
                  Load more
                </Button>
              ) : (
                <span className="text-[11px] text-muted">{items.length.toLocaleString()} shown</span>
              )}
              {feed.isFetching && !feed.isFetchingNextPage && <Spinner className="ml-2 size-3 text-muted" />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
