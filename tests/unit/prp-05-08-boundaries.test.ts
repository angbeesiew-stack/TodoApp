import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subtask, Todo } from '@/lib/db';
import { calculateProgress } from '@/lib/subtasks';
import { applyFilters, DEFAULT_FILTER_STATE, type FilterState } from '@/lib/filters';
import {
  deletePreset,
  loadPresets,
  savePreset,
  type FilterPreset,
} from '@/lib/filter-presets';
import {
  addMinutesToSingaporeDate,
  parseTemplateSubtasks,
  serializeTemplateSubtasks,
} from '@/lib/templates';

function todo(id: number, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    user_id: 1,
    title: 'Review',
    completed: false,
    due_date: '2026-11-15T12:00:00',
    priority: 'high',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-11-13T08:00:00',
    updated_at: null,
    tags: [{ id: 4, user_id: 1, name: 'Work', color: '#123456', created_at: '' }],
    subtasks: [{ id, todo_id: id, title: 'Prepare slides', completed: false, position: 0, created_at: '' }],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PRP 05 progress boundaries', () => {
  it.each([false, true])('counts a nonempty checklist with all completed=%s', (completed) => {
    const subtasks: Subtask[] = [0, 1, 2].map((position) => ({
      id: position + 1,
      todo_id: 1,
      title: `Step ${position + 1}`,
      completed,
      position,
      created_at: '',
    }));
    expect(calculateProgress(subtasks)).toEqual({
      completed: completed ? 3 : 0,
      total: 3,
      percent: completed ? 100 : 0,
    });
  });
});

describe('PRP 08 filter boundaries', () => {
  const filters: FilterState = {
    search: ' SLIDES ',
    priority: 'high',
    tagId: 4,
    completion: 'incomplete',
    dueDateFrom: '2026-11-15',
    dueDateTo: '2026-11-16',
  };

  it('excludes near-matches failing any single active criterion', () => {
    const todos = [
      todo(1),
      todo(2, { subtasks: undefined }),
      todo(3, { priority: 'medium' }),
      todo(4, { tags: undefined }),
      todo(5, { completed: true }),
      todo(6, { due_date: '2026-11-14T23:59:59' }),
      todo(7, { due_date: '2026-11-17T00:00:00' }),
      todo(8, { due_date: null }),
    ];
    expect(applyFilters(todos, filters).map(({ id }) => id)).toEqual([1]);
  });

  it('treats whitespace as no search even when optional relations are absent', () => {
    const todos = [todo(1, { tags: undefined, subtasks: undefined, due_date: null })];
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: ' \t ' })).toEqual(todos);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, search: 'unmatched' })).toEqual([]);
    expect(applyFilters(todos, { ...DEFAULT_FILTER_STATE, tagId: 4 })).toEqual([]);
  });

  it('includes both entire boundary days and excludes undated todos', () => {
    const todos = [
      todo(1, { due_date: '2026-11-15T00:00:00' }),
      todo(2, { due_date: '2026-11-16T23:59:59' }),
      todo(3, { due_date: '2026-11-14T23:59:59' }),
      todo(4, { due_date: '2026-11-17T00:00:00' }),
      todo(5, { due_date: null }),
    ];
    const range = { ...DEFAULT_FILTER_STATE, dueDateFrom: '2026-11-15', dueDateTo: '2026-11-16' };
    expect(applyFilters(todos, range).map(({ id }) => id)).toEqual([1, 2]);
    expect(applyFilters(todos, { ...range, dueDateFrom: '2026-11-17' })).toEqual([]);
  });

  it('filters 1000 todos correctly in under 100ms', () => {
    const todos = Array.from({ length: 1000 }, (_, index) =>
      todo(index, { priority: index % 2 === 0 ? 'high' : 'low' }),
    );
    const start = performance.now();
    const result = applyFilters(todos, filters);
    const elapsed = performance.now() - start;
    expect(result.map(({ id }) => id)).toEqual(
      Array.from({ length: 500 }, (_, index) => index * 2),
    );
    expect(elapsed).toBeLessThan(100);
  });
});

describe('PRP 08 preset storage failures', () => {
  const original: FilterPreset = {
    id: 'original',
    name: 'Existing preset',
    filters: { ...DEFAULT_FILTER_STATE, priority: 'high' },
    createdAt: '2026-11-13T00:00:00.000Z',
  };

  it('recovers when browser storage reads are denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('Access denied', 'SecurityError'); },
    });
    expect(loadPresets()).toEqual([]);
  });

  it.each([
    new DOMException('Quota exceeded', 'QuotaExceededError'),
    new Error('Storage unavailable'),
  ])('surfaces failed writes without losing existing presets: %s', (failure) => {
    const stored = JSON.stringify([original]);
    const setItem = vi.fn(() => { throw failure; });
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem });
    const expected = failure instanceof DOMException ? /storage full/ : failure;
    expect(() => savePreset({ ...original, id: 'new' })).toThrow(expected);
    expect(loadPresets()).toEqual([original]);
    expect(() => deletePreset(original.id)).toThrow(expected);
    expect(loadPresets()).toEqual([original]);
  });
});

describe('PRP 07 template boundaries', () => {
  it.each([
    ['2026-11-13T00:00:00.000Z', 0, '2026-11-13T08:00:00'],
    ['2026-11-13T15:45:00.000Z', 30, '2026-11-14T00:15:00'],
    ['2026-12-31T15:45:00.000Z', 30, '2027-01-01T00:15:00'],
  ] as const)('resolves Singapore offset %s + %s minutes', (instant, minutes, expected) => {
    expect(addMinutesToSingaporeDate(new Date(instant), minutes)).toBe(expected);
  });

  it('supports templates with an empty checklist snapshot', () => {
    expect(serializeTemplateSubtasks([])).toBeNull();
    expect(parseTemplateSubtasks(null)).toEqual([]);
    expect(parseTemplateSubtasks('[]')).toEqual([]);
  });
});
