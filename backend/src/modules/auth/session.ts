import type { Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';

const secret = new TextEncoder().encode(env.sessionSecret);
export const SESSION_COOKIE = 'sl_session';
const ISSUER = 'sendline';

type Purpose = 'session' | 'google-flow' | 'slack-flow';

/** Short, purpose-scoped signed tokens. A slack-flow token can never be replayed as a session. */
export async function signToken(purpose: Purpose, claims: Record<string, string>, ttl: string) {
  return new SignJWT({ ...claims, pur: purpose })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

export async function readToken<T extends Record<string, string>>(purpose: Purpose, token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    return payload.pur === purpose ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

export const cookieBase = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.secureCookies,
  path: '/',
});

export async function startSession(res: Response, userId: string) {
  const token = await signToken('session', { sub: userId }, '7d');
  res.cookie(SESSION_COOKIE, token, { ...cookieBase(), maxAge: 7 * 24 * 3600 * 1000 });
}

export const endSession = (res: Response) => res.clearCookie(SESSION_COOKIE, cookieBase());
