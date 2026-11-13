import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getSession }));

import { db } from '@/lib/db';
import { GET as listTodos, POST as createTodo } from '@/app/api/todos/route';
import {
  DELETE as deleteTodo,
  GET as getTodo,
  PUT as updateTodo,
} from '@/app/api/todos/[id]/route';

function request(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('todo API', () => {
  beforeEach(() => {
    db.exec('DELETE FROM todos; DELETE FROM users;');
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(1, 'alice');
    db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(2, 'bob');
    getSession.mockResolvedValue({ userId: 1 });
  });

  it('requires an authenticated session and scopes list results to that user', async () => {
    getSession.mockResolvedValue(null);
    const denied = await listTodos(request('/api/todos', 'GET'));
    expect(denied.status).toBe(401);
    expect(
      (
        await createTodo(
          request('/api/todos', 'POST', { title: 'Unauthenticated' }),
        )
      ).status,
    ).toBe(401);

    getSession.mockResolvedValue({ userId: 1 });
    db.prepare(
      'INSERT INTO todos (user_id, title) VALUES (?, ?), (?, ?)',
    ).run(1, 'Alice item', 2, 'Bob item');
    const response = await listTodos(request('/api/todos', 'GET'));
    expect(await response.json()).toMatchObject([{ title: 'Alice item', user_id: 1 }]);
  });

  it('creates validated todos and rejects invalid priority without writing', async () => {
    const created = await createTodo(
      request('/api/todos', 'POST', { title: '  Plan release  ' }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      title: 'Plan release',
      priority: 'medium',
      completed: false,
      due_date: null,
    });

    const invalid = await createTodo(
      request('/api/todos', 'POST', { title: 'Invalid', priority: 'urgent' }),
    );
    expect(invalid.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM todos').get()).toMatchObject({
      count: 1,
    });
  });

  it('rejects missing recurring due dates and tags owned by another user', async () => {
    const missingDueDate = await createTodo(
      request('/api/todos', 'POST', {
        title: 'Repeat',
        is_recurring: true,
        recurrence_pattern: 'daily',
      }),
    );
    expect(missingDueDate.status).toBe(400);

    const foreignTag = db.prepare(
      'INSERT INTO tags (user_id, name) VALUES (?, ?)',
    ).run(2, 'Private');
    const invalidTag = await createTodo(
      request('/api/todos', 'POST', {
        title: 'Tagged todo',
        tag_ids: [Number(foreignTag.lastInsertRowid)],
      }),
    );
    expect(invalidTag.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM todos').get()).toMatchObject({
      count: 0,
    });
  });

  it('hides another user’s todo and updates only fields in the request', async () => {
    const other = db.prepare(
      'INSERT INTO todos (user_id, title) VALUES (?, ?)',
    ).run(2, 'Private');
    const id = Number(other.lastInsertRowid);
    expect((await getTodo(request(`/api/todos/${id}`, 'GET'), { params: Promise.resolve({ id: String(id) }) })).status).toBe(404);
    expect((await updateTodo(request(`/api/todos/${id}`, 'PUT', { title: 'Changed' }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(404);
    expect((await deleteTodo(request(`/api/todos/${id}`, 'DELETE'), { params: Promise.resolve({ id: String(id) }) })).status).toBe(404);
    expect(db.prepare('SELECT title FROM todos WHERE id = ?').get(id)).toMatchObject({
      title: 'Private',
    });
  });

  it('cascades delete to subtasks and tag associations', async () => {
    const result = db.prepare(
      'INSERT INTO todos (user_id, title) VALUES (?, ?)',
    ).run(1, 'Parent');
    const todoId = Number(result.lastInsertRowid);
    const tag = db.prepare(
      'INSERT INTO tags (user_id, name) VALUES (?, ?)',
    ).run(1, 'Work');
    db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(
      todoId,
      Number(tag.lastInsertRowid),
    );
    db.prepare(
      'INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)',
    ).run(todoId, 'Child', 0);

    const response = await deleteTodo(
      request(`/api/todos/${todoId}`, 'DELETE'),
      { params: Promise.resolve({ id: String(todoId) }) },
    );
    expect(response.status).toBe(200);
    expect(
      (db.prepare('SELECT COUNT(*) AS count FROM subtasks WHERE todo_id = ?').get(todoId) as { count: number }).count,
    ).toBe(0);
    expect(
      (db.prepare('SELECT COUNT(*) AS count FROM todo_tags WHERE todo_id = ?').get(todoId) as { count: number }).count,
    ).toBe(0);
  });

  it('moves a due date only when valid and clears a sent reminder when timing changes', async () => {
    const created = await createTodo(
      request('/api/todos', 'POST', {
        title: 'Call client',
        due_date: '2030-01-02T10:00:00',
        reminder_minutes: 60,
      }),
    );
    const todo = await created.json();
    await updateTodo(
      request(`/api/todos/${todo.id}`, 'PUT', {
        last_notification_sent: '2030-01-02T08:00:00',
      }),
      { params: Promise.resolve({ id: String(todo.id) }) },
    );
    await updateTodo(
      request(`/api/todos/${todo.id}`, 'PUT', { reminder_minutes: 30 }),
      { params: Promise.resolve({ id: String(todo.id) }) },
    );
    const stored = db.prepare('SELECT * FROM todos WHERE id = ?').get(todo.id) as {
      reminder_minutes: number;
      last_notification_sent: string | null;
    };
    expect(stored).toMatchObject({ reminder_minutes: 30, last_notification_sent: null });
  });

  it('allows editing a todo while preserving or setting a past due date', async () => {
    const result = db.prepare(
      'INSERT INTO todos (user_id, title, due_date) VALUES (?, ?, ?)',
    ).run(1, 'Overdue task', '2020-01-02T08:00:00');
    const id = Number(result.lastInsertRowid);
    const params = { params: Promise.resolve({ id: String(id) }) };

    const updated = await updateTodo(
      request(`/api/todos/${id}`, 'PUT', {
        title: 'Updated overdue task',
        due_date: '2020-01-03T08:00:00',
      }),
      params,
    );

    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      todo: {
        title: 'Updated overdue task',
        due_date: '2020-01-03T08:00:00',
      },
    });
  });

  it('creates only one next occurrence on a recurring completion transition', async () => {
    const created = await createTodo(
      request('/api/todos', 'POST', {
        title: 'Pay rent',
        due_date: '2030-01-31T09:00:00',
        priority: 'high',
        is_recurring: true,
        recurrence_pattern: 'monthly',
        reminder_minutes: 60,
        tag_ids: [
          Number(
            db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(1, 'Bills')
              .lastInsertRowid,
          ),
        ],
      }),
    );
    const todo = await created.json();
    expect(created.status).toBe(201);
    const params = { params: Promise.resolve({ id: String(todo.id) }) };
    const completed = await updateTodo(
      request(`/api/todos/${todo.id}`, 'PUT', { completed: true }),
      params,
    );
    expect(await completed.json()).toMatchObject({
      todo: { completed: true },
      nextInstance: {
        title: 'Pay rent',
        due_date: '2030-02-28T09:00:00',
        is_recurring: true,
        priority: 'high',
        reminder_minutes: 60,
        tags: [{ name: 'Bills' }],
      },
    });
    await updateTodo(
      request(`/api/todos/${todo.id}`, 'PUT', { completed: true }),
      params,
    );
    expect(db.prepare('SELECT COUNT(*) AS count FROM todos').get()).toMatchObject({
      count: 2,
    });
  });
});
