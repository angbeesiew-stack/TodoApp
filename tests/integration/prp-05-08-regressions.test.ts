import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession }));

import { db, todoDB } from '@/lib/db';
import { PUT as updateTodo } from '@/app/api/todos/[id]/route';
import { POST as createTemplate } from '@/app/api/templates/route';
import { PUT as updateTemplate } from '@/app/api/templates/[id]/route';
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

describe('PRP 05–08 API/database regressions', () => {
  beforeEach(() => {
    db.exec('DELETE FROM todos; DELETE FROM templates; DELETE FROM tags; DELETE FROM users;');
    db.prepare('INSERT INTO users (id, username) VALUES (1, ?), (2, ?)').run('alice', 'bob');
    getSession.mockResolvedValue({ userId: 1 });
  });

  it('keeps a todo and its original tags unchanged when a reassignment includes a foreign tag', async () => {
    const ownTagId = Number(
      db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(1, 'Work').lastInsertRowid,
    );
    const foreignTagId = Number(
      db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(2, 'Private').lastInsertRowid,
    );
    const todo = todoDB.create(1, { title: 'Original title', tag_ids: [ownTagId] });

    const response = await updateTodo(
      request(`/api/todos/${todo.id}`, 'PUT', {
        title: 'Must not be applied',
        tag_ids: [ownTagId, foreignTagId],
      }),
      idParams(todo.id),
    );

    expect(response.status).toBe(400);
    expect(await todoDB.findById(todo.id, 1)).toMatchObject({
      title: 'Original title',
      tags: [{ id: ownTagId, name: 'Work' }],
    });
  });

  it('keeps each todo created from a template independent of later template edits', async () => {
    const created = await createTemplate(request('/api/templates', 'POST', {
      name: 'Onboarding',
      title_template: 'Onboard client',
      subtasks: [{ title: 'Send welcome pack', position: 0 }],
    }));
    const template = await created.json();

    const firstUse = await useTemplate(
      request(`/api/templates/${template.id}/use`, 'POST'),
      idParams(template.id),
    );
    const firstTodo = await firstUse.json();

    const edited = await updateTemplate(
      request(`/api/templates/${template.id}`, 'PUT', {
        title_template: 'Onboard new client',
        subtasks: [{ title: 'Schedule kickoff', position: 0 }],
      }),
      idParams(template.id),
    );
    expect(edited.status).toBe(200);

    const secondUse = await useTemplate(
      request(`/api/templates/${template.id}/use`, 'POST'),
      idParams(template.id),
    );
    const secondTodo = await secondUse.json();

    expect(firstTodo).toMatchObject({
      title: 'Onboard client',
      subtasks: [{ title: 'Send welcome pack', position: 0 }],
    });
    expect(secondTodo).toMatchObject({
      title: 'Onboard new client',
      subtasks: [{ title: 'Schedule kickoff', position: 0 }],
    });
    expect(secondTodo.id).not.toBe(firstTodo.id);
  });

  it('rolls back the todo and earlier subtasks when template subtask recreation fails', async () => {
    const created = await createTemplate(request('/api/templates', 'POST', {
      name: 'Atomic template',
      title_template: 'Must not persist',
      subtasks: [
        { title: 'First child', position: 0 },
        { title: 'Failing child', position: 1 },
      ],
    }));
    const template = await created.json();

    db.exec(`
      CREATE TEMP TRIGGER fail_template_subtask_insert
      BEFORE INSERT ON subtasks
      WHEN NEW.title = 'Failing child'
      BEGIN
        SELECT RAISE(ABORT, 'forced subtask failure');
      END;
    `);

    try {
      await expect(
        useTemplate(
          request(`/api/templates/${template.id}/use`, 'POST'),
          idParams(template.id),
        ),
      ).rejects.toThrow('forced subtask failure');

      expect(db.prepare('SELECT COUNT(*) AS count FROM todos').get()).toMatchObject({ count: 0 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM subtasks').get()).toMatchObject({ count: 0 });
    } finally {
      db.exec('DROP TRIGGER IF EXISTS fail_template_subtask_insert;');
    }
  });
});
