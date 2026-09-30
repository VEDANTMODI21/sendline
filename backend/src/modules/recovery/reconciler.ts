import { dispatchQueue, enqueueEmails } from '../dispatch/queues';
import { resolveInterrupted } from '../dispatch/in-flight';
import * as emails from '../emails/emails.repo';
import { logger } from '../../infra/logger';

const log = logger('reconcile');
const STALE_SENDING_MS = 90_000;

/**
 * Boot-time consistency pass. Rows in Postgres describe what *should* happen; BullMQ in Redis is
 * only the alarm clock for it, so any missing alarm can be recreated from the rows.
 *  • pending rows with no BullMQ job (e.g. Redis was flushed / lost its AOF) are re-enqueued
 *    at their stored time — past-due ones run immediately and are then paced by the ledger;
 *  • rows stuck in 'sending' from a crashed worker are resolved via their flight markers.
 * Adding a job whose id already exists is a no-op in BullMQ, so this is safe to run on every boot
 * and from several instances at once.
 */
export async function reconcile() {
  let cursor: { at: Date; seq: number; id: string } | null = null;
  let requeued = 0;
  let resolved = 0;
  let scanned = 0;
  for (;;) {
    const batch = await emails.pendingForRecovery(cursor, 1000);
    if (!batch.length) break;
    const tail = batch[batch.length - 1];
    cursor = { at: tail.scheduled_at, seq: tail.seq, id: tail.id };
    scanned += batch.length;

    const toQueue: { id: string; at: Date }[] = [];
    for (const row of batch) {
      if (row.status === 'sending') {
        const age = Date.now() - (row.claimed_at?.getTime() ?? 0);
        if (age < STALE_SENDING_MS) continue; // a live worker probably owns it
        if ((await resolveInterrupted(row.id)) === 'finished') {
          resolved++;
          continue;
        }
      }
      const existing = await dispatchQueue.getJob(row.id);
      if (!existing) toQueue.push({ id: row.id, at: row.scheduled_at });
      else if (await existing.isFailed()) {
        // DB still wants it sent but the job gave up (e.g. crashed mid-retry) → retry it.
        await existing.retry().catch(() => undefined);
        requeued++;
      }
    }
    if (toQueue.length) {
      await enqueueEmails(toQueue);
      requeued += toQueue.length;
    }
  }
  log.info('done', { scanned, requeued, resolved });
  return { scanned, requeued, resolved };
}
