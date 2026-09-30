import { Router } from 'express';
import { env } from '../../config/env';
import { route } from '../../http/errors';
import { logger, errMsg } from '../../infra/logger';
import { buildAuthorizeUrl, exchangeCode, isGoogleConfigured, newPkcePair } from './google';
import { cookieBase, endSession, readToken, signToken, startSession } from './session';
import { upsertFromGoogle } from './users.repo';
import { randomBytes } from 'crypto';

const log = logger('auth');
const FLOW_COOKIE = 'sl_oauth';
const back = (query: string) => `${env.appUrl}/login?${query}`;

export const authRouter = Router();

/** Step 1: bounce to Google. State + PKCE verifier ride in a short-lived signed cookie. */
authRouter.get('/google', route(async (_req, res) => {
  if (!isGoogleConfigured()) return res.redirect(back('error=google_not_configured'));
  const state = randomBytes(16).toString('base64url');
  const { verifier, challenge } = newPkcePair();
  const flow = await signToken('google-flow', { state, verifier }, '10m');
  res.cookie(FLOW_COOKIE, flow, { ...cookieBase(), maxAge: 10 * 60 * 1000 });
  res.redirect(buildAuthorizeUrl(state, challenge));
}));

/** Step 2: Google redirects back here with ?code&state. */
authRouter.get('/google/callback', route(async (req, res) => {
  const flow = await readToken<{ state: string; verifier: string }>('google-flow', req.cookies?.[FLOW_COOKIE]);
  res.clearCookie(FLOW_COOKIE, cookieBase());

  if (req.query.error) return res.redirect(back('error=google_cancelled'));
  if (!flow || flow.state !== req.query.state || typeof req.query.code !== 'string') {
    return res.redirect(back('error=google_state_mismatch'));
  }
  try {
    const profile = await exchangeCode(req.query.code, flow.verifier);
    const user = await upsertFromGoogle(profile);
    await startSession(res, user.id);
    log.info('signed in', { user: user.email });
    res.redirect(`${env.appUrl}/scheduled`);
  } catch (e) {
    log.warn('google login failed', { err: errMsg(e) });
    res.redirect(back('error=google_failed'));
  }
}));

authRouter.post('/logout', (_req, res) => {
  endSession(res);
  res.status(204).end();
});
