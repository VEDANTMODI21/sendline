/** Wordmark in a pixel face — nods to the design's blocky logo without copying it. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-pixel text-[22px] leading-none tracking-tight text-ink ${className}`}>
      <svg viewBox="0 0 16 16" className="size-5" aria-hidden>
        <rect width="16" height="16" rx="3" fill="#16a34a" />
        <path d="M3 5h10v1.5H3zM3 7.75h6.5v1.5H3zM3 10.5h10V12H3z" fill="#fff" />
        <rect x="10.5" y="7.25" width="2.5" height="2.5" fill="#b6e8c8" />
      </svg>
      Sendline
    </span>
  );
}
