import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db, todoDB, type CreateTodoInput } from '@/lib/db';
import { RECURRENCE_PATTERNS } from '@/lib/recurrence';
import { validateReminderMinutes } from '@/lib/reminders';
import {
  validateCreatePriority,
  validateDueDate,
  sortTodos,
  type Priority,
} from '@/lib/todos';
import { ValidationError } from '@/lib/validation';

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

function validateCreateInput(value: unknown): CreateTodoInput {
  if (!isRecord(value)) throw new ValidationError('Request body must be an object');
  if (typeof value.title !== 'string' || value.title.trim().length === 0) {
    throw new ValidationError('Title is required');
  }

  const dueDate = validateDueDate(value.due_date);
  const priority: Priority = validateCreatePriority(value.priority);
  const isRecurring = value.is_recurring ?? false;
  if (typeof isRecurring !== 'boolean') {
    throw new ValidationError('Invalid recurrence setting');
  }
  const recurrencePattern = value.recurrence_pattern ?? null;
  if (
    recurrencePattern !== null &&
    (typeof recurrencePattern !== 'string' ||
      !RECURRENCE_PATTERNS.includes(recurrencePattern as (typeof RECURRENCE_PATTERNS)[number]))
  ) {
    throw new ValidationError('Invalid recurrence pattern');
  }
  if (isRecurring && !dueDate) {
    throw new ValidationError('Recurring todos require a due date');
  }
  if (isRecurring && recurrencePattern === null) {
    throw new ValidationError('Invalid recurrence pattern');
  }

  const reminderMinutes = validateReminderMinutes(value.reminder_minutes);
  if (reminderMinutes !== null && !dueDate) {
    throw new ValidationError('Reminders require a due date');
  }
  const tagIds = value.tag_ids ?? [];
  if (
    !Array.isArray(tagIds) ||
    !tagIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
  ) {
    throw new ValidationError('Invalid tag ids');
  }

  return {
    title: value.title.trim(),
    due_date: dueDate,
    priority,
    is_recurring: isRecurring,
    recurrence_pattern: isRecurring
      ? (recurrencePattern as CreateTodoInput['recurrence_pattern'])
      : null,
    reminder_minutes: reminderMinutes,
    tag_ids: tagIds as number[],
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const priorityParam = new URL(request.url).searchParams.get('priority');
  if (
    priorityParam &&
    !['high', 'medium', 'low'].includes(priorityParam)
  ) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
  }

  let todos = sortTodos(todoDB.findAllByUser(session.userId));
  if (priorityParam) {
    todos = todos.filter((todo) => todo.priority === priorityParam);
  }
  return NextResponse.json(todos);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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
    const input = validateCreateInput(body);
    validateOwnedTags(session.userId, input.tag_ids ?? []);
    const todo = todoDB.create(session.userId, input);
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
