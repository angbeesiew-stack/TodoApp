import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { userDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  const user = session ? userDB.findById(session.userId) : null;
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ id: user.id, username: user.username });
}
