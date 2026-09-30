import { env } from '../../config/env';
import { logger } from '../../infra/logger';
import { deleteConnection, getWebhook } from './slack.repo';
import type { RateLimitAlertJob } from '../dispatch/queues';

const log = logger('slack');

export class SlackRevokedError extends Error {}

async function post(webhook: string, payload: unknown) {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  // Slack answers 403/404/410 once the app is uninstalled or the channel is gone.
  if ([403, 404, 410].includes(res.status)) throw new SlackRevokedError(`${res.status} ${body}`);
  throw new Error(`Slack webhook responded ${res.status} ${body}`);
}

const fmt = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

const per = () => {
  const ms = env.throughput.windowMs;
  if (ms === 3_600_000) return 'hour';
  return ms % 60_000 === 0 ? `${ms / 60_000}-minute window` : `${Math.round(ms / 1000)}s window`;
};

export function rateLimitMessage(a: RateLimitAlertJob) {
  const who = a.scope === 'sender' ? `Sender *${a.senderEmail}*` : `Campaign "*${a.campaignSubject}*" on ${a.senderEmail}`;
  return {
    text: `${who} reached its hourly limit (${a.limit} per ${per()}). Remaining emails are queued, not dropped.`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '⏳ Hourly send limit reached' } },
      { type: 'section', text: { type: 'mrkdwn', text: `${who} hit its limit of *${a.limit} emails per ${per()}*.` } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Scope*\n${a.scope === 'sender' ? 'Per sender' : 'Per campaign'}` },
          { type: 'mrkdwn', text: `*Next window opens*\n${fmt(a.resumesAt)}` },
        ],
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Deferred emails keep their order and resume automatically — Sendline' }] },
    ],
  };
}

/** Returns false when the user has no Slack connected — that is a normal, silent no-op. */
export async function notifyRateLimit(a: RateLimitAlertJob): Promise<boolean> {
  const webhook = await getWebhook(a.userId);
  if (!webhook) {
    log.debug('rate limit hit but Slack not connected; skipping', { user: a.userId });
    return false;
  }
  try {
    await post(webhook, rateLimitMessage(a));
    log.info('rate-limit alert delivered', { user: a.userId, sender: a.senderEmail, scope: a.scope });
    return true;
  } catch (e) {
    if (e instanceof SlackRevokedError) {
      log.warn('Slack webhook revoked; removing connection', { user: a.userId });
      await deleteConnection(a.userId);
      return false;
    }
    throw e; // transient → BullMQ retries the alert job
  }
}

export async function sendTestMessage(userId: string) {
  const webhook = await getWebhook(userId);
  if (!webhook) return false;
  await post(webhook, { text: '✅ Sendline is connected. You will be notified here when a sender hits its hourly limit.' });
  return true;
}
