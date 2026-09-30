import { Worker } from 'bullmq';
import { env } from '../../config/env';
import { createRedis, redis } from '../../infra/redis';
import { logger, errMsg } from '../../infra/logger';
import { SlotLedger } from '../throttle/slot-ledger';
import { notifyRateLimit } from '../slack/notifier';
import { closeTransports } from '../senders/transport';
import { createProcessor } from './processor';
import { ALERTS_QUEUE, DISPATCH_QUEUE, DispatchJob, RateLimitAlertJob } from './queues';

const log = logger('worker');

export function startWorkers() {
  const ledger = new SlotLedger(redis);
  const processor = createProcessor(ledger);

  // Concurrency parallelises across senders; per-sender pacing is enforced by the ledger,
  // so raising WORKER_CONCURRENCY or running more worker processes never breaks the limits.
  const dispatch = new Worker<DispatchJob>(DISPATCH_QUEUE, processor, {
    connection: createRedis('worker-dispatch'),
    concurrency: env.throughput.concurrency,
    lockDuration: 60_000,
    stalledInterval: 30_000,
    maxStalledCount: 2,
  });

  const alerts = new Worker<RateLimitAlertJob>(ALERTS_QUEUE, async (job) => ({ delivered: await notifyRateLimit(job.data) }), {
    connection: createRedis('worker-alerts'),
    concurrency: 2,
  });

  dispatch.on('failed', (job, e) => log.warn('dispatch job failed', { id: job?.id, attempt: job?.attemptsMade, err: e.message }));
  dispatch.on('error', (e) => log.error('dispatch worker error', { err: errMsg(e) }));
  alerts.on('failed', (job, e) => log.warn('alert job failed', { id: job?.id, err: e.message }));
  alerts.on('error', (e) => log.error('alerts worker error', { err: errMsg(e) }));

  log.info('workers running', {
    concurrency: env.throughput.concurrency,
    minGapMs: env.throughput.minGapMs,
    senderHourlyCap: env.throughput.senderHourlyCap,
    windowMs: env.throughput.windowMs,
  });

  return async function stop() {
    // close() waits for in-flight jobs → a graceful restart never interrupts an SMTP call.
    await Promise.allSettled([dispatch.close(), alerts.close()]);
    closeTransports();
  };
}
