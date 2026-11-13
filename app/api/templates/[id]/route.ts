import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  templateDB,
  type CreateTemplateInput,
  type Template,
  type TemplateSubtask,
  type UpdateTemplateInput,
} from '@/lib/db';
import { RECURRENCE_PATTERNS } from '@/lib/recurrence';
import { validateReminderMinutes } from '@/lib/reminders';
import { validateCreatePriority } from '@/lib/todos';
import { ValidationError } from '@/lib/validation';

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

function validateUpdateInput(value: unknown, current: Template): UpdateTemplateInput {
  if (!isRecord(value)) throw new ValidationError('Request body must be an object');
  const allowed = new Set([
    'name',
    'description',
    'category',
    'title_template',
    'priority',
    'is_recurring',
    'recurrence_pattern',
    'reminder_minutes',
    'due_date_offset_minutes',
    'subtasks',
  ]);
  const unknownField = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownField) throw new ValidationError(`Unknown field: ${unknownField}`);

  const input: UpdateTemplateInput = {};
  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || !value.name.trim()) {
      throw new ValidationError('Template name is required');
    }
    input.name = value.name.trim();
  }
  for (const field of ['description', 'category'] as const) {
    if (!Object.hasOwn(value, field)) continue;
    if (value[field] !== null && typeof value[field] !== 'string') {
      throw new ValidationError(`Invalid ${field}`);
    }
    input[field] = typeof value[field] === 'string' ? value[field].trim() : null;
  }
  if (Object.hasOwn(value, 'title_template')) {
    if (typeof value.title_template !== 'string' || !value.title_template.trim()) {
      throw new ValidationError('Todo title is required');
    }
    input.title_template = value.title_template.trim();
  }
  if (Object.hasOwn(value, 'priority')) {
    input.priority = validateCreatePriority(value.priority);
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
    input.recurrence_pattern = pattern as CreateTemplateInput['recurrence_pattern'];
  }
  if (Object.hasOwn(value, 'reminder_minutes')) {
    input.reminder_minutes = validateReminderMinutes(value.reminder_minutes);
  }
  if (Object.hasOwn(value, 'due_date_offset_minutes')) {
    const offset = value.due_date_offset_minutes;
    if (offset !== null && (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0)) {
      throw new ValidationError('Due date offset must be a non-negative integer');
    }
    input.due_date_offset_minutes = offset as number | null;
  }
  if (Object.hasOwn(value, 'subtasks')) {
    if (!Array.isArray(value.subtasks)) throw new ValidationError('Invalid subtasks');
    input.subtasks = value.subtasks.map((item, index) => {
      if (!isRecord(item) || typeof item.title !== 'string' || !item.title.trim()) {
        throw new ValidationError('Subtask titles are required');
      }
      return { title: item.title.trim(), position: index } satisfies TemplateSubtask;
    });
  }

  const isRecurring = input.is_recurring ?? current.is_recurring;
  const recurrencePattern = Object.hasOwn(input, 'recurrence_pattern')
    ? input.recurrence_pattern
    : current.recurrence_pattern;
  const dueOffset = Object.hasOwn(input, 'due_date_offset_minutes')
    ? input.due_date_offset_minutes
    : current.due_date_offset_minutes;
  const reminderMinutes = Object.hasOwn(input, 'reminder_minutes')
    ? input.reminder_minutes
    : current.reminder_minutes;
  if (isRecurring && (!recurrencePattern || dueOffset == null)) {
    throw new ValidationError('Recurring templates require a recurrence pattern and due date offset');
  }
  if (reminderMinutes != null && dueOffset == null) {
    throw new ValidationError('Templates with reminders require a due date offset');
  }
  if (input.is_recurring === false) input.recurrence_pattern = null;
  return input;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const current = templateDB.findById(id, session.userId);
  if (!current) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

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
    const updated = templateDB.update(
      id,
      session.userId,
      validateUpdateInput(body, current),
    );
    if (!updated) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null || !templateDB.delete(id, session.userId)) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
