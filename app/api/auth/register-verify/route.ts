import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { authenticatorDB, authChallengeDB, db, userDB } from '@/lib/db';
import { createSession, getSession } from '@/lib/auth';
import { getWebAuthnConfig, isUsername } from '@/lib/webauthn';

function isResponse(value: unknown): value is RegistrationResponseJSON {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'response' in value && typeof value.response === 'object' && value.response !== null;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('username' in body) || !('response' in body)
    || !isUsername(body.username) || !isResponse(body.response)) {
    return NextResponse.json({ error: 'Invalid registration response' }, { status: 400 });
  }
  const username = body.username;
  const registrationResponse = body.response;

  const expectedChallenge = authChallengeDB.consume(username, 'register');
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Registration challenge expired; please try again' }, { status: 400 });
  }

  const { rpID, origin } = getWebAuthnConfig();
  const verification = await verifyRegistrationResponse({
    response: registrationResponse,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Passkey registration could not be verified' }, { status: 400 });
  }

  const session = await getSession();
  const user = db.transaction(() => {
    const existing = userDB.findByUsername(username);
    if (existing && session?.userId !== existing.id) return null;
    const account = existing ?? userDB.create(username);
    authenticatorDB.create(
      account.id,
      verification.registrationInfo!.credentialID,
      verification.registrationInfo!.credentialPublicKey,
      verification.registrationInfo!.counter ?? 0,
      registrationResponse.response.transports ?? [],
    );
    return account;
  })();
  if (!user) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });

  await createSession(user.id);
  return NextResponse.json({ success: true });
}
