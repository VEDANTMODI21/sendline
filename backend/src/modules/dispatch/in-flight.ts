import * as emails from '../emails/emails.repo';
import { flight } from './flight-recorder';
import { syncOne } from '../search/search';
import { logger } from '../../infra/logger';

const log = logger('recovery');

/**
 * An email found in 'sending' whose worker is gone (crash / kill -9 / stalled job).
 * Returns 'requeue' only when we can prove the SMTP call never started.
 */
export async function resolveInterrupted(id: string): Promise<'finished' | 'requeue'> {
  const f = await flight.read(id);
  if (f.phase === 'delivered') {
    await emails.markSent(id, { messageId: f.messageId, previewUrl: f.previewUrl, sentAt: new Date(f.at) });
    log.info('recovered delivered email from flight marker', { id });
    await syncOne(id);
    return 'finished';
  }
  if (f.phase === 'started') {
    await emails.markAttemptFailed(id, 'Delivery interrupted mid-SMTP; not retried automatically to avoid a duplicate send.', true);
    log.warn('interrupted mid-delivery → marked failed (at-most-once)', { id });
    await syncOne(id);
    return 'finished';
  }
  await emails.releaseClaim(id);
  log.info('claim released; SMTP had not started', { id });
  return 'requeue';
}
