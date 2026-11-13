'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { sectionTodos, sortTodos, validateDueDate } from '@/lib/todos';
import { formatSingaporeDate, getSingaporeNow, parseSingaporeDateTime } from '@/lib/timezone';
import type { CreateTodoInput, Subtask, Tag, Template, Todo } from '@/lib/db';
import type { RecurrencePattern } from '@/lib/recurrence';
import type { ReminderMinutes } from '@/lib/reminders';
import { REMINDER_LABELS, REMINDER_MINUTES } from '@/lib/reminders';
import { applyFilters, DEFAULT_FILTER_STATE, hasActiveFilters, type FilterState } from '@/lib/filters';
import { deletePreset, loadPresets, savePreset, type FilterPreset } from '@/lib/filter-presets';
import { calculateProgress } from '@/lib/subtasks';

interface TodoFormFields {
  title: string;
  due_date: string | null;
  priority: Todo['priority'];
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: ReminderMinutes | null;
  tag_ids: number[];
}

const EMPTY_FIELDS: TodoFormFields = {
  title: '',
  due_date: null,
  priority: 'medium',
  is_recurring: false,
  recurrence_pattern: 'daily',
  reminder_minutes: null,
  tag_ids: [],
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
  tags,
  editing = false,
}: {
  values: TodoFormFields;
  onChange: (values: TodoFormFields) => void;
  tags: Tag[];
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
      {tags.length > 0 && (
        <fieldset className="tag-selector">
          <legend>{prefix}Tags</legend>
          <div className="tag-pills">
            {tags.map((tag) => {
              const selected = values.tag_ids.includes(tag.id);
              return (
                <button
                  type="button"
                  key={tag.id}
                  className={selected ? 'tag-pill selected' : 'tag-pill'}
                  style={selected ? { backgroundColor: tag.color } : undefined}
                  aria-pressed={selected}
                  onClick={() =>
                    onChange({
                      ...values,
                      tag_ids: selected
                        ? values.tag_ids.filter((id) => id !== tag.id)
                        : [...values.tag_ids, tag.id],
                    })
                  }
                >
                  {selected ? '✓ ' : ''}{tag.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </>
  );
}

function TagPill({ tag, onClick }: { tag: Tag; onClick?: () => void }) {
  const content = <span className="tag-pill colored" style={{ backgroundColor: tag.color }}>{tag.name}</span>;
  return onClick ? (
    <button type="button" className="tag-pill-button" onClick={onClick} aria-label={`Filter by ${tag.name}`}>
      {content}
    </button>
  ) : content;
}

function ProgressBar({ subtasks }: { subtasks: Subtask[] }) {
  const progress = calculateProgress(subtasks);
  if (!progress.total) return null;
  return (
    <div className="subtask-progress" aria-label={`${progress.completed}/${progress.total} subtasks, ${progress.percent}%`}>
      <div className="progress-label">
        <span>{progress.completed}/{progress.total} subtasks</span>
        <span>{progress.percent}%</span>
      </div>
      <div className="progress-track">
        <div
          className={progress.percent === 100 ? 'progress-fill complete' : 'progress-fill'}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function TodoItem({
  todo,
  onToggle,
  onEdit,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onTagFilter,
}: {
  todo: Todo;
  onToggle: (todo: Todo, completed: boolean) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onAddSubtask: (todoId: number, title: string) => Promise<boolean>;
  onToggleSubtask: (subtask: Subtask, completed: boolean) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onTagFilter: (tagId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtasks = todo.subtasks ?? [];

  async function addSubtask(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const title = newSubtaskTitle.trim();
    if (!title) return;
    if (await onAddSubtask(todo.id, title)) setNewSubtaskTitle('');
  }

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
          {(todo.tags ?? []).map((tag) => (
            <TagPill key={tag.id} tag={tag} onClick={() => onTagFilter(tag.id)} />
          ))}
        </div>
        <div className="subtask-area">
          <button type="button" className="text-button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '▼' : '▶'} Subtasks
          </button>
          <ProgressBar subtasks={subtasks} />
          {expanded && (
            <div className="subtask-list">
              {subtasks.map((subtask) => (
                <div className="subtask-row" key={subtask.id}>
                  <input
                    type="checkbox"
                    aria-label={`Mark subtask ${subtask.title} complete`}
                    checked={subtask.completed}
                    onChange={(event) => onToggleSubtask(subtask, event.target.checked)}
                  />
                  <span className={subtask.completed ? 'subtask-title completed' : 'subtask-title'}>
                    {subtask.title}
                  </span>
                  <button
                    type="button"
                    className="text-button danger-text"
                    aria-label={`Delete subtask ${subtask.title}`}
                    onClick={() => onDeleteSubtask(subtask)}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <form className="subtask-add" onSubmit={(event) => void addSubtask(event)}>
                <input
                  value={newSubtaskTitle}
                  onChange={(event) => setNewSubtaskTitle(event.target.value)}
                  placeholder="Add subtask..."
                  aria-label="Add subtask"
                />
                <button type="submit" className="secondary" disabled={!newSubtaskTitle.trim()}>
                  Add
                </button>
              </form>
            </div>
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fields, setFields] = useState<TodoFormFields>(EMPTY_FIELDS);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [editFields, setEditFields] = useState<TodoFormFields>(EMPTY_FIELDS);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [draftSubtaskTitle, setDraftSubtaskTitle] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templateOffset, setTemplateOffset] = useState('');
  const [presetName, setPresetName] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3B82F6');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const createFormRevision = useRef(0);
  const { permission, requestPermission, error: notificationError } = useNotifications();
  const debouncedSearch = useDebounce(filters.search, 300);
  const activeTagId: FilterState['tagId'] =
    filters.tagId !== 'all' && tags.some((tag) => tag.id === filters.tagId)
    ? filters.tagId
    : 'all';
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      search: filters.search === '' ? '' : debouncedSearch,
      tagId: activeTagId,
    }),
    [filters, debouncedSearch, activeTagId],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchTodos(),
      fetch('/api/tags').then(async (response) => {
        if (!response.ok) throw new Error('Could not load tags.');
        return await response.json() as Tag[];
      }),
      fetch('/api/templates').then(async (response) => {
        if (!response.ok) throw new Error('Could not load templates.');
        return await response.json() as Template[];
      }),
    ])
      .then(([items, userTags, userTemplates]) => {
        if (!active) return;
        setTodos(items);
        setTags(userTags);
        setTemplates(userTemplates);
        setPresets(loadPresets());
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
    () => sortTodos(applyFilters(todos, effectiveFilters)),
    [todos, effectiveFilters],
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
      tags: tags.filter((tag) => fields.tag_ids.includes(tag.id)),
    };
    setTodos((items) => [...items, optimistic]);
    const submittedRevision = createFormRevision.current;
    setFields(EMPTY_FIELDS);
    setDraftSubtasks([]);
    setDraftSubtaskTitle('');
    try {
      const input: CreateTodoInput = {
        title,
        due_date: fields.due_date,
        priority: fields.priority,
        is_recurring: fields.is_recurring,
        recurrence_pattern: fields.is_recurring ? fields.recurrence_pattern : null,
        reminder_minutes: fields.reminder_minutes,
        tag_ids: fields.tag_ids,
      };
      const response = await requestTodo('/api/todos', 'POST', input);
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'Could not create todo.');
      }
      let saved = (await response.json()) as Todo;
      setTodos((items) => items.map((todo) => (todo.id === optimistic.id ? saved : todo)));
      for (const subtaskTitle of draftSubtasks) {
        try {
          const subtaskResponse = await requestTodo(
            `/api/todos/${saved.id}/subtasks`,
            'POST',
            { title: subtaskTitle },
          );
          if (!subtaskResponse.ok) throw new Error('Could not create a subtask.');
          const subtask = (await subtaskResponse.json()) as Subtask;
          saved = { ...saved, subtasks: [...(saved.subtasks ?? []), subtask] };
          setTodos((items) => items.map((todo) => (todo.id === saved.id ? saved : todo)));
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Could not create a subtask.');
        }
      }
    } catch (reason) {
      setTodos((items) => items.filter((todo) => todo.id !== optimistic.id));
      if (createFormRevision.current === submittedRevision) {
        setFields(fields);
        setDraftSubtasks(draftSubtasks);
      }
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

  async function handleAddSubtask(todoId: number, title: string): Promise<boolean> {
    const optimistic: Subtask = {
      id: -Date.now(),
      todo_id: todoId,
      title,
      completed: false,
      position: todos.find((todo) => todo.id === todoId)?.subtasks?.length ?? 0,
      created_at: getSingaporeNow().toISOString(),
    };
    setTodos((items) => items.map((todo) =>
      todo.id === todoId
        ? { ...todo, subtasks: [...(todo.subtasks ?? []), optimistic] }
        : todo,
    ));
    try {
      const response = await requestTodo(`/api/todos/${todoId}/subtasks`, 'POST', { title });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Could not create subtask.');
      }
      const saved = await response.json() as Subtask;
      setTodos((items) => items.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              subtasks: (todo.subtasks ?? []).map((subtask) =>
                subtask.id === optimistic.id ? saved : subtask,
              ),
            }
          : todo,
      ));
      return true;
    } catch (reason) {
      setTodos((items) => items.map((todo) =>
        todo.id === todoId
          ? { ...todo, subtasks: (todo.subtasks ?? []).filter((subtask) => subtask.id !== optimistic.id) }
          : todo,
      ));
      setError(reason instanceof Error ? reason.message : 'Could not create subtask.');
      return false;
    }
  }

  async function handleToggleSubtask(subtask: Subtask, completed: boolean) {
    setTodos((items) => items.map((todo) => todo.id === subtask.todo_id
      ? {
          ...todo,
          subtasks: (todo.subtasks ?? []).map((item) =>
            item.id === subtask.id ? { ...item, completed } : item,
          ),
        }
      : todo,
    ));
    try {
      const response = await requestTodo(`/api/subtasks/${subtask.id}`, 'PUT', { completed });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Could not update subtask.');
      }
      const updated = await response.json() as Subtask;
      setTodos((items) => items.map((todo) => todo.id === subtask.todo_id
        ? {
            ...todo,
            subtasks: (todo.subtasks ?? []).map((item) => item.id === subtask.id ? updated : item),
          }
        : todo,
      ));
    } catch (reason) {
      setTodos((items) => items.map((todo) => todo.id === subtask.todo_id
        ? {
            ...todo,
            subtasks: (todo.subtasks ?? []).map((item) =>
              item.id === subtask.id ? { ...item, completed: subtask.completed } : item,
            ),
          }
        : todo,
      ));
      setError(reason instanceof Error ? reason.message : 'Could not update subtask.');
    }
  }

  async function handleDeleteSubtask(subtask: Subtask) {
    setTodos((items) => items.map((todo) => todo.id === subtask.todo_id
      ? { ...todo, subtasks: (todo.subtasks ?? []).filter((item) => item.id !== subtask.id) }
      : todo,
    ));
    try {
      const response = await requestTodo(`/api/subtasks/${subtask.id}`, 'DELETE');
      if (!response.ok) throw new Error('Could not delete subtask.');
    } catch (reason) {
      setTodos((items) => items.map((todo) => todo.id === subtask.todo_id
        ? { ...todo, subtasks: [...(todo.subtasks ?? []), subtask].sort((a, b) => a.position - b.position) }
        : todo,
      ));
      setError(reason instanceof Error ? reason.message : 'Could not delete subtask.');
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
      tag_ids: (todo.tags ?? []).map((tag) => tag.id),
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
      tag_ids: editFields.tag_ids,
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

  function beginTagEdit(tag: Tag) {
    setEditingTagId(tag.id);
    setTagName(tag.name);
    setTagColor(tag.color);
  }

  function resetTagForm() {
    setEditingTagId(null);
    setTagName('');
    setTagColor('#3B82F6');
  }

  async function handleSaveTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;
    const method = editingTagId === null ? 'POST' : 'PUT';
    const url = editingTagId === null ? '/api/tags' : `/api/tags/${editingTagId}`;
    try {
      const response = await requestTodo(url, method, { name, color: tagColor });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Could not save tag.');
      }
      const saved = await response.json() as Tag;
      setTags((items) => editingTagId === null
        ? [...items, saved].sort((a, b) => a.name.localeCompare(b.name))
        : items.map((tag) => tag.id === saved.id ? saved : tag)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setTodos((items) => items.map((todo) => ({
        ...todo,
        tags: (todo.tags ?? []).map((tag) => tag.id === saved.id ? saved : tag),
      })));
      resetTagForm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save tag.');
    }
  }

  async function handleDeleteTag(tag: Tag) {
    if (!window.confirm(`Delete the "${tag.name}" tag?`)) return;
    try {
      const response = await requestTodo(`/api/tags/${tag.id}`, 'DELETE');
      if (!response.ok) throw new Error('Could not delete tag.');
      setTags((items) => items.filter((item) => item.id !== tag.id));
      setTodos((items) => items.map((todo) => ({
        ...todo,
        tags: (todo.tags ?? []).filter((item) => item.id !== tag.id),
      })));
      setFilters((current) => current.tagId === tag.id
        ? { ...current, tagId: 'all' }
        : current,
      );
      if (editingTagId === tag.id) resetTagForm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete tag.');
    }
  }

  async function handleUseTemplate(templateId: number) {
    try {
      const response = await requestTodo(`/api/templates/${templateId}/use`, 'POST');
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Could not use template.');
      }
      const todo = await response.json() as Todo;
      setTodos((items) => [...items, todo]);
      setTemplateManagerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use template.');
    }
  }

  async function handleDeleteTemplate(template: Template) {
    if (!window.confirm(`Delete the "${template.name}" template?`)) return;
    try {
      const response = await requestTodo(`/api/templates/${template.id}`, 'DELETE');
      if (!response.ok) throw new Error('Could not delete template.');
      setTemplates((items) => items.filter((item) => item.id !== template.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete template.');
    }
  }

  function openSaveTemplate() {
    const dueDate = fields.due_date ? parseSingaporeDateTime(fields.due_date) : null;
    const offset = dueDate
      ? Math.max(0, Math.round((dueDate.getTime() - getSingaporeNow().getTime()) / 60_000))
      : null;
    setTemplateName('');
    setTemplateDescription('');
    setTemplateCategory('');
    setTemplateOffset(offset === null ? '' : String(offset));
    setSaveTemplateOpen(true);
  }

  async function handleSaveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const offset = templateOffset.trim() === '' ? null : Number(templateOffset);
    if (offset !== null && (!Number.isSafeInteger(offset) || offset < 0)) {
      setError('Due date offset must be a non-negative number of minutes.');
      return;
    }
    try {
      const response = await requestTodo('/api/templates', 'POST', {
        name: templateName,
        description: templateDescription || undefined,
        category: templateCategory || undefined,
        title_template: fields.title,
        priority: fields.priority,
        is_recurring: fields.is_recurring,
        recurrence_pattern: fields.is_recurring ? fields.recurrence_pattern : undefined,
        reminder_minutes: fields.reminder_minutes ?? undefined,
        due_date_offset_minutes: offset ?? undefined,
        subtasks: draftSubtasks.map((title, position) => ({ title, position })),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Could not save template.');
      }
      const template = await response.json() as Template;
      setTemplates((items) => [...items, template]);
      setSaveTemplateOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save template.');
    }
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTER_STATE);
  }

  function applyPreset(preset: FilterPreset) {
    const restored = { ...DEFAULT_FILTER_STATE, ...preset.filters };
    if (restored.tagId !== 'all' && !tags.some((tag) => tag.id === restored.tagId)) {
      restored.tagId = 'all';
    }
    setFilters(restored);
    setAdvancedExpanded(true);
  }

  function handleDeletePreset(preset: FilterPreset) {
    if (!window.confirm(`Delete the "${preset.name}" filter preset?`)) return;
    try {
      setPresets(deletePreset(preset.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete filter preset.');
    }
  }

  function handleSavePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = presetName.trim();
    if (!name) return;
    try {
      const preset: FilterPreset = {
        id: crypto.randomUUID(),
        name,
        filters,
        createdAt: getSingaporeNow().toISOString(),
      };
      setPresets(savePreset(preset));
      setPresetName('');
      setSavePresetOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save filter preset.');
    }
  }

  function filterPreview(): string {
    const labels = [
      filters.search.trim() ? `Search: "${filters.search.trim()}"` : null,
      filters.priority !== 'all' ? `Priority: ${filters.priority}` : null,
      filters.tagId !== 'all'
        ? `Tag: ${tags.find((tag) => tag.id === filters.tagId)?.name ?? 'All Tags'}`
        : null,
      filters.completion !== 'all' ? `Completion: ${filters.completion}` : null,
      filters.dueDateFrom || filters.dueDateTo
        ? `Date: ${filters.dueDateFrom ?? 'Any'} to ${filters.dueDateTo ?? 'Any'}`
        : null,
    ];
    return labels.filter(Boolean).join(' · ');
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
    if (!items.length) return null;
    return (
      <section className="todo-section" aria-label={`${title} todos`}>
        <h2>{title} ({items.length})</h2>
        <ul className="todo-list">
          {items.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onEdit={beginEdit}
              onDelete={handleDelete}
              onAddSubtask={handleAddSubtask}
              onToggleSubtask={handleToggleSubtask}
              onDeleteSubtask={handleDeleteSubtask}
              onTagFilter={(tagId) => setFilters((current) => ({ ...current, tagId }))}
            />
          ))}
        </ul>
      </section>
    );
  }

  const noTodos = todos.length === 0;
  const noMatches = !noTodos && visibleTodos.length === 0;

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
        <button type="button" className="secondary" onClick={() => setTagManagerOpen(true)}>
          + Manage Tags
        </button>
        <button type="button" className="secondary" onClick={() => setTemplateManagerOpen(true)}>
          📋 Templates
        </button>
      </header>

      {(error || notificationError) && (
        <p className="error-banner" role="alert">{error ?? notificationError}</p>
      )}

      <form className="todo-form panel" onSubmit={(event) => void handleCreate(event)}>
        <h2>Add a todo</h2>
        <TodoFields
          values={fields}
          tags={tags}
          onChange={(next) => {
            createFormRevision.current += 1;
            setFields(next);
          }}
        />
        <div className="draft-subtasks">
          <strong>Subtasks</strong>
          {draftSubtasks.map((title, index) => (
            <div className="subtask-row" key={`${index}-${title}`}>
              <span>{title}</span>
              <button
                type="button"
                className="text-button danger-text"
                aria-label={`Remove draft subtask ${title}`}
                onClick={() => {
                  createFormRevision.current += 1;
                  setDraftSubtasks((items) => items.filter((_, itemIndex) => itemIndex !== index));
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="subtask-add">
            <input
              value={draftSubtaskTitle}
              onChange={(event) => {
                createFormRevision.current += 1;
                setDraftSubtaskTitle(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const title = draftSubtaskTitle.trim();
                  if (title) {
                    createFormRevision.current += 1;
                    setDraftSubtasks((items) => [...items, title]);
                    setDraftSubtaskTitle('');
                  }
                }
              }}
              placeholder="Add subtask..."
              aria-label="Draft subtask"
            />
            <button
              type="button"
              className="secondary"
              disabled={!draftSubtaskTitle.trim()}
              onClick={() => {
                const title = draftSubtaskTitle.trim();
                if (!title) return;
                createFormRevision.current += 1;
                setDraftSubtasks((items) => [...items, title]);
                setDraftSubtaskTitle('');
              }}
            >
              Add subtask
            </button>
          </div>
        </div>
        <div className="form-actions">
          {fields.title.trim() && (
            <button type="button" className="secondary" onClick={openSaveTemplate}>
              💾 Save as Template
            </button>
          )}
          {templates.length > 0 && (
            <label>
              Use Template
              <select
                aria-label="Use Template"
                value=""
                onChange={(event) => {
                  const id = Number(event.target.value);
                  if (id > 0) void handleUseTemplate(id);
                }}
              >
                <option value="">Choose a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.category
                      ? `${template.name} (${template.category})`
                      : template.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
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
              <TodoFields values={editFields} onChange={setEditFields} tags={tags} editing />
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
      </div>

      <section className="filter-panel panel" aria-label="Todo filters">
        <div className="filter-row">
          <label className="search-field">
            Search todos and subtasks
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search todos and subtasks..."
            />
          </label>
          {filters.search && (
            <button
              type="button"
              className="text-button"
              aria-label="Clear search"
              onClick={() => setFilters((current) => ({ ...current, search: '' }))}
            >
              ✕
            </button>
          )}
          <label>
            Priority
            <select
              aria-label="Priority filter"
              value={filters.priority}
              onChange={(event) => setFilters((current) => ({
                ...current,
                priority: event.target.value as FilterState['priority'],
              }))}
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </label>
          {tags.length > 0 && (
            <label>
              Tag
              <select
                aria-label="Tag filter"
                value={activeTagId}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  tagId: event.target.value === 'all' ? 'all' : Number(event.target.value),
                }))}
              >
                <option value="all">All Tags</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
          )}
          <button
            type="button"
            className={advancedExpanded ? 'advanced-toggle active' : 'advanced-toggle'}
            onClick={() => setAdvancedExpanded((expanded) => !expanded)}
          >
            {advancedExpanded ? '▼ Advanced' : '▶ Advanced'}
          </button>
        </div>
        {advancedExpanded && (
          <div className="advanced-filters">
            <label>
              Completion
              <select
                aria-label="Completion Status"
                value={filters.completion}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  completion: event.target.value as FilterState['completion'],
                }))}
              >
                <option value="all">All Todos</option>
                <option value="incomplete">Incomplete Only</option>
                <option value="completed">Completed Only</option>
              </select>
            </label>
            <label>
              Due Date From
              <input
                type="date"
                aria-label="Due Date From"
                value={filters.dueDateFrom ?? ''}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  dueDateFrom: event.target.value || null,
                }))}
              />
            </label>
            <label>
              Due Date To
              <input
                type="date"
                aria-label="Due Date To"
                value={filters.dueDateTo ?? ''}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  dueDateTo: event.target.value || null,
                }))}
              />
            </label>
            {presets.length > 0 && (
              <div className="saved-presets" aria-label="Saved filters">
                {presets.map((preset) => (
                  <span className="preset-pill" key={preset.id}>
                    <button type="button" onClick={() => applyPreset(preset)}>{preset.name}</button>
                    <button
                      type="button"
                      aria-label={`Delete preset ${preset.name}`}
                      onClick={() => handleDeletePreset(preset)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {hasActiveFilters(filters) && (
          <div className="filter-actions">
            <button type="button" className="text-button danger-text" onClick={clearFilters}>
              Clear All
            </button>
            <button
              type="button"
              className="text-button save-filter"
              onClick={() => {
                setPresetName('');
                setSavePresetOpen(true);
              }}
            >
              💾 Save Filter
            </button>
          </div>
        )}
      </section>

      {loading ? (
        <p role="status">Loading todos…</p>
      ) : noTodos ? (
        <p className="empty-state">You have no todos yet.</p>
      ) : noMatches ? (
        <p className="empty-state">No todos match your filters.</p>
      ) : (
        <div className="sections">
          {renderSection('Overdue', sections.overdue)}
          {renderSection('Pending', sections.pending)}
          {renderSection('Completed', sections.completed)}
        </div>
      )}

      {tagManagerOpen && (
        <div className="edit-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) {
            setTagManagerOpen(false);
            resetTagForm();
          }
        }}>
          <section className="edit-panel panel" role="dialog" aria-modal="true" aria-label="Manage Tags">
            <h2>Manage Tags</h2>
            <ul className="managed-tag-list">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <TagPill tag={tag} />
                  <div className="form-actions">
                    <button type="button" className="text-button" onClick={() => beginTagEdit(tag)}>Edit</button>
                    <button type="button" className="text-button danger-text" onClick={() => void handleDeleteTag(tag)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
            <form className="tag-form" onSubmit={(event) => void handleSaveTag(event)}>
              <label>
                {editingTagId === null ? 'Tag name' : 'Edit tag name'}
                <input value={tagName} onChange={(event) => setTagName(event.target.value)} required />
              </label>
              <div className="form-row">
                <label>
                  Color
                  <input type="color" value={tagColor} onChange={(event) => setTagColor(event.target.value)} />
                </label>
                <label>
                  Hex color
                  <input value={tagColor} onChange={(event) => setTagColor(event.target.value)} />
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary">
                  {editingTagId === null ? 'Create Tag' : 'Update Tag'}
                </button>
                {editingTagId !== null && (
                  <button type="button" className="secondary" onClick={resetTagForm}>Cancel edit</button>
                )}
                <button type="button" className="secondary" onClick={() => {
                  setTagManagerOpen(false);
                  resetTagForm();
                }}>Close</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {templateManagerOpen && (
        <div className="edit-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setTemplateManagerOpen(false);
        }}>
          <section className="edit-panel panel" role="dialog" aria-modal="true" aria-label="Template Manager">
            <h2>Templates</h2>
            {templates.length === 0 ? <p>No templates saved yet.</p> : (
              <ul className="template-list">
                {templates.map((template) => (
                  <li key={template.id} className="template-card">
                    <div className="template-heading">
                      <strong>{template.name}</strong>
                      {template.category && <span className="category-badge">{template.category}</span>}
                    </div>
                    {template.description && <p>{template.description}</p>}
                    <p className="template-details">
                      <PriorityBadge priority={template.priority} />
                      {template.is_recurring && <span className="recurrence-badge">↻ {template.recurrence_pattern}</span>}
                      {template.reminder_minutes !== null && (
                        <span className="reminder-badge">🔔 {REMINDER_LABELS[template.reminder_minutes]}</span>
                      )}
                    </p>
                    <div className="form-actions">
                      <button type="button" className="primary" onClick={() => void handleUseTemplate(template.id)}>Use</button>
                      <button type="button" className="danger" onClick={() => void handleDeleteTemplate(template)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="secondary" onClick={() => setTemplateManagerOpen(false)}>Close</button>
          </section>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="edit-backdrop" role="presentation">
          <section className="edit-panel panel" role="dialog" aria-modal="true" aria-label="Save as Template">
            <form onSubmit={(event) => void handleSaveTemplate(event)}>
              <h2>Save as Template</h2>
              <label>Template name<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} required /></label>
              <label>Description (optional)<textarea value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} /></label>
              <label>Category (optional)<input list="template-categories" value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} /></label>
              <datalist id="template-categories">
                {['Work', 'Personal', 'Finance', 'Health', 'Education'].map((category) => <option key={category} value={category} />)}
              </datalist>
              <label>
                Due date offset (minutes, optional)
                <input type="number" min="0" step="1" value={templateOffset} onChange={(event) => setTemplateOffset(event.target.value)} />
              </label>
              {fields.is_recurring && templateOffset === '' && (
                <p className="hint">Recurring templates require a due date offset.</p>
              )}
              <div className="form-actions">
                <button type="submit" className="primary">Save Template</button>
                <button type="button" className="secondary" onClick={() => setSaveTemplateOpen(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {savePresetOpen && (
        <div className="edit-backdrop" role="presentation">
          <section className="edit-panel panel" role="dialog" aria-modal="true" aria-label="Save Filter">
            <form onSubmit={handleSavePreset}>
              <h2>Save Filter</h2>
              <p>{filterPreview()}</p>
              <label>Preset name<input value={presetName} onChange={(event) => setPresetName(event.target.value)} required /></label>
              <div className="form-actions">
                <button type="submit" className="primary">Save</button>
                <button type="button" className="secondary" onClick={() => setSavePresetOpen(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
