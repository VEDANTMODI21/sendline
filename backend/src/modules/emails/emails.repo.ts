import type { PoolClient } from 'pg';
import { db } from '../../infra/postgres';

export type EmailStatus = 'scheduled' | 'deferred' | 'sending' | 'sent' | 'failed' | 'cancelled';
export const PENDING: EmailStatus[] = ['scheduled', 'deferred', 'sending'];
export const FINISHED: EmailStatus[] = ['sent', 'failed'];
export const TERMINAL = new Set<EmailStatus>(['sent', 'failed', 'cancelled']);

/** Everything the worker needs to send one email (email row + campaign content). */
export interface SendableEmail {
  id: string;
  campaign_id: string;
  user_id: string;
  sender_id: number;
  recipient: string;
  status: EmailStatus;
  scheduled_at: Date;
  claimed_at: Date | null;
  attempts: number;
  subject: string;
  body_html: string;
  body_text: string;
  hourly_limit: number;
  delay_seconds: number;
}

export async function loadSendable(id: string): Promise<SendableEmail | null> {
  const { rows } = await db.query<SendableEmail>(
    `SELECT e.id, e.campaign_id, e.user_id, e.sender_id, e.recipient, e.status, e.scheduled_at,
            e.claimed_at, e.attempts, c.subject, c.body_html, c.body_text, c.hourly_limit, c.delay_seconds
       FROM emails e JOIN campaigns c ON c.id = e.campaign_id
      WHERE e.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Move the planned time to the reserved slot so the dashboard shows when it will really go out. */
export async function reschedule(id: string, at: Date, status: 'scheduled' | 'deferred') {
  await db.query(
    `UPDATE emails SET scheduled_at = $2, status = $3, updated_at = now()
      WHERE id = $1 AND status IN ('scheduled','deferred')`,
    [id, at, status],
  );
}

/**
 * The idempotency gate. Only one caller can flip scheduled/deferred → sending;
 * everyone else gets null and must not send.
 */
export async function claim(id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE emails SET status = 'sending', attempts = attempts + 1, claimed_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('scheduled','deferred')`,
    [id],
  );
  return rowCount === 1;
}

export async function markSent(id: string, d: { messageId: string; previewUrl: string | null; sentAt?: Date }) {
  const { rowCount } = await db.query(
    `UPDATE emails SET status = 'sent', sent_at = $2, message_id = $3, preview_url = $4, last_error = NULL, updated_at = now()
      WHERE id = $1 AND status = 'sending'`,
    [id, d.sentAt ?? new Date(), d.messageId, d.previewUrl],
  );
  return rowCount === 1;
}

/** Failed attempt: back to 'scheduled' for a retry, or terminal 'failed'. */
export async function markAttemptFailed(id: string, error: string, final: boolean) {
  await db.query(
    `UPDATE emails SET status = $3, last_error = $2, sent_at = CASE WHEN $3 = 'failed' THEN date_trunc('milliseconds', now()) ELSE sent_at END,
            claimed_at = NULL, updated_at = now()
      WHERE id = $1 AND status = 'sending'`,
    [id, error.slice(0, 500), final ? 'failed' : 'scheduled'],
  );
}

export async function releaseClaim(id: string) {
  await db.query(
    `UPDATE emails SET status = 'scheduled', claimed_at = NULL, updated_at = now() WHERE id = $1 AND status = 'sending'`,
    [id],
  );
}

