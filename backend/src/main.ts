import { env, resolveRole } from './config/env';
import { logger, errMsg } from './infra/logger';
import { db } from './infra/postgres';
import { redis } from './infra/redis';
import { migrate } from './db/migrate';
import { ensureSenderPool } from './modules/senders/provision';
import { initSearch } from './modules/search/search';
import { buildApp } from './http/app';
import { startWorkers } from './modules/dispatch/worker';
import { reconcile } from './modules/recovery/reconciler';
import { closeQueues } from './modules/dispatch/queues';

const log = logger('boot');

async function main() {
  const role = resolveRole();
  log.info(`starting sendline (${role})`);

  await migrate();
  await ensureSenderPool();
  await initSearch();

  const stops: Array<() => Promise<unknown>> = [];

  if (role !== 'api') {
    if (env.reconcileOnBoot) await reconcile();
    stops.push(startWorkers());
  }

  if (role !== 'worker') {
    const server = buildApp().listen(env.port, () => {
      log.info(`api listening on :${env.port}  (queue board: ${env.appUrl}/admin/queues)`);
    });
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        log.error(`port ${env.port} is already in use — another Sendline backend is probably still running. Stop it (Ctrl+C in its terminal) and start again.`);
      } else log.error('http server error', { err: errMsg(e) });
      process.exit(1);
    });
    stops.unshift(() => new Promise((r) => server.close(r)));
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal} received — draining (in-flight sends finish first)`);
    const force = setTimeout(() => process.exit(1), 30_000).unref();
    for (const stop of stops) await stop().catch((e) => log.warn('stop error', { err: errMsg(e) }));
    await closeQueues();
    await Promise.allSettled([db.end(), redis.quit()]);
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  log.error('fatal boot error', { err: e instanceof Error ? e.stack : String(e) });
  process.exit(1);
});
