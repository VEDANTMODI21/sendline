import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';

export const db = new Pool({
  connectionString: env.databaseUrl,
  max: 15,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

/** Runs `fn` inside a transaction; rolls back on any throw. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Cluster-wide mutex backed by a Postgres advisory lock (used for migrations + sender provisioning). */
export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [key]);
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [key]).catch(() => undefined);
    client.release();
  }
}
