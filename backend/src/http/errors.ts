import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../infra/logger';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'bad_request', msg, details);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);

/** Lets async route handlers throw; Express 4 does not catch rejected promises by itself. */
export const route =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

const log = logger('http');

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: { code: 'validation_failed', message: fields[0]?.message ?? 'Invalid input', fields } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  log.error('unhandled', { path: req.path, err: err instanceof Error ? err.stack : String(err) });
  return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
}
