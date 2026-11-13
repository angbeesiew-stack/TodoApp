import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB, type UpdateTagInput } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

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

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

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
  const update: UpdateTagInput = {};
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (Object.hasOwn(body, 'color')) {
    if (typeof body.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(body.color)) {
      return NextResponse.json({ error: 'Color must be a valid hex code' }, { status: 400 });
    }
    update.color = body.color;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No tag fields to update' }, { status: 400 });
  }
  try {
    const tag = tagDB.update(id, session.userId, update);
    if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    return NextResponse.json(tag);
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null || !tagDB.delete(id, session.userId)) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
