/**
 * Turns "start at T, one every D seconds" into concrete send times.
 * The hourly limit is *not* applied here — the runtime ledger enforces it (and re-plans
 * deferred rows), so the limit also holds across campaigns that share a sender.
 */
export function planTimeline(startAt: Date, count: number, delaySeconds: number, now = Date.now()): Date[] {
  const base = Math.max(startAt.getTime(), now);
  const step = delaySeconds * 1000;
  // With no delay, a 1 ms stagger still gives a deterministic FIFO order in the delayed set.
  return Array.from({ length: count }, (_, i) => new Date(base + i * (step || 1)));
}
