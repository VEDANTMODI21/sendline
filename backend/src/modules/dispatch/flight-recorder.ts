import { redis } from '../../infra/redis';
import type { Delivery } from '../senders/transport';

/**
 * Write-ahead markers around the SMTP call, so a crash can be classified afterwards:
 *   no marker        → SMTP never started        → safe to send again
 *   phase=started    → crashed mid-conversation  → unknown; we do NOT resend (no duplicates)
 *   phase=delivered  → SMTP accepted, DB update lost → finish the DB row from the marker
 */
const key = (id: string) => `sl:flight:${id}`;
const TTL_S = 7 * 24 * 3600;

export type FlightState =
  | { phase: 'none' }
  | { phase: 'started' }
  | { phase: 'delivered'; messageId: string; previewUrl: string | null; at: number };

export const flight = {
  async started(id: string) {
    await redis.hset(key(id), { phase: 'started', t: Date.now() });
    await redis.expire(key(id), TTL_S);
  },
  async delivered(id: string, d: Delivery) {
    await redis.hset(key(id), { phase: 'delivered', messageId: d.messageId, previewUrl: d.previewUrl ?? '', at: Date.now() });
    await redis.expire(key(id), TTL_S);
  },
  /** SMTP definitively rejected the message → nothing was delivered, forget the attempt. */
  async aborted(id: string) {
    await redis.del(key(id));
  },
  async read(id: string): Promise<FlightState> {
    const h = await redis.hgetall(key(id));
    if (h.phase === 'delivered') return { phase: 'delivered', messageId: h.messageId, previewUrl: h.previewUrl || null, at: Number(h.at) };
    if (h.phase === 'started') return { phase: 'started' };
    return { phase: 'none' };
  },
};
