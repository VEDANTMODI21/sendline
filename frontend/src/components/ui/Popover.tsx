import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Anchored panel that closes on outside click or Escape. */
export function Popover({ open, onClose, children, className, align = 'right' }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Defer so the click that opened the popover does not immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown));
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      className={cn(
        'absolute top-full z-40 mt-2 rounded-lg border border-line bg-white shadow-pop',
        align === 'right' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, tone = 'default', href, external }: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  href?: string;
  external?: boolean;
}) {
  const cls = cn(
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-canvas',
    tone === 'danger' ? 'text-red-600' : 'text-ink',
  );
  if (href)
    return (
      <a className={cls} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
        {icon}
        {children}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
