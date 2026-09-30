import { Router } from 'express';
import { z } from 'zod';
import { HttpError, notFound, route } from './errors';
import { requireUser, uid } from '../modules/auth/middleware';
import { findUser } from '../modules/auth/users.repo';
import { listSenders } from '../modules/senders/senders.repo';
import * as emails from '../modules/emails/emails.repo';
import { scheduleCampaign, scheduleSchema, MAX_RECIPIENTS } from '../modules/campaigns/campaigns.service';
import { searchIds, searchHealthy, syncOne } from '../modules/search/search';
import { dispatchQueue } from '../modules/dispatch/queues';
import { SlotLedger } from '../modules/throttle/slot-ledger';
import { redis } from '../infra/redis';
import { env } from '../config/env';
import { getConnection } from '../modules/slack/slack.repo';

export const api = Router();
api.use(requireUser);

api.get('/me', route(async (req, res) => {
  const user = await findUser(uid(req));
  if (!user) throw new HttpError(401, 'unauthenticated', 'Account not found — sign in again.');
  const slack = await getConnection(user.id);
  res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url, slack });
}));

api.get('/senders', route(async (_req, res) => {
  const ledger = new SlotLedger(redis);
  const senders = await listSenders();
  res.json(
    await Promise.all(
      senders.map(async (s) => ({ id: s.id, email: s.email, displayName: s.displayName, usage: await ledger.usage(s.id) })),
    ),
  );
}));

/** Limits the UI needs to render the compose form honestly. */
api.get('/config', (_req, res) => {
  res.json({
    maxHourlyPerSender: env.throughput.senderHourlyCap,
    minSendGapMs: env.throughput.minGapMs,
    windowMs: env.throughput.windowMs,
    maxRecipients: MAX_RECIPIENTS,
  });
});

api.post('/campaigns', route(async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  const key = req.get('Idempotency-Key')?.trim().slice(0, 100) || undefined;
  const result = await scheduleCampaign(uid(req), input, key);
  res.status(result.replayed ? 200 : 201).json(result);
}));

const listQuery = z.object({
  folder: z.enum(['scheduled', 'sent']).default('scheduled'),
  status: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

const encodeCursor = (at: string | null, id: string) => Buffer.from(JSON.stringify({ at, id })).toString('base64url');
const decodeCursor = (c?: string) => {
  if (!c) return null;
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString());
    return typeof v.at === 'string' && typeof v.id === 'string' ? (v as { at: string; id: string }) : null;
  } catch {
    return null;
  }
};

api.get('/emails', route(async (req, res) => {
  const q = listQuery.parse(req.query);
  const statuses = q.status?.split(',').filter(Boolean) as emails.EmailStatus[] | undefined;
  let engine: 'elasticsearch' | 'postgres' | null = null;
  let ids: string[] | null = null;
  let textFallback: string | null = null;

  if (q.q) {
    const scope = q.folder === 'scheduled' ? emails.PENDING : emails.FINISHED;
    ids = await searchIds(uid(req), q.q, scope);
    if (ids) engine = 'elasticsearch';
    else {
      engine = 'postgres';
      textFallback = q.q;
    }
  }

  const items = await emails.listFolder({
    userId: uid(req),
    folder: q.folder,
    statuses,
    limit: q.limit + 1,
    cursor: decodeCursor(q.cursor),
    ids,
    textFallback,
  });
  const more = items.length > q.limit;
  const page = more ? items.slice(0, q.limit) : items;
  const last = page[page.length - 1];
  const at = (x: emails.EmailListItem) => (q.folder === 'scheduled' ? x.scheduledAt : x.sentAt);
  const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
  res.json({
    items: page,
    nextCursor: more && last ? encodeCursor(toIso(at(last)), last.id) : null,
    search: engine ? { engine } : null,
  });
}));

api.get('/emails/:id', route(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw notFound('Email');
  const detail = await emails.getDetail(uid(req), req.params.id);
  if (!detail) throw notFound('Email');
  res.json(detail);
}));

api.post('/emails/:id/cancel', route(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw notFound('Email');
  const ok = await emails.cancel(uid(req), req.params.id);
  if (!ok) throw new HttpError(409, 'not_cancellable', 'Only emails that have not started sending can be cancelled.');
  // Remove the timer too; if this races with the worker, the DB status check makes the job a no-op.
  await dispatchQueue.remove(req.params.id).catch(() => undefined);
  void syncOne(req.params.id);
  res.json({ ok: true });
}));

api.get('/overview', route(async (req, res) => {
  const counts = await emails.folderCounts(uid(req));
  const q = await dispatchQueue.getJobCounts('delayed', 'waiting', 'active', 'failed');
  res.json({ ...counts, queue: q, searchHealthy: searchHealthy() });
}));
