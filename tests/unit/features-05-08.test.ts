import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/lib/db';
import { calculateProgress } from '@/lib/subtasks';
import {
  applyFilters,
  DEFAULT_FILTER_STATE,
  hasActiveFilters,
  type FilterState,
} from '@/lib/filters';
import { deletePreset, loadPresets, savePreset } from '@/lib/filter-presets';
import {
  addMinutesToSingaporeDate,
  parseTemplateSubtasks,
  serializeTemplateSubtasks,
} from '@/lib/templates';

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    user_id: 1,
    title: 'Team meeting',
    completed: false,
    due_date: '2026-11-15T10:00:00',
    priority: 'high',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-11-13T00:00:00',
    updated_at: null,
    subtasks: [],
    tags: [],
    ...overrides,
  };
}

describe('subtask progress', () => {
  it('handles empty, partial, and complete checklists with rounded percentages', () => {
    expect(calculateProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(
      calculateProgress([
        { id: 1, todo_id: 1, title: 'A', completed: true, position: 0, created_at: '' },
        { id: 2, todo_id: 1, title: 'B', completed: false, position: 1, created_at: '' },
        { id: 3, todo_id: 1, title: 'C', completed: false, position: 2, created_at: '' },
      ]),
    ).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(
      calculateProgress([
        { id: 1, todo_id: 1, title: 'A', completed: true, position: 0, created_at: '' },
        { id: 2, todo_id: 1, title: 'B', completed: true, position: 1, created_at: '' },
        { id: 3, todo_id: 1, title: 'C', completed: false, position: 2, created_at: '' },
      ]).percent,
    ).toBe(67);
  });
});

describe('search and filtering', () => {
  const todos = [
    todo({
      id: 1,
      priority: 'high',
      completed: false,
      tags: [{ id: 4, user_id: 1, name: 'Work', color: '#123456', created_at: '' }],
      subtasks: [{ id: 1, todo_id: 1, title: 'Prepare slides', completed: false, position: 0, created_at: '' }],
    }),
    todo({
      id: 2,
      title: 'Personal errands',
      priority: 'low',
      completed: true,
      due_date: null,
    }),
  ];

  it('matches titles and subtask titles case-insensitively and by partial text', () => {
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'MEET' }).map((item) => item.id)).toEqual([1]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'slides' }).map((item) => item.id)).toEqual([1]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'missing' })).toEqual([]);
  });

  it('combines priority, tag, status, and date bounds using AND semantics', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      priority: 'high',
      tagId: 4,
      completion: 'incomplete',
      dueDateFrom: '2026-11-15',
      dueDateTo: '2026-11-15',
    };
    expect(applyFilters(todos, filters).map((item) => item.id)).toEqual([1]);
    expect(
      applyFilters(todos, { ...filters, dueDateFrom: '2026-11-16' }),
    ).toEqual([]);
  });

  it('filters priority, completion, and one-sided date ranges', () => {
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, priority: 'low' }).map((item) => item.id))
      .toEqual([2]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, completion: 'completed' }).map((item) => item.id))
      .toEqual([2]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, completion: 'incomplete' }).map((item) => item.id))
      .toEqual([1]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, dueDateFrom: '2026-11-15' }).map((item) => item.id))
      .toEqual([1]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, dueDateTo: '2026-11-14' })).toEqual([]);
  });

  it('treats whitespace search as inactive and tracks each active filter dimension', () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, search: '   ' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTER_STATE, tagId: 4 })).toBe(true);
    expect(hasActiveFilters(DEFAULT_FILTER_STATE)).toBe(false);
  });
});

describe('saved filter presets', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  it('saves, reloads, and deletes presets and recovers from malformed storage', () => {
    const preset = {
      id: 'one',
      name: 'Work tasks',
      filters: { ...DEFAULT_FILTER_STATE, priority: 'high' as const },
      createdAt: '2026-11-13T00:00:00.000Z',
    };
    expect(savePreset(preset)).toEqual([preset]);
    expect(loadPresets()).toEqual([preset]);
    expect(deletePreset('one')).toEqual([]);
    localStorage.setItem('todo-app:filter-presets', '{');
    expect(loadPresets()).toEqual([]);
    localStorage.setItem('todo-app:filter-presets', JSON.stringify([{ id: 'broken' }]));
    expect(loadPresets()).toEqual([]);
  });
});

describe('template date offsets', () => {
  it('adds minute offsets without relying on the machine timezone', () => {
    expect(addMinutesToSingaporeDate(new Date('2026-11-13T00:00:00.000Z'), 90))
      .toBe('2026-11-13T09:30:00');
  });

  it('round-trips subtasks and ignores malformed serialized data', () => {
    const subtasks = [
      { title: 'Review', position: 0 },
      { title: 'Ship', position: 1 },
    ];
    expect(parseTemplateSubtasks(serializeTemplateSubtasks(subtasks))).toEqual(subtasks);
    expect(parseTemplateSubtasks('{')).toEqual([]);
    expect(parseTemplateSubtasks(JSON.stringify([{ title: '', position: 0 }]))).toEqual([]);
  });
});
