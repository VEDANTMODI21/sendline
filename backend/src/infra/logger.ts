/* Tiny structured logger: one JSON line in production, readable lines in dev. */
import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';
const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = rank[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;

function write(level: Level, scope: string, msg: string, meta?: Record<string, unknown>) {
  if (rank[level] < threshold) return;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (env.isProd) {
    out(JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...meta }));
  } else {
    const tail = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    out(`${new Date().toISOString().slice(11, 23)} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${tail}`);
  }
}

export const logger = (scope: string) => ({
  debug: (m: string, meta?: Record<string, unknown>) => write('debug', scope, m, meta),
  info: (m: string, meta?: Record<string, unknown>) => write('info', scope, m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => write('warn', scope, m, meta),
  error: (m: string, meta?: Record<string, unknown>) => write('error', scope, m, meta),
});

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
