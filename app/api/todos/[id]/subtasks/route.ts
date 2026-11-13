import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todoId = parseId((await context.params).id);
  if (todoId === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    throw error;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }
  const title = (body as Record<string, unknown>).title;
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 });
  }

  const subtask = subtaskDB.create(todoId, session.userId, { title: title.trim() });
  if (!subtask) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(subtask, { status: 201 });
}
