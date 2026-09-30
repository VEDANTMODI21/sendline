import { readFileSync } from 'fs';
import path from 'path';
import type { Redis } from 'ioredis';
import { env } from '../../config/env';

// tsc does not copy .lua files; `npm run build` copies it next to the compiled JS.
const LUA = readFileSync(path.resolve(__dirname, 'slot-ledger.lua'), 'utf8');

export interface SlotRequest {
  senderId: number;
  campaignId: string;
  campaignHourlyLimit: number;
  /** The campaign's own 'delay between emails'; the effective gap is max(this, MIN_SEND_GAP_MS). */
  campaignGapMs?: number;
  /** Never earlier than the email's planned time. */
  notBefore: number;
  /** Window this email already holds quota in (from a previous park), if any. */
  bookedWindow?: number | null;
  now?: number;
}

export interface Slot {
  /** Epoch ms: when to send (paced) or when to wake up again (parked). */
  at: number;
  window: number;
  /** true → `at` is a real pacing slot owned by this email; false → parked in a future window. */
  paced: boolean;
  /** The email rolled past at least one full window. */
  deferred: boolean;
  blockedScope: 'sender' | 'campaign' | null;
  /** First deferral for this scope in the current real window → alert Slack. */
  shouldAlert: boolean;
}

type LedgerRedis = Redis & {
  sendlineSlot(...args: (string | number)[]): Promise<[number, number, number, number, number, string]>;
};

export class SlotLedger {
  private readonly r: LedgerRedis;

  constructor(redis: Redis, private readonly cfg = env.throughput) {
    if (!(redis as unknown as Partial<LedgerRedis>).sendlineSlot) redis.defineCommand('sendlineSlot', { numberOfKeys: 0, lua: LUA });
    this.r = redis as unknown as LedgerRedis;
  }

  /** Hash-tagged so all of a sender's keys land in one Redis Cluster slot. */
  static prefix = (senderId: number) => `sl:thr:{s${senderId}}`;

  get windowMs() {
    return this.cfg.windowMs;
  }

  async reserve(req: SlotRequest): Promise<Slot> {
    const sPrefix = SlotLedger.prefix(req.senderId);
    const [at, window, paced, blocked, notify, scope] = await this.r.sendlineSlot(
      req.now ?? Date.now(),
      Math.max(this.cfg.minGapMs, req.campaignGapMs ?? 0),
      this.cfg.senderHourlyCap,
      Math.max(1, Math.floor(req.campaignHourlyLimit)),
      this.cfg.windowMs,
      sPrefix,
      `${sPrefix}:c:${req.campaignId}`,
      Math.floor(req.notBefore),
      req.bookedWindow ?? -1,
    );
    return {
      at: Number(at),
      window: Number(window),
      paced: Number(paced) === 1,
      deferred: Number(blocked) >= 0,
      blockedScope: scope === 'sender' || scope === 'campaign' ? scope : null,
      shouldAlert: Number(notify) === 1,
    };
  }

  /** Quota booked in the current window, for the dashboard. */
  async usage(senderId: number, now = Date.now()) {
    const w = Math.floor(now / this.cfg.windowMs);
    const used = Number((await this.r.get(`${SlotLedger.prefix(senderId)}:w:${w}`)) ?? 0);
    return { used, cap: this.cfg.senderHourlyCap, windowEndsAt: (w + 1) * this.cfg.windowMs };
  }
}
