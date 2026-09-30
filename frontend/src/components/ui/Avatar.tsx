import { useState } from 'react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Avatar({ src, name, size = 28, tone = 'brand', className }: {
  src?: string | null;
  name: string;
  size?: number;
  tone?: 'brand' | 'neutral';
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.4) };
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        tone === 'brand' ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-soft',
        className,
      )}
    >
      {initials(name) || '?'}
    </span>
  );
}
