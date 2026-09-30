import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Filled input (login card, search bar). */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(
  function Input({ className, leading, ...rest }, ref) {
    return (
      <div className={cn('flex h-9 items-center gap-2 rounded-md bg-canvas px-3 focus-within:ring-2 focus-within:ring-brand-200', className)}>
        {leading}
        <input ref={ref} className="h-full w-full bg-transparent text-[13px] outline-none placeholder:text-muted disabled:cursor-not-allowed" {...rest} />
      </div>
    );
  },
);

/** Compose-form row: label on the left, borderless control on a hairline. */
export function FormRow({ label, htmlFor, children, trailing, bordered = true }: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  trailing?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div className="flex min-h-10 items-center gap-4">
      <label htmlFor={htmlFor} className="w-14 shrink-0 text-xs text-ink-soft">
        {label}
      </label>
      <div className={cn('flex min-h-10 flex-1 items-center gap-3', bordered && 'border-b border-line')}>
        <div className="min-w-0 flex-1">{children}</div>
        {trailing}
      </div>
    </div>
  );
}

/** The small boxed number input ("Delay between 2 emails", "Hourly Limit"). */
export const NumberBox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: string; invalid?: boolean }>(
  function NumberBox({ className, suffix, invalid, ...rest }, ref) {
    return (
      <span className={cn('inline-flex h-8 items-center rounded-md border px-2', invalid ? 'border-red-300' : 'border-line', className)}>
        <input
          ref={ref}
          type="number"
          inputMode="numeric"
          min={0}
          className="w-12 bg-transparent text-xs outline-none placeholder:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          {...rest}
        />
        {suffix && <span className="text-[11px] text-muted">{suffix}</span>}
      </span>
    );
  },
);
