/**
 * Exercises the Lua slot ledger against a real Redis (REDIS_URL, default localhost:6379).
 * Each test uses fresh sender ids, so it never touches production keys.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import IORedis from 'ioredis';

process.env.DATABASE_URL ??= 'postgres://unused';
process.env.SESSION_SECRET ??= 'unit-test-secret-unit-test-secret';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
after(() => redis.disconnect());

const W = 60_000; // 1-minute windows keep the arithmetic readable
const cfg = { concurrency: 1, minGapMs: 1000, senderHourlyCap: 3, maxAttempts: 1, windowMs: W };
const sid = () => 900_000 + Math.floor(Math.random() * 99_999);

async function ledger() {
  const { SlotLedger } = await import('../src/modules/throttle/slot-ledger');
  return new SlotLedger(redis, cfg);
}

test('paces consecutive sends from one sender by the minimum gap', async (t) => {
  try { await redis.connect(); } catch { return t.skip('Redis not available'); }
  const l = await ledger();
  const s = sid();
  const now = 100 * W + 5_000;
  const a = await l.reserve({ senderId: s, campaignId: 'c', campaignHourlyLimit: 10, notBefore: now, now });
  const b = await l.reserve({ senderId: s, campaignId: 'c', campaignHourlyLimit: 10, notBefore: now, now });
  assert.equal(a.at, now);
  assert.equal(b.at, now + 1000);
  assert.ok(a.paced && b.paced);
});

test('rolls to the next window when the sender cap is hit, alerting once, in FIFO order', async () => {
  const l = await ledger();
  const s = sid();
  const now = 200 * W + 1_000;
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(await l.reserve({ senderId: s, campaignId: 'c', campaignHourlyLimit: 99, notBefore: now, now }));
  assert.deepEqual(slots.slice(0, 3).map((x) => x.window), [200, 200, 200]);
  assert.deepEqual(slots.slice(3).map((x) => x.window), [201, 201]);
  assert.equal(slots[3].deferred, true);
  assert.equal(slots[3].blockedScope, 'sender');
  assert.deepEqual(slots.map((x) => x.shouldAlert), [false, false, false, true, false], 'exactly one alert per burst');
  assert.ok(slots[3].at < slots[4].at && slots[3].at >= 201 * W, 'parked emails keep their order');
});

test('a campaign limit below the sender cap only defers that campaign', async () => {
  const l = await ledger();
  const s = sid();
  const now = 300 * W + 1_000;
  const c1 = await l.reserve({ senderId: s, campaignId: 'small', campaignHourlyLimit: 1, notBefore: now, now });
  const c1b = await l.reserve({ senderId: s, campaignId: 'small', campaignHourlyLimit: 1, notBefore: now, now });
  const c2 = await l.reserve({ senderId: s, campaignId: 'other', campaignHourlyLimit: 5, notBefore: now, now });
  assert.equal(c1.window, 300);
  assert.equal(c1b.window, 301);
  assert.equal(c1b.blockedScope, 'campaign');
  assert.equal(c2.window, 300, 'other campaign on the same sender is not blocked');
});

test('a parked email re-uses its booking instead of consuming quota twice', async () => {
  const l = await ledger();
  const s = sid();
  const now = 400 * W + 1_000;
  for (let i = 0; i < 3; i++) await l.reserve({ senderId: s, campaignId: 'c', campaignHourlyLimit: 99, notBefore: now, now });
  const parked = await l.reserve({ senderId: s, campaignId: 'c', campaignHourlyLimit: 99, notBefore: now, now });
  assert.equal(parked.window, 401);
  const wake = parked.at;
  const resumed = await l.reserve({ senderId: s, campaignId: 'c', campaignHourlyLimit: 99, notBefore: now, now: wake, bookedWindow: parked.window });
  assert.equal(resumed.window, 401);
  assert.equal(resumed.paced, true);
  assert.equal((await l.usage(s, wake)).used, 1, 'still exactly one booking in window 401');
});
