import { DelayedError, Job } from 'bullmq';
import { env } from '../../config/env';
import { logger, errMsg } from '../../infra/logger';
import * as emails from '../emails/emails.repo';
import { getSender, Sender } from '../senders/senders.repo';
import { deliver } from '../senders/transport';
import { SlotLedger } from '../throttle/slot-ledger';
import { syncOne } from '../search/search';
import { alertsQueue, DispatchJob } from './queues';
import { flight } from './flight-recorder';
import { resolveInterrupted } from './in-flight';

const log = logger('dispatch');

/** A slot this close is awaited in-process instead of re-parking the job (never send early). */
const ON_TIME_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A pacing slot older than this is stale (e.g. the worker was down); re-pace instead of bursting. */
const STALE_SLOT_MS = Math.max(5_000, env.throughput.minGapMs * 2);
/** 'sending' rows younger than this may still be owned by a live worker. */
const IN_FLIGHT_GRACE_MS = 90_000;

export type Outcome =
  | { result: 'sent'; messageId: string }
  | { result: 'skipped'; reason: string };

export function createProcessor(ledger: SlotLedger) {
  const senders = new Map<number, Sender>();
  const senderFor = async (id: number) => {
    let s = senders.get(id);
    if (!s) {
      s = (await getSender(id)) ?? undefined;
      if (!s) throw new Error(`sender ${id} missing`);
      senders.set(id, s);
    }
    return s;
  };

  /** Park the job until `at`, keeping its reservation in job data. Does not consume an attempt. */
  async function park(job: Job<DispatchJob>, token: string | undefined, at: number, data: DispatchJob): Promise<never> {
    await job.updateData(data);
    await job.moveToDelayed(at, token);
    throw new DelayedError();
  }

  return async function process(job: Job<DispatchJob>, token?: string): Promise<Outcome> {
    const { emailId } = job.data;
    const email = await emails.loadSendable(emailId);

    // ---- 1. Idempotency: anything already finished is never touched again. ----
    if (!email) return { result: 'skipped', reason: 'email row not found' };
    if (emails.TERMINAL.has(email.status)) return { result: 'skipped', reason: `already ${email.status}` };

    if (email.status === 'sending') {
      const age = Date.now() - (email.claimed_at?.getTime() ?? 0);
      if (age < IN_FLIGHT_GRACE_MS) return park(job, token, Date.now() + IN_FLIGHT_GRACE_MS, { emailId });
      if ((await resolveInterrupted(emailId)) === 'finished') return { result: 'skipped', reason: 'resolved interrupted send' };
    }

    // ---- 2. Throughput gate: hourly quota + per-sender pacing (atomic in Redis). ----
    const now = Date.now();
    const holdsFreshSlot = job.data.slotAt !== undefined && now >= job.data.slotAt - ON_TIME_MS && now - job.data.slotAt < STALE_SLOT_MS;
    let slotAt = holdsFreshSlot ? job.data.slotAt! : now;
    if (!holdsFreshSlot) {
      const slot = await ledger.reserve({
        senderId: email.sender_id,
        campaignId: email.campaign_id,
        campaignHourlyLimit: email.hourly_limit,
        campaignGapMs: email.delay_seconds * 1000,
        notBefore: email.scheduled_at.getTime(),
        bookedWindow: job.data.booked ?? null,
      });

      if (slot.shouldAlert && slot.blockedScope) {
        const sender = await senderFor(email.sender_id);
        const resumesAt = (slot.window) * ledger.windowMs;
        await alertsQueue
          .add('rate-limit', {
            userId: email.user_id,
            senderEmail: sender.email,
            scope: slot.blockedScope,
            limit: slot.blockedScope === 'sender' ? env.throughput.senderHourlyCap : email.hourly_limit,
            campaignSubject: email.subject,
            resumesAt,
          })
          .catch((e) => log.warn('could not enqueue Slack alert', { err: errMsg(e) }));
      }

      if (!slot.paced || slot.at > Date.now() + ON_TIME_MS) {
        // Not our turn yet: show the real ETA on the dashboard, then sleep until it.
        await emails.reschedule(emailId, new Date(slot.at), slot.deferred || !slot.paced ? 'deferred' : 'scheduled');
        void syncOne(emailId);
        return park(job, token, slot.at, { emailId, booked: slot.window, slotAt: slot.paced ? slot.at : undefined });
      }
      slotAt = slot.at;
    }
    // Wait out the last few ms so the pacing gap is exact, not "roughly".
    const wait = slotAt - Date.now();
    if (wait > 0) await sleep(wait);

    // ---- 3. Claim the row. Exactly one worker can win this UPDATE. ----
    if (!(await emails.claim(emailId))) return { result: 'skipped', reason: 'claimed elsewhere' };
    await job.updateData({ emailId }); // reservation consumed; a retry must book a fresh slot

    // ---- 4. Deliver, with write-ahead markers for crash recovery. ----
    const sender = await senderFor(email.sender_id);
    await flight.started(emailId);
    log.debug('dispatching', { id: emailId, sender: sender.id, at: Date.now() });
    let delivery;
    try {
      delivery = await deliver(sender, {
        emailId,
        to: email.recipient,
        subject: email.subject,
        html: email.body_html,
        text: email.body_text,
      });
    } catch (e) {
      // SMTP refused or the connection failed before acceptance → nothing was delivered.
      await flight.aborted(emailId);
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? env.throughput.maxAttempts);
      await emails.markAttemptFailed(emailId, errMsg(e), final);
      void syncOne(emailId);
      log.warn(final ? 'send failed permanently' : 'send failed, will retry', { id: emailId, err: errMsg(e) });
      throw e;
    }

    // Accepted by SMTP. From here on we must never send again, only record it.
    // If the DB write below fails, the job retries, finds 'sending', and the marker finishes the row.
    await flight.delivered(emailId, delivery);
    await emails.markSent(emailId, delivery);
    void syncOne(emailId);
    log.info('sent', { id: emailId, to: email.recipient, from: sender.email });
    return { result: 'sent', messageId: delivery.messageId };
  };
}
