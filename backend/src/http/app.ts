import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { existsSync } from 'fs';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from '../config/env';
import { db } from '../infra/postgres';
import { redis } from '../infra/redis';
import { errorHandler } from './errors';
import { api } from './api.routes';
import { authRouter } from '../modules/auth/auth.routes';
import { slackRouter } from '../modules/slack/slack.routes';
import { requireUser } from '../modules/auth/middleware';
import { alertsQueue, dispatchQueue } from '../modules/dispatch/queues';
import { searchHealthy } from '../modules/search/search';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  app.get('/healthz', async (_req, res) => {
    const [pg, rd] = await Promise.allSettled([db.query('SELECT 1'), redis.ping()]);
    const ok = pg.status === 'fulfilled' && rd.status === 'fulfilled';
    res.status(ok ? 200 : 503).json({
      ok,
      postgres: pg.status === 'fulfilled',
      redis: rd.status === 'fulfilled',
      elasticsearch: searchHealthy(),
    });
  });

  // Live BullMQ dashboard. Behind the same Google session as the app.
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(dispatchQueue), new BullMQAdapter(alertsQueue)],
    serverAdapter: board,
    options: { uiConfig: { boardTitle: 'Sendline queues' } },
  });
  app.use('/admin/queues', requireUser, board.getRouter());

  app.use('/auth', authRouter);
  app.use('/api/integrations/slack', slackRouter);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint' } }));

  // Optional single-origin deploy: Express also serves the built SPA.
  if (env.webDistDir && existsSync(env.webDistDir)) {
    const dir = path.resolve(env.webDistDir);
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
