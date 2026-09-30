import { Queue } from 'bullmq';
import { env } from '../../config/env';
import { createRedis } from '../../infra/redis';

export const DISPATCH_QUEUE = 'sendline-dispatch';
export const ALERTS_QUEUE = 'sendline-alerts';

/** Job payload. `booked`/`slotAt` are ledger reservations carried across delays (see processor). */
export interface DispatchJob {
  emailId: string;
  booked?: number;
  slotAt?: number;
}

export interface RateLimitAlertJob {
  userId: string;
  senderEmail: string;
  scope: 'sender' | 'campaign';
  limit: number;
  campaignSubject: string;
  resumesAt: number;
}

const connection = createRedis('queues');

export const dispatchQueue = new Queue<DispatchJob>(DISPATCH_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: env.throughput.maxAttempts,
    backoff: { type: 'exponential', delay: 10_000 },
    // Keep finished job ids around for a day so a duplicate add with the same jobId stays a no-op.
    removeOnComplete: { age: 24 * 3600, count: 20_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const alertsQueue = new Queue<RateLimitAlertJob>(ALERTS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/** jobId === email id → enqueueing the same email twice can never create two jobs. */
export const dispatchJobFor = (emailId: string, runAt: Date | number) => ({
  name: 'send-email',
  data: { emailId } as DispatchJob,
  opts: { jobId: emailId, delay: Math.max(0, +runAt - Date.now()) },
});

export async function enqueueEmails(items: { id: string; at: Date | number }[]) {
  for (let i = 0; i < items.length; i += 500) {
    await dispatchQueue.addBulk(items.slice(i, i + 500).map((x) => dispatchJobFor(x.id, x.at)));
  }
}

export async function closeQueues() {
  await Promise.allSettled([dispatchQueue.close(), alertsQueue.close()]);
  connection.disconnect();
}
