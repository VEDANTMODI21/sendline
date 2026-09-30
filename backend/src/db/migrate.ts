import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { db, withAdvisoryLock } from '../infra/postgres';
import { logger } from '../infra/logger';

const log = logger('migrate');
const MIGRATION_LOCK = 0x5e_4d_11_4e;

/** Forward-only SQL migrations, applied once each, serialized across instances by an advisory lock. */
export async function migrate(dir = path.resolve(__dirname, '../../migrations')) {
  await withAdvisoryLock(MIGRATION_LOCK, async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), 'utf8');
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log.info(`applied ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  });
}
