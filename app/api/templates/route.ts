import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  templateDB,
  type CreateTemplateInput,
  type TemplateSubtask,
} from '@/lib/db';
import { RECURRENCE_PATTERNS } from '@/lib/recurrence';
import { validateReminderMinutes } from '@/lib/reminders';
import { validateCreatePriority } from '@/lib/todos';
import { ValidationError } from '@/lib/validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CREATE_FIELDS = new Set([
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

function validateCreateInput(value: unknown): CreateTemplateInput {
  if (!isRecord(value)) throw new ValidationError('Request body must be an object');
  const unknownField = Object.keys(value).find((key) => !CREATE_FIELDS.has(key));
  if (unknownField) throw new ValidationError(`Unknown field: ${unknownField}`);
  if (typeof value.name !== 'string' || !value.name.trim()) {
    throw new ValidationError('Template name is required');
  }
  if (typeof value.title_template !== 'string' || !value.title_template.trim()) {
    throw new ValidationError('Todo title is required');
  }

  for (const field of ['description', 'category'] as const) {
    if (value[field] !== undefined && value[field] !== null && typeof value[field] !== 'string') {
      throw new ValidationError(`Invalid ${field}`);
    }
  }
  const isRecurring = value.is_recurring ?? false;
  if (typeof isRecurring !== 'boolean') throw new ValidationError('Invalid recurrence setting');
  const recurrencePattern = value.recurrence_pattern ?? null;
  if (
    recurrencePattern !== null &&
    (typeof recurrencePattern !== 'string' ||
      !RECURRENCE_PATTERNS.includes(
        recurrencePattern as (typeof RECURRENCE_PATTERNS)[number],
      ))
  ) {
    throw new ValidationError('Invalid recurrence pattern');
  }
  const dueOffset = value.due_date_offset_minutes ?? null;
  if (
    dueOffset !== null &&
    (typeof dueOffset !== 'number' || !Number.isSafeInteger(dueOffset) || dueOffset < 0)
  ) {
    throw new ValidationError('Due date offset must be a non-negative integer');
  }
  if (isRecurring && (!recurrencePattern || dueOffset === null)) {
    throw new ValidationError('Recurring templates require a recurrence pattern and due date offset');
  }
  const reminderMinutes = validateReminderMinutes(value.reminder_minutes);
  if (reminderMinutes !== null && dueOffset === null) {
    throw new ValidationError('Templates with reminders require a due date offset');
  }

  let subtasks: TemplateSubtask[] | undefined;
  if (value.subtasks !== undefined) {
    if (!Array.isArray(value.subtasks)) throw new ValidationError('Invalid subtasks');
    subtasks = value.subtasks.map((item, index) => {
      if (!isRecord(item) || typeof item.title !== 'string' || !item.title.trim()) {
        throw new ValidationError('Subtask titles are required');
      }
      return { title: item.title.trim(), position: index };
    });
  }

  return {
    name: value.name.trim(),
    description: typeof value.description === 'string' ? value.description.trim() : null,
    category: typeof value.category === 'string' ? value.category.trim() : null,
    title_template: value.title_template.trim(),
    priority: validateCreatePriority(value.priority),
    is_recurring: isRecurring,
    recurrence_pattern: isRecurring
      ? recurrencePattern as CreateTemplateInput['recurrence_pattern']
      : null,
    reminder_minutes: reminderMinutes,
    due_date_offset_minutes: dueOffset,
    subtasks,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json(templateDB.findAllByUser(session.userId));
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
  try {
    return NextResponse.json(
      templateDB.create(session.userId, validateCreateInput(body)),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
