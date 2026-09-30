import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="alert">
      <AlertCircle className="size-6 text-red-500" />
      <p className="text-[13px] text-ink-soft">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" pill onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Row-shaped placeholders while the list loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading emails">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex h-12 items-center gap-6 border-b border-line px-4">
          <span className="h-3 w-28 animate-pulse rounded bg-canvas" />
          <span className="h-4 w-24 animate-pulse rounded-full bg-canvas" />
          <span className="h-3 flex-1 animate-pulse rounded bg-canvas" style={{ maxWidth: `${60 - (i % 3) * 12}%` }} />
        </li>
      ))}
    </ul>
  );
}
