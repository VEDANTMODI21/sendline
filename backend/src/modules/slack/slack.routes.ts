import { Router } from 'express';
import { env } from '../../config/env';
import { HttpError, route } from '../../http/errors';
import { logger, errMsg } from '../../infra/logger';
import { requireUser, uid } from '../auth/middleware';
import { readToken, signToken } from '../auth/session';
import { deleteConnection, getConnection, saveConnection } from './slack.repo';
import { SlackRevokedError, sendTestMessage } from './notifier';

const log = logger('slack');
const back = (q: string) => `${env.appUrl}/scheduled?${q}`;
const configured = () => Boolean(env.slack.clientId && env.slack.clientSecret);

export const slackRouter = Router();
slackRouter.use(requireUser);

slackRouter.get('/', route(async (req, res) => {
  res.json({ available: configured(), connection: await getConnection(uid(req)) });
}));

/** "Connect Slack" → Slack's OAuth v2 consent screen. User picks the channel for incoming-webhook. */
slackRouter.get('/install', route(async (req, res) => {
  if (!configured()) return res.redirect(back('slack=not_configured'));
  const state = await signToken('slack-flow', { sub: uid(req) }, '10m');
  const q = new URLSearchParams({
    client_id: env.slack.clientId,
    scope: 'incoming-webhook',
    redirect_uri: env.slack.redirectUri,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${q}`);
}));

slackRouter.get('/callback', route(async (req, res) => {
  const state = await readToken<{ sub: string }>('slack-flow', String(req.query.state ?? ''));
  // The state must belong to the *currently signed-in* user (defends against login CSRF).
  if (!state || state.sub !== uid(req)) return res.redirect(back('slack=state_mismatch'));
  if (req.query.error) return res.redirect(back('slack=cancelled'));
  try {
    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code ?? ''),
        client_id: env.slack.clientId,
        client_secret: env.slack.clientSecret,
        redirect_uri: env.slack.redirectUri,
      }),
    });
    const j = (await r.json()) as {
      ok: boolean;
      error?: string;
      team?: { id: string; name: string };
      incoming_webhook?: { url: string; channel: string };
    };
    if (!j.ok || !j.incoming_webhook || !j.team) throw new Error(j.error ?? 'missing incoming_webhook');
    await saveConnection(uid(req), {
      teamId: j.team.id,
      teamName: j.team.name,
      channel: j.incoming_webhook.channel,
      webhookUrl: j.incoming_webhook.url,
    });
    log.info('slack connected', { team: j.team.name, channel: j.incoming_webhook.channel });
    res.redirect(back('slack=connected'));
  } catch (e) {
    log.warn('slack oauth failed', { err: errMsg(e) });
    res.redirect(back('slack=failed'));
  }
}));

slackRouter.post('/test', route(async (req, res) => {
  try {
    const ok = await sendTestMessage(uid(req));
    if (!ok) throw new HttpError(409, 'slack_not_connected', 'Connect Slack first.');
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof SlackRevokedError) {
      await deleteConnection(uid(req));
      throw new HttpError(410, 'slack_revoked', 'Slack access was revoked. Connect again.');
    }
    throw e;
  }
}));

slackRouter.delete('/', route(async (req, res) => {
  await deleteConnection(uid(req));
  res.status(204).end();
}));
