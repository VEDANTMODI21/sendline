import { z } from 'zod';
import { env } from '../../config/env';
import { tx, db } from '../../infra/postgres';
import { logger, errMsg } from '../../infra/logger';
import { badRequest } from '../../http/errors';
import { getSender } from '../senders/senders.repo';
import { insertEmails } from '../emails/emails.repo';
import { enqueueEmails } from '../dispatch/queues';
import { syncToIndex } from '../search/search';
import { cleanRecipients } from './recipients';
import { planTimeline } from './planner';
import { htmlToText, sanitizeBody } from './content';

const log = logger('campaigns');
export const MAX_RECIPIENTS = 10_000;

export const scheduleSchema = z.object({
  senderId: z.coerce.number().int().positive({ message: 'Choose a sender' }),
  subject: z.string().trim().min(1, 'Subject is required').max(200, 'Subject is too long (200 max)'),
  bodyHtml: z.string().min(1, 'Email body is required').max(200_000, 'Email body is too large'),
  recipients: z.array(z.string()).min(1, 'Add at least one recipient').max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients per campaign`),
  startAt: z.coerce.date({ invalid_type_error: 'Start time is invalid' }).optional(),
  delaySeconds: z.coerce.number().int().min(0).max(24 * 3600).default(0),
  hourlyLimit: z.coerce.number().int().min(1, 'Hourly limit must be at least 1').max(100_000).optional(),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export interface ScheduleResult {
  campaignId: string;
  scheduled: number;
  duplicatesRemoved: number;
  invalid: string[];
  firstSendAt: string | null;
  lastPlannedAt: string | null;
  hourlyLimit: number;
  replayed: boolean;
}

async function summary(campaignId: string, replayed: boolean, extra?: Partial<ScheduleResult>): Promise<ScheduleResult> {
  const { rows } = await db.query<{ n: string; first: Date | null; last: Date | null; hourly_limit: number }>(
    `SELECT count(e.id) AS n, min(e.scheduled_at) AS first, max(e.scheduled_at) AS last, c.hourly_limit
       FROM campaigns c LEFT JOIN emails e ON e.campaign_id = c.id WHERE c.id = $1 GROUP BY c.id`,
    [campaignId],
  );
  const r = rows[0];
  return {
    campaignId,
    scheduled: Number(r?.n ?? 0),
    duplicatesRemoved: 0,
    invalid: [],
    firstSendAt: r?.first?.toISOString() ?? null,
    lastPlannedAt: r?.last?.toISOString() ?? null,
    hourlyLimit: r?.hourly_limit ?? 0,
    replayed,
    ...extra,
  };
}

export async function scheduleCampaign(userId: string, input: ScheduleInput, idempotencyKey?: string): Promise<ScheduleResult> {
  // Safe client retries: the same Idempotency-Key returns the original campaign, never a second one.
  if (idempotencyKey) {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM campaigns WHERE user_id = $1 AND client_key = $2', [userId, idempotencyKey]);
    if (rows[0]) return summary(rows[0].id, true);
  }

  const sender = await getSender(input.senderId);
  if (!sender) throw badRequest('Unknown sender');

  const { valid, invalid, duplicates } = cleanRecipients(input.recipients);
  if (!valid.length) throw badRequest('None of the recipients are valid email addresses', { invalid: invalid.slice(0, 20) });

  const bodyHtml = sanitizeBody(input.bodyHtml);
  const bodyText = htmlToText(bodyHtml);
  if (!bodyText) throw badRequest('Email body is empty');

  // Server-side ceiling wins: the form can ask for less than MAX_EMAILS_PER_HOUR_PER_SENDER, never more.
  const hourlyLimit = Math.min(input.hourlyLimit ?? env.throughput.senderHourlyCap, env.throughput.senderHourlyCap);
  const startAt = input.startAt ?? new Date();
  if (startAt.getTime() < Date.now() - 5 * 60_000) throw badRequest('Start time is in the past');
  const times = planTimeline(startAt, valid.length, input.delaySeconds);

  let created: { campaignId: string; rows: { id: string; scheduled_at: Date }[] };
  try {
    created = await tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO campaigns (user_id, sender_id, subject, body_html, body_text, start_at, delay_seconds, hourly_limit, recipient_count, client_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [userId, sender.id, input.subject, bodyHtml, bodyText, times[0], input.delaySeconds, hourlyLimit, valid.length, idempotencyKey ?? null],
      );
      const campaignId = rows[0].id;
      const inserted = await insertEmails(c, {
        campaignId,
        userId,
        senderId: sender.id,
        seq: valid.map((_, i) => i),
        recipients: valid,
        at: times,
      });
      return { campaignId, rows: inserted };
    });
  } catch (e) {
    // Two concurrent requests with the same key: the loser returns the winner's campaign.
    if ((e as { code?: string }).code === '23505' && idempotencyKey) {
      const { rows } = await db.query<{ id: string }>('SELECT id FROM campaigns WHERE user_id = $1 AND client_key = $2', [userId, idempotencyKey]);
      if (rows[0]) return summary(rows[0].id, true);
    }
    throw e;
  }

  // Commit first, enqueue second. If Redis is down now, the rows are safe in Postgres and the
  // boot reconciler enqueues them later — nothing is lost, nothing is sent twice (jobId = row id).
  try {
    await enqueueEmails(created.rows.map((r) => ({ id: r.id, at: r.scheduled_at })));
  } catch (e) {
    log.error('enqueue failed; rows will be recovered by the reconciler', { campaign: created.campaignId, err: errMsg(e) });
  }
  void syncToIndex(created.rows.map((r) => r.id));
  log.info('campaign scheduled', { campaign: created.campaignId, emails: created.rows.length, sender: sender.email });

  return summary(created.campaignId, false, { duplicatesRemoved: duplicates, invalid: invalid.slice(0, 50) });
}
