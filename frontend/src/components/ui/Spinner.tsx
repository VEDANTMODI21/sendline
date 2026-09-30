import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 aria-hidden className={cn('size-4 animate-spin', className)} />
);

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-muted" role="status">
      <Spinner /> {label}
    </div>
  );
}
