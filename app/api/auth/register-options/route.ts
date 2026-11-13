import { generateRegistrationOptions } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { authenticatorDB, authChallengeDB, userDB } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getWebAuthnConfig, isUsername } from '@/lib/webauthn';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const username = typeof body === 'object' && body !== null && 'username' in body
    ? body.username
    : null;
  if (!isUsername(username)) {
    return NextResponse.json({ error: 'Username must be 3–32 letters, numbers, dots, underscores, or hyphens' }, { status: 400 });
  }

  const user = userDB.findByUsername(username);
  const session = await getSession();
  if (user && session?.userId !== user.id) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }
  const authenticators = user ? authenticatorDB.findByUserId(user.id) : [];
  const { rpID, rpName } = getWebAuthnConfig();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(String(user?.id ?? username)),
    userName: username,
    attestationType: 'none',
    excludeCredentials: authenticators.map(({ credential_id }) => ({ id: credential_id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  authChallengeDB.save(username, 'register', options.challenge);
  return NextResponse.json(options);
}
