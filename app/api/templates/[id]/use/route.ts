import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db, subtaskDB, templateDB, todoDB, type CreateTodoInput } from '@/lib/db';
import { addMinutesToSingaporeDate, parseTemplateSubtasks } from '@/lib/templates';
import { getSingaporeNow } from '@/lib/timezone';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = parseId((await context.params).id);
  if (id === null) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const template = templateDB.findById(id, session.userId);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const dueDate = template.due_date_offset_minutes === null
    ? null
    : addMinutesToSingaporeDate(getSingaporeNow(), template.due_date_offset_minutes);
  const input: CreateTodoInput = {
    title: template.title_template,
    due_date: dueDate,
    priority: template.priority,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  };
  const created = db.transaction(() => {
    const todo = todoDB.create(session.userId, input);
    for (const subtask of parseTemplateSubtasks(template.subtasks_json)) {
      const saved = subtaskDB.create(todo.id, session.userId, subtask);
      if (!saved) throw new Error('Could not create subtask from template');
    }
    const result = todoDB.findById(todo.id, session.userId);
    if (!result) throw new Error('Created todo could not be loaded');
    return result;
  })();
  return NextResponse.json(created, { status: 201 });
}
