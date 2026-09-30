import type { NextFunction, Request, Response } from 'express';
import { readToken, SESSION_COOKIE } from './session';
import { HttpError } from '../../http/errors';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const claims = await readToken<{ sub: string }>('session', req.cookies?.[SESSION_COOKIE]);
  if (!claims?.sub) return next(new HttpError(401, 'unauthenticated', 'Please sign in to continue.'));
  req.userId = claims.sub;
  next();
}

/** Narrowing helper for handlers mounted behind requireUser. */
export const uid = (req: Request) => {
  if (!req.userId) throw new HttpError(401, 'unauthenticated', 'Please sign in to continue.');
  return req.userId;
};
