import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUniqueTagNameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes('tags.user_id') &&
    error.message.includes('tags.name')
  );
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(tagDB.findAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    throw error;
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  const color = body.color ?? '#3B82F6';
  if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 });
  }
  try {
    return NextResponse.json(tagDB.create(session.userId, { name, color }), { status: 201 });
  } catch (error) {
    if (isUniqueTagNameError(error)) {
      return NextResponse.json(
        { error: 'A tag with this name already exists' },
        { status: 409 },
      );
    }
    throw error;
  }
}
