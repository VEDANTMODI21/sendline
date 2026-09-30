import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../../config/env';

/**
 * Google OpenID Connect, authorization-code flow with PKCE.
 * No SDK: two HTTPS calls + ID-token signature check against Google's JWKS.
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export const isGoogleConfigured = () => Boolean(env.google.clientId && env.google.clientSecret);

export function newPkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(state: string, challenge: string) {
  const q = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${q}`;
}

export async function exchangeCode(code: string, verifier: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = (await res.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) throw new Error(body.error_description ?? body.error ?? `token exchange failed (${res.status})`);

  const { payload } = await jwtVerify(body.id_token, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.google.clientId,
  });
  if (!payload.sub || typeof payload.email !== 'string') throw new Error('Google did not return an email');
  if (payload.email_verified === false) throw new Error('Google account email is not verified');
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : payload.email.split('@')[0],
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