export async function cancel(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE emails SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND user_id = $2 AND status IN ('scheduled','deferred')`,
    [id, userId],
  );
  return rowCount === 1;
}

export async function insertEmails(
  c: PoolClient,
  rows: { campaignId: string; userId: string; senderId: number; seq: number[]; recipients: string[]; at: Date[] },
) {
  const { rows: out } = await c.query<{ id: string; seq: number; recipient: string; scheduled_at: Date }>(
    `INSERT INTO emails (campaign_id, user_id, sender_id, seq, recipient, scheduled_at)
     SELECT $1, $2, $3, s, r, t FROM unnest($4::int[], $5::text[], $6::timestamptz[]) AS x(s, r, t)
     ON CONFLICT (campaign_id, recipient) DO NOTHING
     RETURNING id, seq, recipient, scheduled_at`,
    [rows.campaignId, rows.userId, rows.senderId, rows.seq, rows.recipients, rows.at],
  );
  return out.sort((a, b) => a.seq - b.seq);
}

/** Rows the queue must know about, in send order (keyset-paged). Used by the boot reconciler. */
export async function pendingForRecovery(after: { at: Date; seq: number; id: string } | null, limit: number) {
  const { rows } = await db.query<{ id: string; seq: number; status: EmailStatus; scheduled_at: Date; claimed_at: Date | null }>(
    `SELECT id, seq, status, scheduled_at, claimed_at FROM emails
      WHERE status IN ('scheduled','deferred','sending')
        AND ($1::timestamptz IS NULL OR (scheduled_at, seq, id) > ($1, $2, $3::uuid))
      ORDER BY scheduled_at, seq, id LIMIT $4`,
    [after?.at ?? null, after?.seq ?? 0, after?.id ?? '00000000-0000-0000-0000-000000000000', limit],
  );
  return rows;
}

// ---------- read side (dashboard) ----------

export interface EmailListItem {
  id: string;
  recipient: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  senderEmail: string;
  lastError: string | null;
  previewUrl: string | null;
  attempts: number;
}

const LIST_COLUMNS = `
  e.id, e.recipient, c.subject, left(c.body_text, 160) AS preview, e.status,
  e.scheduled_at AS "scheduledAt", e.sent_at AS "sentAt", s.email AS "senderEmail",
  e.last_error AS "lastError", e.preview_url AS "previewUrl", e.attempts`;

export type Folder = 'scheduled' | 'sent';

export async function listFolder(opts: {
  userId: string;
  folder: Folder;
  statuses?: EmailStatus[];
  limit: number;
  cursor?: { at: string; id: string } | null;
  ids?: string[] | null;
  textFallback?: string | null;
}): Promise<EmailListItem[]> {
  const scheduled = opts.folder === 'scheduled';
  const allowed = scheduled ? PENDING : FINISHED;
  const statuses = (opts.statuses?.length ? opts.statuses.filter((s) => allowed.includes(s)) : allowed) as string[];
  const orderCol = scheduled ? 'e.scheduled_at' : 'e.sent_at';
  // Keyset pagination: stable under inserts, no OFFSET scans.
  const cursorCmp = scheduled ? '>' : '<';
  const params: unknown[] = [opts.userId, statuses, opts.limit];
  let where = 'e.user_id = $1 AND e.status = ANY($2::text[])';
  if (opts.cursor) {
    params.push(opts.cursor.at, opts.cursor.id);
    where += ` AND (${orderCol}, e.id) ${cursorCmp} ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  if (opts.ids) {
    params.push(opts.ids);
    where += ` AND e.id = ANY($${params.length}::uuid[])`;
  }
  if (opts.textFallback) {
    params.push(`%${opts.textFallback.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
    const p = `$${params.length}`;
    where += ` AND (e.recipient ILIKE ${p} OR c.subject ILIKE ${p} OR c.body_text ILIKE ${p})`;
  }
  const dir = scheduled ? 'ASC' : 'DESC';
  const { rows } = await db.query<EmailListItem>(
    `SELECT ${LIST_COLUMNS}
       FROM emails e JOIN campaigns c ON c.id = e.campaign_id JOIN senders s ON s.id = e.sender_id
      WHERE ${where}
      ORDER BY ${orderCol} ${dir} NULLS LAST, e.id ${dir}
      LIMIT $3`,
    params,
  );
  return rows;
}

export async function getDetail(userId: string, id: string) {
  const { rows } = await db.query<EmailListItem & { bodyHtml: string; senderName: string; campaignId: string; createdAt: string; messageId: string | null }>(
    `SELECT ${LIST_COLUMNS}, c.body_html AS "bodyHtml", s.display_name AS "senderName",
            c.id AS "campaignId", e.created_at AS "createdAt", e.message_id AS "messageId"
       FROM emails e JOIN campaigns c ON c.id = e.campaign_id JOIN senders s ON s.id = e.sender_id
      WHERE e.user_id = $1 AND e.id = $2`,
    [userId, id],
  );
  return rows[0] ?? null;
}

export async function folderCounts(userId: string) {
  const { rows } = await db.query<{ status: EmailStatus; n: string }>(
    'SELECT status, count(*) AS n FROM emails WHERE user_id = $1 GROUP BY status',
    [userId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<EmailStatus, number>>;
  const n = (s: EmailStatus) => by[s] ?? 0;
  return {
    scheduled: n('scheduled') + n('deferred') + n('sending'),
    sent: n('sent') + n('failed'),
    byStatus: { scheduled: n('scheduled'), deferred: n('deferred'), sending: n('sending'), sent: n('sent'), failed: n('failed'), cancelled: n('cancelled') },
  };
}
