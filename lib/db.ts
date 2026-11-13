import Database from 'better-sqlite3';
import path from 'node:path';
import type { ReminderMinutes } from '@/lib/reminders';
import type { RecurrencePattern } from '@/lib/recurrence';
import type { Priority } from '@/lib/todos';
import { formatSingaporeDate, getSingaporeNow } from '@/lib/timezone';

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface CreateSubtaskInput {
  title: string;
  position?: number;
}

export interface UpdateSubtaskInput {
  title?: string;
  completed?: boolean;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export interface TemplateSubtask {
  title: string;
  position: number;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: ReminderMinutes | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  category?: string | null;
  title_template: string;
  priority: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: ReminderMinutes | null;
  due_date_offset_minutes?: number | null;
  subtasks?: TemplateSubtask[];
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

interface TemplateRow extends Omit<Template, 'is_recurring'> {
  is_recurring: number;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: ReminderMinutes | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
  subtasks?: Subtask[];
  tags?: Tag[];
}

export interface CreateTodoInput {
  title: string;
  due_date?: string | null;
  priority?: Priority;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: ReminderMinutes | null;
  tag_ids?: number[];
}

export type UpdateTodoInput = Partial<CreateTodoInput> & {
  completed?: boolean;
  last_notification_sent?: string | null;
};

interface TodoRow extends Omit<Todo, 'completed' | 'is_recurring'> {
  completed: number;
  is_recurring: number;
}

const dbPath = process.env.TODO_DB_PATH ?? path.join(process.cwd(), 'todos.db');
export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    credential_public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
  CREATE TABLE IF NOT EXISTS auth_challenges (
    username TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('register', 'login')),
    challenge TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (username, mode)
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1)),
    recurrence_pattern TEXT CHECK (
      recurrence_pattern IS NULL OR recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')
    ),
    reminder_minutes INTEGER CHECK (
      reminder_minutes IS NULL OR reminder_minutes IN (15, 30, 60, 120, 1440, 2880, 10080)
    ),
    last_notification_sent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    title_template TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1)),
    recurrence_pattern TEXT CHECK (
      recurrence_pattern IS NULL OR recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')
    ),
    reminder_minutes INTEGER CHECK (
      reminder_minutes IS NULL OR reminder_minutes IN (15, 30, 60, 120, 1440, 2880, 10080)
    ),
    due_date_offset_minutes INTEGER,
    subtasks_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
`);

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('subtasks', 'created_at', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('tags', 'created_at', "TEXT NOT NULL DEFAULT ''");
db.exec(`
  UPDATE subtasks SET created_at = datetime('now') WHERE created_at = '';
  UPDATE tags SET created_at = datetime('now') WHERE created_at = '';
`);

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface AuthenticatorRecord {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  transports: string | null;
}

export const userDB = {
  findByUsername(username: string): User | null {
    return (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined) ?? null;
  },
  findById(id: number): User | null {
    return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
  },
  create(username: string): User {
    const result = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
    const user = userDB.findById(Number(result.lastInsertRowid));
    if (!user) throw new Error('Created user could not be loaded');
    return user;
  },
};

export const authenticatorDB = {
  findByUserId(userId: number): AuthenticatorRecord[] {
    return db.prepare('SELECT * FROM authenticators WHERE user_id = ?').all(userId) as AuthenticatorRecord[];
  },
  findByCredentialId(credentialId: string): AuthenticatorRecord | null {
    return (db.prepare('SELECT * FROM authenticators WHERE credential_id = ?').get(credentialId) as AuthenticatorRecord | undefined) ?? null;
  },
  create(userId: number, credentialId: string, publicKey: Uint8Array, counter: number, transports: string[]): void {
    db.prepare(`
      INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter, transports)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, credentialId, Buffer.from(publicKey), counter ?? 0, JSON.stringify(transports));
  },
  updateCounter(id: number, counter: number): void {
    db.prepare('UPDATE authenticators SET counter = ? WHERE id = ?').run(counter ?? 0, id);
  },
};

export const authChallengeDB = {
  save(username: string, mode: 'register' | 'login', challenge: string): void {
    db.prepare(`
      INSERT INTO auth_challenges (username, mode, challenge, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username, mode) DO UPDATE SET
        challenge = excluded.challenge,
        expires_at = excluded.expires_at
    `).run(username, mode, challenge, new Date(Date.now() + 5 * 60_000).toISOString());
  },
  consume(username: string, mode: 'register' | 'login'): string | null {
    return db.transaction(() => {
      const challenge = db.prepare(`
        SELECT challenge, expires_at FROM auth_challenges WHERE username = ? AND mode = ?
      `).get(username, mode) as { challenge: string; expires_at: string } | undefined;
      db.prepare('DELETE FROM auth_challenges WHERE username = ? AND mode = ?').run(username, mode);
      if (!challenge || Date.parse(challenge.expires_at) <= Date.now()) return null;
      return challenge.challenge;
    })();
  },
};

function mapTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed: Boolean(row.completed),
    is_recurring: Boolean(row.is_recurring),
  };
}

function tagsForTodo(todoId: number, userId: number): Tag[] {
  return db.prepare(`
    SELECT tags.id, tags.user_id, tags.name, tags.color, tags.created_at
    FROM tags
    INNER JOIN todo_tags ON todo_tags.tag_id = tags.id
    WHERE todo_tags.todo_id = ? AND tags.user_id = ?
    ORDER BY tags.name COLLATE NOCASE
  `).all(todoId, userId) as Tag[];
}

function subtasksForTodo(todoId: number): Subtask[] {
  const rows = db.prepare(`
    SELECT id, todo_id, title, completed, position, created_at
    FROM subtasks WHERE todo_id = ? ORDER BY position, id
  `).all(todoId) as Array<Omit<Subtask, 'completed'> & { completed: number }>;
  return rows.map((row) => ({ ...row, completed: Boolean(row.completed) }));
}

function hydrate(row: TodoRow | undefined, userId: number): Todo | null {
  if (!row) return null;
  const todo = mapTodo(row);
  todo.tags = tagsForTodo(todo.id, userId);
  todo.subtasks = subtasksForTodo(todo.id);
  return todo;
}

function insertTodo(userId: number, input: CreateTodoInput): Todo {
  const result = db.prepare(`
    INSERT INTO todos (
      user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    input.title,
    input.due_date ?? null,
    input.priority ?? 'medium',
    input.is_recurring ? 1 : 0,
    input.is_recurring ? input.recurrence_pattern ?? null : null,
    input.reminder_minutes ?? null,
  );
  const id = Number(result.lastInsertRowid);
  if (input.tag_ids?.length) tagDB.setTodoTags(id, userId, input.tag_ids);
  const created = todoDB.findById(id, userId);
  if (!created) throw new Error('Created todo could not be reloaded');
  return created;
}

export const todoDB = {
  create(userId: number, input: CreateTodoInput): Todo {
    return db.transaction(() => insertTodo(userId, input))();
  },

  findAllByUser(userId: number): Todo[] {
    const rows = db.prepare(`
      SELECT * FROM todos WHERE user_id = ?
    `).all(userId) as TodoRow[];
    return rows.map((row) => hydrate(row, userId)).filter((todo): todo is Todo => todo !== null);
  },

  findById(id: number, userId: number): Todo | null {
    const row = db.prepare(`
      SELECT * FROM todos WHERE id = ? AND user_id = ?
    `).get(id, userId) as TodoRow | undefined;
    return hydrate(row, userId);
  },

  update(id: number, userId: number, input: UpdateTodoInput): Todo | null {
    const existing = todoDB.findById(id, userId);
    if (!existing) return null;

    const fields: Array<[keyof UpdateTodoInput, string, unknown]> = [
      ['title', 'title', input.title],
      ['due_date', 'due_date', input.due_date],
      ['priority', 'priority', input.priority],
      ['is_recurring', 'is_recurring', input.is_recurring],
      ['recurrence_pattern', 'recurrence_pattern', input.recurrence_pattern],
      ['reminder_minutes', 'reminder_minutes', input.reminder_minutes],
      ['last_notification_sent', 'last_notification_sent', input.last_notification_sent],
      ['completed', 'completed', input.completed],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [key, column, value] of fields) {
      if (Object.hasOwn(input, key)) {
        assignments.push(`${column} = ?`);
        values.push(
          key === 'completed' || key === 'is_recurring'
            ? value
              ? 1
              : 0
            : value,
        );
      }
    }

    const dueDateChanged =
      Object.hasOwn(input, 'due_date') && input.due_date !== existing.due_date;
    const reminderChanged =
      Object.hasOwn(input, 'reminder_minutes') &&
      input.reminder_minutes !== existing.reminder_minutes;
    if (dueDateChanged || reminderChanged) {
      assignments.push('last_notification_sent = NULL');
    }
    if (Object.hasOwn(input, 'completed')) {
      assignments.push('updated_at = ?');
      values.push(formatSingaporeDate(getSingaporeNow(), "yyyy-MM-dd'T'HH:mm:ss"));
    }
    if (assignments.length === 0 && !Object.hasOwn(input, 'tag_ids')) return existing;
    if (assignments.length === 0 && Object.hasOwn(input, 'tag_ids')) {
      tagDB.setTodoTags(id, userId, input.tag_ids ?? []);
      return todoDB.findById(id, userId);
    }
    values.push(id, userId);
    db.prepare(`UPDATE todos SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?`).run(
      ...values,
    );
    if (Object.hasOwn(input, 'tag_ids')) {
      tagDB.setTodoTags(id, userId, input.tag_ids ?? []);
    }
    return todoDB.findById(id, userId);
  },

  delete(id: number, userId: number): boolean {
    return db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId)
      .changes > 0;
  },

  insertForRecurrence(userId: number, input: CreateTodoInput): Todo {
    return insertTodo(userId, input);
  },
};

function subtaskForUser(id: number, userId: number): Subtask | null {
  const row = db.prepare(`
    SELECT subtasks.id, subtasks.todo_id, subtasks.title, subtasks.completed,
      subtasks.position, subtasks.created_at
    FROM subtasks
    INNER JOIN todos ON todos.id = subtasks.todo_id
    WHERE subtasks.id = ? AND todos.user_id = ?
  `).get(id, userId) as
    | (Omit<Subtask, 'completed'> & { completed: number })
    | undefined;
  return row ? { ...row, completed: Boolean(row.completed) } : null;
}

export const subtaskDB = {
  findByTodoId(todoId: number, userId: number): Subtask[] {
    const todo = todoDB.findById(todoId, userId);
    return todo ? (todo.subtasks ?? []) : [];
  },

  findById(id: number, userId: number): Subtask | null {
    return subtaskForUser(id, userId);
  },

  create(todoId: number, userId: number, input: CreateSubtaskInput): Subtask | null {
    const todo = todoDB.findById(todoId, userId);
    if (!todo) return null;
    const position = input.position ?? (
      db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM subtasks WHERE todo_id = ?')
        .get(todoId) as { position: number }
    ).position;
    const result = db.prepare(`
      INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)
    `).run(todoId, input.title, position);
    return subtaskForUser(Number(result.lastInsertRowid), userId);
  },

  update(id: number, userId: number, input: UpdateSubtaskInput): Subtask | null {
    if (!subtaskForUser(id, userId)) return null;
    const assignments: string[] = [];
    const values: Array<string | number> = [];
    if (input.title !== undefined) {
      assignments.push('title = ?');
      values.push(input.title);
    }
    if (input.completed !== undefined) {
      assignments.push('completed = ?');
      values.push(input.completed ? 1 : 0);
    }
    if (assignments.length) {
      values.push(id, userId);
      db.prepare(`
        UPDATE subtasks SET ${assignments.join(', ')}
        WHERE id = ? AND todo_id IN (SELECT id FROM todos WHERE user_id = ?)
      `).run(...values);
    }
    return subtaskForUser(id, userId);
  },

  delete(id: number, userId: number): boolean {
    return db.prepare(`
      DELETE FROM subtasks
      WHERE id = ? AND todo_id IN (SELECT id FROM todos WHERE user_id = ?)
    `).run(id, userId).changes > 0;
  },
};

export const tagDB = {
  findAllByUser(userId: number): Tag[] {
    return db.prepare(`
      SELECT id, user_id, name, color, created_at
      FROM tags WHERE user_id = ? ORDER BY name COLLATE NOCASE
    `).all(userId) as Tag[];
  },

  findById(id: number, userId: number): Tag | null {
    return (db.prepare(`
      SELECT id, user_id, name, color, created_at
      FROM tags WHERE id = ? AND user_id = ?
    `).get(id, userId) as Tag | undefined) ?? null;
  },

  create(userId: number, input: CreateTagInput): Tag {
    const result = db.prepare(`
      INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)
    `).run(userId, input.name, input.color ?? '#3B82F6');
    const tag = tagDB.findById(Number(result.lastInsertRowid), userId);
    if (!tag) throw new Error('Created tag could not be loaded');
    return tag;
  },

  update(id: number, userId: number, input: UpdateTagInput): Tag | null {
    const fields: Array<[keyof UpdateTagInput, string, string | undefined]> = [
      ['name', 'name', input.name],
      ['color', 'color', input.color],
    ];
    const updates = fields.filter(([, , value]) => value !== undefined);
    if (!updates.length) return tagDB.findById(id, userId);
    const assignments = updates.map(([, column]) => `${column} = ?`);
    const values = updates.map(([, , value]) => value as string);
    values.push(String(id), String(userId));
    db.prepare(`
      UPDATE tags SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);
    return tagDB.findById(id, userId);
  },

  delete(id: number, userId: number): boolean {
    return db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId)
      .changes > 0;
  },

  findByTodoId(todoId: number, userId: number): Tag[] {
    if (!todoDB.findById(todoId, userId)) return [];
    return tagsForTodo(todoId, userId);
  },

  attachToTodo(todoId: number, tagId: number, userId: number): boolean {
    const owned = db.prepare(`
      SELECT todos.id FROM todos
      INNER JOIN tags ON tags.id = ?
      WHERE todos.id = ? AND todos.user_id = ? AND tags.user_id = ?
    `).get(tagId, todoId, userId, userId);
    if (!owned) return false;
    db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
      .run(todoId, tagId);
    return true;
  },

  detachFromTodo(todoId: number, tagId: number, userId: number): boolean {
    const owned = db.prepare(`
      SELECT todos.id FROM todos
      INNER JOIN tags ON tags.id = ?
      WHERE todos.id = ? AND todos.user_id = ? AND tags.user_id = ?
    `).get(tagId, todoId, userId, userId);
    if (!owned) return false;
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?')
      .run(todoId, tagId);
    return true;
  },

  getTagIdsForTodo(todoId: number, userId: number): number[] {
    return (db.prepare(`
      SELECT todo_tags.tag_id
      FROM todo_tags
      INNER JOIN todos ON todos.id = todo_tags.todo_id
      INNER JOIN tags ON tags.id = todo_tags.tag_id
      WHERE todos.id = ? AND todos.user_id = ? AND tags.user_id = ?
      `).all(todoId, userId, userId) as Array<{ tag_id: number }>).map(({ tag_id }) => tag_id);
  },

  setTodoTags(todoId: number, userId: number, tagIds: number[]): void {
    const uniqueIds = [...new Set(tagIds)];
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const ownedCount = uniqueIds.length
      ? (db.prepare(`
          SELECT COUNT(*) AS count FROM tags
          WHERE user_id = ? AND id IN (${placeholders})
        `).get(userId, ...uniqueIds) as { count: number }).count
      : 0;
    if (ownedCount !== uniqueIds.length) throw new Error('One or more tags were not found');

    db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
    const insert = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
    for (const tagId of uniqueIds) insert.run(todoId, tagId);
  },
};

