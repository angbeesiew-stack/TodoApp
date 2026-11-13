import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { authenticatorDB, authChallengeDB, userDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { getWebAuthnConfig, isUsername } from '@/lib/webauthn';

function isResponse(value: unknown): value is AuthenticationResponseJSON {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'response' in value && typeof value.response === 'object' && value.response !== null;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('username' in body) || !('response' in body)
    || !isUsername(body.username) || !isResponse(body.response)) {
    return NextResponse.json({ error: 'Invalid passkey response' }, { status: 400 });
  }

  const challenge = authChallengeDB.consume(body.username, 'login');
  const authenticator = authenticatorDB.findByCredentialId(body.response.id);
  const user = userDB.findByUsername(body.username);
  if (!challenge || !authenticator || !user || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: 'Passkey could not be verified' }, { status: 401 });
  }

  const { rpID, origin } = getWebAuthnConfig();
  const verification = await verifyAuthenticationResponse({
    response: body.response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: authenticator.credential_id,
      credentialPublicKey: authenticator.credential_public_key,
      counter: authenticator.counter ?? 0,
    },
  });
  if (!verification.verified) {
    return NextResponse.json({ error: 'Passkey could not be verified' }, { status: 401 });
  }

  authenticatorDB.updateCounter(authenticator.id, verification.authenticationInfo.newCounter ?? 0);
  await createSession(user.id);
  return NextResponse.json({ success: true });
}
