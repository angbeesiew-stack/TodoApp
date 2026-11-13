import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getSession }));

import { db } from '@/lib/db';
import { GET } from '@/app/api/notifications/check/route';
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

describe('GET /api/notifications/check', () => {
  beforeEach(() => {
    db.exec('DELETE FROM todos; DELETE FROM users;');
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(1, 'alice');
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(2, 'bob');
    getSession.mockResolvedValue({ userId: 1 });
  });

  it('requires authentication and returns only eligible reminders for the session user', async () => {
    const now = getSingaporeNow();
    const dueWithinWindow = new Date(now.getTime() + 10 * 60_000);
    const dueLater = new Date(now.getTime() + 2 * 60 * 60_000);
    const duePastWindow = new Date(now.getTime() - 10 * 60_000);
    const toSqlDate = (date: Date) => formatSingaporeDate(date, 'yyyy-MM-dd HH:mm:ss');
    const insert = db.prepare(`
      INSERT INTO todos (user_id, title, due_date, reminder_minutes, last_notification_sent)
      VALUES (?, ?, ?, ?, ?)
    `);
    insert.run(1, 'Ready', toSqlDate(dueWithinWindow), 60, null);
    insert.run(1, 'Not yet', toSqlDate(dueLater), 60, null);
    insert.run(1, 'Already sent', toSqlDate(dueWithinWindow), 60, toSqlDate(now));
    insert.run(2, 'Other user', toSqlDate(dueWithinWindow), 60, null);
    insert.run(1, 'No reminder', toSqlDate(dueWithinWindow), null, null);

    getSession.mockResolvedValueOnce(null);
    const denied = await GET();
    expect(denied.status).toBe(401);

    const response = await GET();
    expect(await response.json()).toMatchObject({
      success: true,
      data: [{ title: 'Ready' }],
    });

    insert.run(1, 'Expired', toSqlDate(duePastWindow), 15, null);
    const afterExpiry = await GET();
    const result = await afterExpiry.json();
    expect(result.data.map((todo: { title: string }) => todo.title)).not.toContain('Expired');
  });
});
