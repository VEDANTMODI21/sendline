/**
 * Behaviour-under-load demo: schedules N emails for (roughly) the same instant through the real API.
 *
 *   npx tsx scripts/load-test.ts --user you@gmail.com [--count 1000] [--sender 1] [--limit 50] [--api http://localhost:4000]
 *
 * The user must have signed in once with Google. The script mints a session for them with
 * SESSION_SECRET (an operator-only tool: it needs the server's secret and database).
 */
import { db } from '../src/infra/postgres';
import { signToken, SESSION_COOKIE } from '../src/modules/auth/session';

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

async function run() {
  const email = arg('user');
  if (!email) throw new Error('--user <email of a signed-in user> is required');
  const count = Number(arg('count', '1000'));
  const api = arg('api', `http://localhost:${process.env.PORT ?? 4000}`);
  const { rows } = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (!rows[0]) throw new Error(`no user ${email} — sign in with Google first`);
  const token = await signToken('session', { sub: rows[0].id }, '10m');

  const recipients = Array.from({ length: count }, (_, i) => `load-${Date.now().toString(36)}-${i}@example.com`);
  const started = Date.now();
  const res = await fetch(`${api}/api/campaigns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify({
      senderId: Number(arg('sender', '1')),
      subject: `Load test × ${count}`,
      bodyHtml: '<p>Synthetic load-test email from Sendline.</p>',
      recipients,
      delaySeconds: 0,
      hourlyLimit: arg('limit') ? Number(arg('limit')) : undefined,
    }),
  });
  const body = await res.json();
  console.log(`HTTP ${res.status} in ${Date.now() - started} ms`);
  console.log(body);
  await db.end();
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
