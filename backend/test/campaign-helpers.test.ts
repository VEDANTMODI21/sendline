import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://unused';
process.env.SESSION_SECRET ??= 'unit-test-secret-unit-test-secret';

test('cleanRecipients lower-cases, dedupes and keeps upload order', async () => {
  const { cleanRecipients } = await import('../src/modules/campaigns/recipients');
  const r = cleanRecipients([' Ana@Acme.io ', 'bob@acme.io', 'ANA@acme.io', 'nope', 'mailto:cy@x.dev', '']);
  assert.deepEqual(r.valid, ['ana@acme.io', 'bob@acme.io', 'cy@x.dev']);
  assert.deepEqual(r.invalid, ['nope']);
  assert.equal(r.duplicates, 1);
});

test('planTimeline spaces sends by the delay and never starts in the past', async () => {
  const { planTimeline } = await import('../src/modules/campaigns/planner');
  const now = Date.UTC(2026, 0, 1, 10, 0, 0);
  const past = new Date(now - 60_000);
  const t = planTimeline(past, 3, 5, now).map((d) => d.getTime() - now);
  assert.deepEqual(t, [0, 5000, 10000]);
  const burst = planTimeline(new Date(now), 3, 0, now).map((d) => d.getTime() - now);
  assert.deepEqual(burst, [0, 1, 2], 'zero delay still yields a strict FIFO order');
});

test('sanitizeBody strips scripts/handlers but keeps formatting', async () => {
  const { sanitizeBody, htmlToText } = await import('../src/modules/campaigns/content');
  const html = sanitizeBody('<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src=x onerror=y></p><blockquote>q</blockquote>');
  assert.equal(html, '<p>Hi <b>there</b></p><blockquote>q</blockquote>');
  assert.equal(htmlToText('<p>Hi&nbsp;<b>there</b></p><p>Line 2</p>'), 'Hi there\nLine 2');
});

test('sealed secrets round-trip and are tamper-evident', async () => {
  const { seal, unseal } = await import('../src/infra/crypto');
  const s = seal('https://example.test/webhook/dummy');
  assert.notEqual(s, 'https://example.test/webhook/dummy');
  assert.equal(unseal(s), 'https://example.test/webhook/dummy');
  const [v, iv, tag, body] = s.split('.');
  assert.throws(() => unseal([v, iv, tag, body.slice(0, -2) + 'AA'].join('.')));
});
