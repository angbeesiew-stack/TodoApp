import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

async function readTagId(request: NextRequest): Promise<number | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const tagId = (body as Record<string, unknown>).tag_id;
    return typeof tagId === 'number' && Number.isSafeInteger(tagId) && tagId > 0 ? tagId : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const todoId = parseId((await context.params).id);
  const tagId = await readTagId(request);
  if (todoId === null || tagId === null) {
    return NextResponse.json({ error: 'Todo or tag not found' }, { status: 404 });
  }
  if (!tagDB.attachToTodo(todoId, tagId, session.userId)) {
    return NextResponse.json({ error: 'Todo or tag not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const todoId = parseId((await context.params).id);
  const tagId = await readTagId(request);
  if (todoId === null || tagId === null) {
    return NextResponse.json({ error: 'Todo or tag not found' }, { status: 404 });
  }
  if (!tagDB.detachFromTodo(todoId, tagId, session.userId)) {
    return NextResponse.json({ error: 'Todo or tag not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