function mapTemplate(row: TemplateRow): Template {
  return { ...row, is_recurring: Boolean(row.is_recurring) };
}

export const templateDB = {
  findAllByUser(userId: number): Template[] {
    return (db.prepare(`
      SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC, id DESC
    `).all(userId) as TemplateRow[]).map(mapTemplate);
  },

  findById(id: number, userId: number): Template | null {
    const row = db.prepare(`
      SELECT * FROM templates WHERE id = ? AND user_id = ?
    `).get(id, userId) as TemplateRow | undefined;
    return row ? mapTemplate(row) : null;
  },

  create(userId: number, input: CreateTemplateInput): Template {
    const result = db.prepare(`
      INSERT INTO templates (
        user_id, name, description, category, title_template, priority, is_recurring,
        recurrence_pattern, reminder_minutes, due_date_offset_minutes, subtasks_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.title_template,
      input.priority,
      input.is_recurring ? 1 : 0,
      input.is_recurring ? input.recurrence_pattern ?? null : null,
      input.reminder_minutes ?? null,
      input.due_date_offset_minutes ?? null,
      input.subtasks?.length ? JSON.stringify(input.subtasks) : null,
    );
    const template = templateDB.findById(Number(result.lastInsertRowid), userId);
    if (!template) throw new Error('Created template could not be loaded');
    return template;
  },

  update(id: number, userId: number, input: UpdateTemplateInput): Template | null {
    const current = templateDB.findById(id, userId);
    if (!current) return null;
    const fields: Array<[keyof UpdateTemplateInput, string]> = [
      ['name', 'name'],
      ['description', 'description'],
      ['category', 'category'],
      ['title_template', 'title_template'],
      ['priority', 'priority'],
      ['is_recurring', 'is_recurring'],
      ['recurrence_pattern', 'recurrence_pattern'],
      ['reminder_minutes', 'reminder_minutes'],
      ['due_date_offset_minutes', 'due_date_offset_minutes'],
      ['subtasks', 'subtasks_json'],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of fields) {
      if (!Object.hasOwn(input, key)) continue;
      assignments.push(`${column} = ?`);
      if (key === 'subtasks') {
        values.push(input.subtasks?.length ? JSON.stringify(input.subtasks) : null);
      } else if (key === 'is_recurring') {
        values.push(input.is_recurring ? 1 : 0);
      } else {
        values.push(input[key]);
      }
    }
    if (!assignments.length) return current;
    values.push(id, userId);
    db.prepare(`
      UPDATE templates SET ${assignments.join(', ')} WHERE id = ? AND user_id = ?
    `).run(...values);
    return templateDB.findById(id, userId);
  },

  delete(id: number, userId: number): boolean {
    return db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId)
      .changes > 0;
  },
};
