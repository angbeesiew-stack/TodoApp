import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, type UpdateSubtaskInput } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const allowedFields = new Set(['title', 'completed']);
  const unknownField = Object.keys(body).find((key) => !allowedFields.has(key));
  if (unknownField) {
    return NextResponse.json({ error: `Unknown field: ${unknownField}` }, { status: 400 });
  }

  const update: UpdateSubtaskInput = {};
  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Subtask title is required' }, { status: 400 });
    }
    update.title = body.title.trim();
  }
  if (Object.hasOwn(body, 'completed')) {
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'Invalid completed value' }, { status: 400 });
    }
    update.completed = body.completed;
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No subtask fields to update' }, { status: 400 });
  }

  const subtask = subtaskDB.update(id, session.userId, update);
  if (!subtask) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  return NextResponse.json(subtask);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null || !subtaskDB.delete(id, session.userId)) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
