'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { sectionTodos, sortTodos, validateDueDate } from '@/lib/todos';
import { formatSingaporeDate } from '@/lib/timezone';
import type { CreateTodoInput, Todo } from '@/lib/db';
import type { RecurrencePattern } from '@/lib/recurrence';
import type { ReminderMinutes } from '@/lib/reminders';
import { REMINDER_LABELS, REMINDER_MINUTES } from '@/lib/reminders';

type PriorityFilter = 'all' | Todo['priority'];

interface TodoFormFields {
  title: string;
  due_date: string | null;
  priority: Todo['priority'];
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: ReminderMinutes | null;
}

const EMPTY_FIELDS: TodoFormFields = {
  title: '',
  due_date: null,
  priority: 'medium',
  is_recurring: false,
  recurrence_pattern: 'daily',
  reminder_minutes: null,
};

async function fetchTodos(): Promise<Todo[]> {
  const response = await fetch('/api/todos');
  if (!response.ok) throw new Error('Could not load todos.');
  return (await response.json()) as Todo[];
}

async function requestTodo(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function PriorityBadge({ priority }: { priority: Todo['priority'] }) {
  const label = priority[0].toUpperCase() + priority.slice(1);
  return (
    <span className={`priority-badge priority-${priority}`} aria-label={`Priority: ${label}`}>
      {label}
    </span>
  );
}

function TodoFields({
  values,
  onChange,
  editing = false,
}: {
  values: TodoFormFields;
  onChange: (values: TodoFormFields) => void;
  editing?: boolean;
}) {
  const prefix = editing ? 'Edit ' : '';
  return (
    <>
      <label>
        {editing ? 'Edit title' : 'Title'}
        <input
          required
          value={values.title}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
          placeholder="What needs to be done?"
        />
      </label>
      {values.title.length > 200 && (
        <p className="hint" role="status">Long titles may wrap in the todo list.</p>
      )}
      <label>
        {prefix}Due date and time
        <input
          type="datetime-local"
          value={values.due_date ?? ''}
          onChange={(event) => {
            const dueDate = event.target.value || null;
            onChange({
              ...values,
              due_date: dueDate,
              is_recurring: dueDate ? values.is_recurring : false,
              reminder_minutes: dueDate ? values.reminder_minutes : null,
            });
          }}
        />
      </label>
      <div className="form-row">
        <label>
          {prefix}Priority
          <select
            aria-label={editing ? 'Edit priority' : 'Priority'}
            value={values.priority}
            onChange={(event) =>
              onChange({ ...values, priority: event.target.value as Todo['priority'] })
            }
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          {prefix}Reminder
          <select
            value={values.reminder_minutes ?? ''}
            disabled={!values.due_date}
            onChange={(event) =>
              onChange({
                ...values,
                reminder_minutes: event.target.value
                  ? (Number(event.target.value) as ReminderMinutes)
                  : null,
              })
            }
          >
            <option value="">None</option>
            {REMINDER_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes < 60
                  ? `${minutes} minutes before`
                  : minutes < 1440
                    ? `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`
                    : `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={values.is_recurring}
            disabled={!values.due_date}
            onChange={(event) => onChange({ ...values, is_recurring: event.target.checked })}
          />
          Repeat
        </label>
        {values.is_recurring && (
          <label>
            Recurrence pattern
            <select
              value={values.recurrence_pattern}
              onChange={(event) =>
                onChange({
                  ...values,
                  recurrence_pattern: event.target.value as RecurrencePattern,
                })
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        )}
      </div>
    </>
  );
}

function TodoItem({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: Todo;
  onToggle: (todo: Todo, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  return (
    <li className="todo-item" data-testid="todo-item">
      <input
        aria-label={`Mark ${todo.title} complete`}
        type="checkbox"
        checked={todo.completed}
        onChange={(event) => onToggle(todo, event.target.checked)}
      />
      <div className="todo-main">
        <p className={todo.completed ? 'todo-title completed' : 'todo-title'}>{todo.title}</p>
        {todo.due_date && (
          <p className="todo-meta">
            Due {formatSingaporeDate(todo.due_date, 'yyyy-MM-dd HH:mm')}
          </p>
        )}
        <div className="badges">
          <PriorityBadge priority={todo.priority} />
          {todo.is_recurring && todo.recurrence_pattern && (
            <span className="recurrence-badge">↻ {todo.recurrence_pattern}</span>
          )}
          {todo.reminder_minutes !== null && (
            <span className="reminder-badge">🔔 {REMINDER_LABELS[todo.reminder_minutes]}</span>
          )}
        </div>
      </div>
      <div className="todo-actions">
        <button type="button" className="secondary" onClick={() => onEdit(todo)}>Edit</button>
        <button type="button" className="danger" onClick={() => onDelete(todo)}>Delete</button>
      </div>
    </li>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [fields, setFields] = useState<TodoFormFields>(EMPTY_FIELDS);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [editFields, setEditFields] = useState<TodoFormFields>(EMPTY_FIELDS);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const createFormRevision = useRef(0);
  const { permission, requestPermission, error: notificationError } = useNotifications();

  useEffect(() => {
    let active = true;
    void fetchTodos()
      .then((items) => {
        if (active) setTodos(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load todos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleTodos = useMemo(
    () =>
      sortTodos(
        priorityFilter === 'all'
          ? todos
          : todos.filter((todo) => todo.priority === priorityFilter),
      ),
    [todos, priorityFilter],
  );
  const sections = useMemo(() => sectionTodos(visibleTodos), [visibleTodos]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const title = fields.title.trim();
    if (!title) {
      setError('Title is required');
      return;
    }
    if (fields.is_recurring && !fields.due_date) {
      setError('Recurring todos require a due date');
      return;
    }
    try {
      if (fields.due_date) validateDueDate(fields.due_date);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid due date');
      return;
    }
    const now = new Date();
    const optimistic: Todo = {
      id: -Date.now(),
      user_id: 0,
      title,
      completed: false,
      due_date: fields.due_date,
      priority: fields.priority,
      is_recurring: fields.is_recurring,
      recurrence_pattern: fields.is_recurring ? fields.recurrence_pattern : null,
      reminder_minutes: fields.reminder_minutes,
      last_notification_sent: null,
      created_at: now.toISOString(),
      updated_at: null,
      subtasks: [],
      tags: [],
    };
    setTodos((items) => [...items, optimistic]);
    const submittedRevision = createFormRevision.current;
    setFields(EMPTY_FIELDS);
    try {
      const input: CreateTodoInput = {
        title,
        due_date: fields.due_date,
        priority: fields.priority,
        is_recurring: fields.is_recurring,
        recurrence_pattern: fields.is_recurring ? fields.recurrence_pattern : null,
        reminder_minutes: fields.reminder_minutes,
      };
      const response = await requestTodo('/api/todos', 'POST', input);
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'Could not create todo.');
      }
      const saved = (await response.json()) as Todo;
      setTodos((items) => items.map((todo) => (todo.id === optimistic.id ? saved : todo)));
    } catch (reason) {
      setTodos((items) => items.filter((todo) => todo.id !== optimistic.id));
      if (createFormRevision.current === submittedRevision) setFields(fields);
      setError(reason instanceof Error ? reason.message : 'Could not create todo.');
    }
  }

  async function handleToggle(todo: Todo, completed: boolean) {
    setError(null);
    setTodos((items) =>
      items.map((item) => (item.id === todo.id ? { ...item, completed } : item)),
    );
    try {
      const response = await requestTodo(`/api/todos/${todo.id}`, 'PUT', { completed });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'Could not update todo.');
      }
      const result = (await response.json()) as { todo: Todo; nextInstance?: Todo };
      setTodos((items) => [
        ...items.map((item) => (item.id === todo.id ? result.todo : item)),
        ...(result.nextInstance ? [result.nextInstance] : []),
      ]);
    } catch (reason) {
      setTodos((items) => items.map((item) => (item.id === todo.id ? todo : item)));
      setError(reason instanceof Error ? reason.message : 'Could not update todo.');
    }
  }

  async function handleDelete(todo: Todo) {
    setError(null);
    setTodos((items) => items.filter((item) => item.id !== todo.id));
    try {
      const response = await requestTodo(`/api/todos/${todo.id}`, 'DELETE');
      if (!response.ok) throw new Error('Could not delete todo.');
    } catch (reason) {
      setTodos((items) => [...items, todo]);
      setError(reason instanceof Error ? reason.message : 'Could not delete todo.');
    }
  }

  function beginEdit(todo: Todo) {
    setEditing(todo);
    setEditFields({
      title: todo.title,
      due_date: todo.due_date ? todo.due_date.slice(0, 16) : null,
      priority: todo.priority,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern ?? 'daily',
      reminder_minutes: todo.reminder_minutes,
    });
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const original = editing;
    const patch = {
      title: editFields.title.trim(),
      due_date: editFields.due_date,
      priority: editFields.priority,
      is_recurring: editFields.is_recurring,
      recurrence_pattern: editFields.is_recurring ? editFields.recurrence_pattern : null,
      reminder_minutes: editFields.reminder_minutes,
    };
    try {
      if (editFields.due_date) validateDueDate(editFields.due_date, new Date(), false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid due date');
      return;
    }
    setError(null);
    setTodos((items) =>
      items.map((todo) => (todo.id === original.id ? { ...todo, ...patch } : todo)),
    );
    setEditing(null);
    try {
      const response = await requestTodo(`/api/todos/${original.id}`, 'PUT', patch);
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'Could not update todo.');
      }
      const result = (await response.json()) as { todo: Todo };
      setTodos((items) => items.map((todo) => (todo.id === original.id ? result.todo : todo)));
    } catch (reason) {
      setTodos((items) => items.map((todo) => (todo.id === original.id ? original : todo)));
      setError(reason instanceof Error ? reason.message : 'Could not update todo.');
    }
  }

  async function handleLogout() {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok) {
      router.replace('/login');
      return;
    }
    setError('Could not log out. Please try again.');
  }

  function renderSection(title: string, items: Todo[]) {
    return (
      <section className="todo-section" aria-label={`${title} todos`}>
        <h2>{title} ({items.length})</h2>
        {items.length > 0 ? (
          <ul className="todo-list">
            {items.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggle}
                onEdit={beginEdit}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        ) : (
          <p className="empty-section">No {title.toLowerCase()} todos.</p>
        )}
      </section>
    );
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Daily planner</p>
          <h1>Todo App</h1>
        </div>
        <button
          type="button"
          className={permission === 'granted' ? 'notification-on' : 'notification-button'}
          onClick={() => void requestPermission()}
          disabled={permission === 'granted'}
        >
          {permission === 'granted' ? '🔔 Notifications On' : '🔔 Enable Notifications'}
        </button>
        <button type="button" className="secondary" onClick={() => void handleLogout()}>
          Logout
        </button>
      </header>

      {(error || notificationError) && (
        <p className="error-banner" role="alert">{error ?? notificationError}</p>
      )}

      <form className="todo-form panel" onSubmit={(event) => void handleCreate(event)}>
        <h2>Add a todo</h2>
        <TodoFields
          values={fields}
          onChange={(next) => {
            createFormRevision.current += 1;
            setFields(next);
          }}
        />
        <button type="submit" className="primary" disabled={loading}>Add todo</button>
      </form>

      {editing && (
        <div
          className="edit-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(null);
          }}
        >
          <section className="edit-panel panel" aria-label="Edit todo" role="dialog" aria-modal="true">
            <form onSubmit={(event) => void handleUpdate(event)}>
              <h2>Edit todo</h2>
              <TodoFields values={editFields} onChange={setEditFields} editing />
              <div className="form-actions">
                <button type="submit" className="primary">Update</button>
                <button type="button" className="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <div className="list-toolbar">
        <h2>Your todos</h2>
        <label>
          Priority filter
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p role="status">Loading todos…</p>
      ) : (
        <div className="sections">
          {renderSection('Overdue', sections.overdue)}
          {renderSection('Pending', sections.pending)}
          {renderSection('Completed', sections.completed)}
        </div>
      )}
    </main>
  );
}
