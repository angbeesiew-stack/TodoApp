import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db, tagDB, todoDB, type UpdateTodoInput } from '@/lib/db';
import { calculateNextDueDate, RECURRENCE_PATTERNS } from '@/lib/recurrence';
import { validateReminderMinutes } from '@/lib/reminders';
import {
  validateDueDate,
  validateUpdatePriority,
} from '@/lib/todos';
import { normalizeSingaporeDateTime } from '@/lib/timezone';
import { ValidationError } from '@/lib/validation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  if (!/^[1-9]\d*$/.test(id)) return null;
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateOwnedTags(userId: number, tagIds: number[]): void {
  const uniqueIds = [...new Set(tagIds)];
  if (uniqueIds.length === 0) return;
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const result = db.prepare(`
    SELECT COUNT(*) AS count FROM tags
    WHERE user_id = ? AND id IN (${placeholders})
  `).get(userId, ...uniqueIds) as { count: number };
  if (result.count !== uniqueIds.length) {
    throw new ValidationError('One or more tags were not found');
  }
}

function validateUpdateInput(
  value: unknown,
  current: NonNullable<ReturnType<typeof todoDB.findById>>,
): UpdateTodoInput {
  if (!isRecord(value)) throw new ValidationError('Request body must be an object');
  const allowed = new Set([
    'title',
    'due_date',
    'priority',
    'completed',
    'is_recurring',
    'recurrence_pattern',
    'reminder_minutes',
    'last_notification_sent',
    'tag_ids',
  ]);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) throw new ValidationError(`Unknown field: ${unknownKey}`);

  const input: UpdateTodoInput = {};
  if (Object.hasOwn(value, 'title')) {
    if (typeof value.title !== 'string' || value.title.trim() === '') {
      throw new ValidationError('Title cannot be empty');
    }
    input.title = value.title.trim();
  }
  if (Object.hasOwn(value, 'due_date')) {
    input.due_date = validateDueDate(value.due_date, new Date(), false);
  }
  if (Object.hasOwn(value, 'priority')) {
    input.priority = validateUpdatePriority(value.priority);
  }
  if (Object.hasOwn(value, 'completed')) {
    if (typeof value.completed !== 'boolean') {
      throw new ValidationError('Invalid completed value');
    }
    input.completed = value.completed;
  }
  if (Object.hasOwn(value, 'is_recurring')) {
    if (typeof value.is_recurring !== 'boolean') {
      throw new ValidationError('Invalid recurrence setting');
    }
    input.is_recurring = value.is_recurring;
  }
  if (Object.hasOwn(value, 'recurrence_pattern')) {
    const pattern = value.recurrence_pattern;
    if (
      pattern !== null &&
      (typeof pattern !== 'string' ||
        !RECURRENCE_PATTERNS.includes(pattern as (typeof RECURRENCE_PATTERNS)[number]))
    ) {
      throw new ValidationError('Invalid recurrence pattern');
    }
    input.recurrence_pattern = pattern as UpdateTodoInput['recurrence_pattern'];
  }
  if (Object.hasOwn(value, 'reminder_minutes')) {
    input.reminder_minutes = validateReminderMinutes(value.reminder_minutes);
  }
  if (Object.hasOwn(value, 'last_notification_sent')) {
    if (value.last_notification_sent === null) {
      input.last_notification_sent = null;
    } else if (
      typeof value.last_notification_sent === 'string' &&
      normalizeSingaporeDateTime(value.last_notification_sent)
    ) {
      input.last_notification_sent = normalizeSingaporeDateTime(value.last_notification_sent);
    } else {
      throw new ValidationError('Invalid notification timestamp');
    }
  }
  if (Object.hasOwn(value, 'tag_ids')) {
    if (
      !Array.isArray(value.tag_ids) ||
      !value.tag_ids.every(
        (id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
      )
    ) {
      throw new ValidationError('Invalid tag ids');
    }
    input.tag_ids = value.tag_ids as number[];
  }

  const isRecurring = input.is_recurring ?? current.is_recurring;
  const dueDate = Object.hasOwn(input, 'due_date') ? input.due_date : current.due_date;
  const pattern = Object.hasOwn(input, 'recurrence_pattern')
    ? input.recurrence_pattern
    : current.recurrence_pattern;
  if (isRecurring && !dueDate) {
    throw new ValidationError('Recurring todos require a due date');
  }
  if (isRecurring && !pattern) throw new ValidationError('Invalid recurrence pattern');
  if (!isRecurring) input.recurrence_pattern = null;

  const reminderMinutes = Object.hasOwn(input, 'reminder_minutes')
    ? input.reminder_minutes
    : current.reminder_minutes;
  if (reminderMinutes !== null && !dueDate) {
    throw new ValidationError('Reminders require a due date');
  }

  return input;
}

async function getOwnedTodo(id: number, userId: number) {
  return todoDB.findById(id, userId);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  const todo = await getOwnedTodo(id, session.userId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  return NextResponse.json(todo);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  const current = await getOwnedTodo(id, session.userId);
  if (!current) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    throw error;
  }

  try {
    const input = validateUpdateInput(body, current);
    if (input.tag_ids) validateOwnedTags(session.userId, input.tag_ids);
    const result = db.transaction(() => {
      const existing = todoDB.findById(id, session.userId);
      if (!existing) return null;
      const updated = todoDB.update(id, session.userId, input);
      if (!updated) return null;

      const completingNow =
        input.completed === true &&
        !existing.completed &&
        existing.is_recurring &&
        existing.recurrence_pattern !== null &&
        existing.due_date !== null;
      if (!completingNow) return { todo: updated };

      const dueDate = existing.due_date;
      const recurrencePattern = existing.recurrence_pattern;
      if (!dueDate || !recurrencePattern) return { todo: updated };
      const nextInstance = todoDB.insertForRecurrence(session.userId, {
        title: existing.title,
        due_date: calculateNextDueDate(dueDate, recurrencePattern),
        priority: existing.priority,
        is_recurring: true,
        recurrence_pattern: recurrencePattern,
        reminder_minutes: existing.reminder_minutes,
        tag_ids: tagDB.getTagIdsForTodo(existing.id, session.userId),
      });
      return { todo: updated, nextInstance };
    })();

    if (!result) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  if (!todoDB.delete(id, session.userId)) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
