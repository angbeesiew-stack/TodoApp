import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { authenticatorDB, authChallengeDB, userDB } from '@/lib/db';
import { getWebAuthnConfig, isUsername } from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const username = typeof body === 'object' && body !== null && 'username' in body
    ? body.username
    : null;
  if (!isUsername(username)) return NextResponse.json({ error: 'Enter a valid username' }, { status: 400 });

  const user = userDB.findByUsername(username);
  const authenticators = user ? authenticatorDB.findByUserId(user.id) : [];
  if (authenticators.length === 0) {
    return NextResponse.json({ error: 'No passkey found for that username' }, { status: 400 });
  }

  const { rpID } = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: authenticators.map(({ credential_id }) => ({ id: credential_id })),
    userVerification: 'preferred',
  });
  authChallengeDB.save(username, 'login', options.challenge);
  return NextResponse.json(options);
}
