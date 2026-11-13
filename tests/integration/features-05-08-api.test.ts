import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession }));

import { db, todoDB } from '@/lib/db';
import { POST as createSubtask } from '@/app/api/todos/[id]/subtasks/route';
import {
  DELETE as deleteSubtask,
  PUT as updateSubtask,
} from '@/app/api/subtasks/[id]/route';
import { GET as listTags, POST as createTag } from '@/app/api/tags/route';
import {
  DELETE as deleteTag,
  PUT as updateTag,
} from '@/app/api/tags/[id]/route';
import {
  DELETE as detachTag,
  POST as attachTag,
} from '@/app/api/todos/[id]/tags/route';
import {
  GET as listTemplates,
  POST as createTemplate,
} from '@/app/api/templates/route';
import {
  DELETE as deleteTemplate,
  PUT as updateTemplate,
} from '@/app/api/templates/[id]/route';
import { POST as useTemplate } from '@/app/api/templates/[id]/use/route';

function request(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function idParams(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('subtask API', () => {
  beforeEach(() => {
    db.exec('DELETE FROM todos; DELETE FROM templates; DELETE FROM tags; DELETE FROM users;');
    db.prepare('INSERT INTO users (id, username) VALUES (1, ?), (2, ?)').run('alice', 'bob');
    getSession.mockResolvedValue({ userId: 1 });
  });

  it('creates ordered subtasks, preserves position gaps, and hides other users’ subtasks', async () => {
    const todo = todoDB.create(1, { title: 'Parent' });
    const first = await createSubtask(
      request(`/api/todos/${todo.id}/subtasks`, 'POST', { title: ' First ' }),
      idParams(todo.id),
    );
    const second = await createSubtask(
      request(`/api/todos/${todo.id}/subtasks`, 'POST', { title: 'Second' }),
      idParams(todo.id),
    );
    const firstSubtask = await first.json();
    const secondSubtask = await second.json();
    expect(firstSubtask).toMatchObject({ title: 'First', position: 0 });
    expect(secondSubtask).toMatchObject({ title: 'Second', position: 1 });

    await deleteSubtask(request(`/api/subtasks/${firstSubtask.id}`, 'DELETE'), idParams(firstSubtask.id));
    const third = await createSubtask(
      request(`/api/todos/${todo.id}/subtasks`, 'POST', { title: 'Third' }),
      idParams(todo.id),
    );
    expect(await third.json()).toMatchObject({ position: 2 });
    expect((await todoDB.findById(todo.id, 1))?.subtasks?.map(({ position }) => position))
      .toEqual([1, 2]);

    const privateTodo = todoDB.create(2, { title: 'Private' });
    getSession.mockResolvedValue({ userId: 2 });
    const privateChild = await createSubtask(
      request(`/api/todos/${privateTodo.id}/subtasks`, 'POST', { title: 'Private child' }),
      idParams(privateTodo.id),
    );
    const privateSubtask = await privateChild.json();
    getSession.mockResolvedValue({ userId: 1 });
    expect((await updateSubtask(
      request(`/api/subtasks/${privateSubtask.id}`, 'PUT', { completed: true }),
      idParams(privateSubtask.id),
    )).status).toBe(404);
    expect((await deleteSubtask(
      request(`/api/subtasks/${privateSubtask.id}`, 'DELETE'),
      idParams(privateSubtask.id),
    )).status).toBe(404);
    expect(db.prepare('SELECT completed FROM subtasks WHERE id = ?').get(privateSubtask.id))
      .toMatchObject({ completed: 0 });
  });

  it('requires authentication and rejects blank subtask names', async () => {
    const todo = todoDB.create(1, { title: 'Parent' });
    getSession.mockResolvedValue(null);
    expect((await createSubtask(
      request(`/api/todos/${todo.id}/subtasks`, 'POST', { title: 'Child' }),
      idParams(todo.id),
    )).status).toBe(401);
    getSession.mockResolvedValue({ userId: 1 });
    expect((await createSubtask(
      request(`/api/todos/${todo.id}/subtasks`, 'POST', { title: '  ' }),
      idParams(todo.id),
    )).status).toBe(400);
  });
});

describe('tag API', () => {
  beforeEach(() => {
    db.exec('DELETE FROM todos; DELETE FROM templates; DELETE FROM tags; DELETE FROM users;');
    db.prepare('INSERT INTO users (id, username) VALUES (1, ?), (2, ?)').run('alice', 'bob');
    getSession.mockResolvedValue({ userId: 1 });
  });

  it('scopes tag CRUD, validates inputs, and manages todo links idempotently', async () => {
    const created = await createTag(request('/api/tags', 'POST', { name: ' Work ', color: '#123456' }));
    expect(created.status).toBe(201);
    const tag = await created.json();
    expect(tag).toMatchObject({ user_id: 1, name: 'Work', color: '#123456' });
    expect((await createTag(request('/api/tags', 'POST', { name: 'Work' }))).status).toBe(409);
    expect((await createTag(request('/api/tags', 'POST', { name: 'Bad', color: 'red' }))).status).toBe(400);

    getSession.mockResolvedValue({ userId: 2 });
    const sameName = await createTag(request('/api/tags', 'POST', { name: 'Work' }));
    expect(sameName.status).toBe(201);
    expect(await listTags()).toHaveProperty('status', 200);
    const privateUpdate = await updateTag(
      request(`/api/tags/${tag.id}`, 'PUT', { name: 'Stolen' }),
      idParams(tag.id),
    );
    expect(privateUpdate.status).toBe(404);
    getSession.mockResolvedValue({ userId: 1 });

    const todo = todoDB.create(1, { title: 'Tagged todo' });
    expect((await attachTag(
      request(`/api/todos/${todo.id}/tags`, 'POST', { tag_id: tag.id }),
      idParams(todo.id),
    )).status).toBe(200);
    await attachTag(request(`/api/todos/${todo.id}/tags`, 'POST', { tag_id: tag.id }), idParams(todo.id));
    expect(db.prepare('SELECT COUNT(*) AS count FROM todo_tags WHERE todo_id = ?').get(todo.id))
      .toMatchObject({ count: 1 });

    const updated = await updateTag(
      request(`/api/tags/${tag.id}`, 'PUT', { name: 'Office', color: '#654321' }),
      idParams(tag.id),
    );
    expect(await updated.json()).toMatchObject({ name: 'Office', color: '#654321' });
    expect((await detachTag(
      request(`/api/todos/${todo.id}/tags`, 'DELETE', { tag_id: tag.id }),
      idParams(todo.id),
    )).status).toBe(200);
    await detachTag(request(`/api/todos/${todo.id}/tags`, 'DELETE', { tag_id: tag.id }), idParams(todo.id));
    expect((await deleteTag(request(`/api/tags/${tag.id}`, 'DELETE'), idParams(tag.id))).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS count FROM todo_tags WHERE tag_id = ?').get(tag.id))
      .toMatchObject({ count: 0 });
  });
});

describe('template API', () => {
  beforeEach(() => {
    db.exec('DELETE FROM todos; DELETE FROM templates; DELETE FROM tags; DELETE FROM users;');
    db.prepare('INSERT INTO users (id, username) VALUES (1, ?), (2, ?)').run('alice', 'bob');
    getSession.mockResolvedValue({ userId: 1 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates, scopes, updates, uses, and deletes templates without changing created todos', async () => {
    const recurringWithoutOffset = await createTemplate(request('/api/templates', 'POST', {
      name: 'Invalid',
      title_template: 'Invalid todo',
      is_recurring: true,
      recurrence_pattern: 'daily',
    }));
    expect(recurringWithoutOffset.status).toBe(400);

    const created = await createTemplate(request('/api/templates', 'POST', {
      name: 'Weekly review',
      category: 'Work',
      title_template: 'Review sprint',
      priority: 'high',
      is_recurring: true,
      recurrence_pattern: 'weekly',
      reminder_minutes: 15,
      due_date_offset_minutes: 60,
      subtasks: [
        { title: 'Check metrics', position: 0 },
        { title: 'Write notes', position: 1 },
      ],
    }));
    expect(created.status).toBe(201);
    const template = await created.json();
    expect((await listTemplates()).status).toBe(200);

    getSession.mockResolvedValue({ userId: 2 });
    expect((await useTemplate(
      request(`/api/templates/${template.id}/use`, 'POST'),
      idParams(template.id),
    )).status).toBe(404);
    getSession.mockResolvedValue({ userId: 1 });

    const used = await useTemplate(
      request(`/api/templates/${template.id}/use`, 'POST'),
      idParams(template.id),
    );
    expect(used.status).toBe(201);
    const todo = await used.json();
    expect(todo).toMatchObject({
      title: 'Review sprint',
      priority: 'high',
      due_date: '2030-01-01T09:00:00',
      is_recurring: true,
      tags: [],
      subtasks: [
        { title: 'Check metrics', position: 0, completed: false },
        { title: 'Write notes', position: 1, completed: false },
      ],
    });

    const updated = await updateTemplate(
      request(`/api/templates/${template.id}`, 'PUT', { name: 'Retrospective' }),
      idParams(template.id),
    );
    expect(await updated.json()).toMatchObject({ name: 'Retrospective' });
    expect((await deleteTemplate(
      request(`/api/templates/${template.id}`, 'DELETE'),
      idParams(template.id),
    )).status).toBe(200);
    expect((await todoDB.findById(todo.id, 1))?.title).toBe('Review sprint');
  });
});
