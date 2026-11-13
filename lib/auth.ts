import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'todo_session';

export interface Session {
  userId: number;
}

interface SessionPayload {
  userId: number;
  exp: number;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return secret;
}

function sign(unsignedToken: string, secret: string): string {
  return createHmac('sha256', secret).update(unsignedToken).digest('base64url');
}

export function createSessionToken(
  userId: number,
  expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
): string {
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new RangeError('userId must be a positive integer');
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: expiresAt } satisfies SessionPayload),
  ).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  return `${unsignedToken}.${sign(unsignedToken, sessionSecret())}`;
}

export async function createSession(userId: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

function readSessionToken(token: string, secret: string): Session | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signature] = parts;
  const unsignedToken = `${headerPart}.${payloadPart}`;
  const expected = sign(unsignedToken, secret);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as {
      alg?: string;
      typ?: string;
    };
    const payload = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    if (
      header.alg !== 'HS256' ||
      typeof payload.userId !== 'number' ||
      !Number.isSafeInteger(payload.userId) ||
      payload.userId < 1 ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { userId: payload.userId };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return readSessionToken(token, sessionSecret());
}
