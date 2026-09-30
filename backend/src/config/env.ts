import 'dotenv/config';
import { z } from 'zod';

/**
 * Every tunable lives here and is validated once at boot.
 * A typo in .env fails fast with a readable message instead of a silent default.
 */
const intFrom = (fallback: number, min = 0) =>
  z.coerce.number().int().min(min).default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: intFrom(4000, 1),

  // Public origin the *browser* sees (Vite dev server or the deployed host).
  // OAuth redirect URIs are derived from it, and /api, /auth, /admin are proxied through it.
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Optional: serve the built frontend from Express (single-origin deploys).
  WEB_DIST_DIR: z.string().optional(),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_INDEX: z.string().default('sendline-emails'),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),

  // --- Throughput knobs (nothing hardcoded) ---
  WORKER_CONCURRENCY: intFrom(5, 1),
  MIN_SEND_GAP_MS: intFrom(2000, 0),
  MAX_EMAILS_PER_HOUR_PER_SENDER: intFrom(50, 1),
  SEND_MAX_ATTEMPTS: intFrom(3, 1),
  RECONCILE_ON_BOOT: z.enum(['true', 'false']).default('true'),

  // --- Ethereal senders ---
  // Either list existing accounts ("user:pass,user:pass") or let the service create N on first boot.
  ETHEREAL_ACCOUNTS: z.string().default(''),
  ETHEREAL_AUTO_PROVISION: intFrom(3, 0),

  // Clock override for demos: shrink the "hour" window so rate-limit rollover is visible in minutes.
  RATE_WINDOW_MS: intFrom(3_600_000, 10_000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const e = parsed.data;
const appUrl = e.APP_URL.replace(/\/$/, '');

export const env = {
  isProd: e.NODE_ENV === 'production',
  port: e.PORT,
  appUrl,
  secureCookies: appUrl.startsWith('https://'),
  webDistDir: e.WEB_DIST_DIR,
  databaseUrl: e.DATABASE_URL,
  databaseSsl: e.DATABASE_SSL === 'true',
  redisUrl: e.REDIS_URL,
  elastic: { url: e.ELASTICSEARCH_URL, apiKey: e.ELASTICSEARCH_API_KEY, index: e.ELASTICSEARCH_INDEX },
  sessionSecret: e.SESSION_SECRET,
  google: {
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    redirectUri: `${appUrl}/auth/google/callback`,
  },
  slack: {
    clientId: e.SLACK_CLIENT_ID,
    clientSecret: e.SLACK_CLIENT_SECRET,
    redirectUri: `${appUrl}/api/integrations/slack/callback`,
  },
  throughput: {
    concurrency: e.WORKER_CONCURRENCY,
    minGapMs: e.MIN_SEND_GAP_MS,
    senderHourlyCap: e.MAX_EMAILS_PER_HOUR_PER_SENDER,
    maxAttempts: e.SEND_MAX_ATTEMPTS,
    windowMs: e.RATE_WINDOW_MS,
  },
  reconcileOnBoot: e.RECONCILE_ON_BOOT === 'true',
  ethereal: { accounts: e.ETHEREAL_ACCOUNTS, autoProvision: e.ETHEREAL_AUTO_PROVISION },
} as const;

export type Role = 'api' | 'worker' | 'all';

/** `--role=api|worker|all` (CLI) or ROLE env. Default runs both in one process. */
export function resolveRole(argv = process.argv): Role {
  const flag = argv.find((a) => a.startsWith('--role='))?.split('=')[1] ?? process.env.ROLE ?? 'all';
  if (flag === 'api' || flag === 'worker' || flag === 'all') return flag;
  throw new Error(`Unknown role "${flag}" (expected api | worker | all)`);
}
