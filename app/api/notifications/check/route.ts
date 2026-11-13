import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { isReminderDue } from '@/lib/reminders';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNow();
  const data = todoDB
    .findAllByUser(session.userId)
    .filter(
      (todo) =>
        !todo.completed &&
        todo.due_date !== null &&
        todo.reminder_minutes !== null &&
        todo.last_notification_sent === null &&
        isReminderDue(todo.due_date, todo.reminder_minutes, now),
    );
  return NextResponse.json({ success: true, data });
}
