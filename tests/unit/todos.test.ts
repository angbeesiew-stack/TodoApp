import { describe, expect, it } from 'vitest';
import {
  sectionTodos,
  sortTodos,
  validateCreatePriority,
  validatePriority,
} from '@/lib/todos';
import type { Todo } from '@/lib/db';

function todo(id: number, priority: Todo['priority'], due_date: string | null, created_at = '2025-01-01T00:00:00Z', completed = false): Todo {
  return {
    id,
    user_id: 1,
    title: `Todo ${id}`,
    completed,
    due_date,
    priority,
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at,
    updated_at: completed ? created_at : null,
  };
}

describe('priority validation and sorting', () => {
  it('accepts supported priorities and rejects invalid values', () => {
    expect(validatePriority('high')).toBe('high');
    expect(validatePriority('medium')).toBe('medium');
    expect(validatePriority('low')).toBe('low');
    expect(() => validatePriority('urgent')).toThrow('Invalid priority');
    expect(() => validatePriority(null)).toThrow('Invalid priority');
    expect(validateCreatePriority(undefined)).toBe('medium');
    expect(validateCreatePriority(null)).toBe('medium');
  });

  it('sorts by priority, due date, then newest creation time without mutating input', () => {
    const input = [
      todo(1, 'low', null),
      todo(2, 'high', '2025-01-03T09:00:00'),
      todo(3, 'high', '2025-01-02T09:00:00'),
      todo(4, 'medium', '2025-01-02T09:00:00', '2025-01-02T00:00:00Z'),
      todo(5, 'medium', '2025-01-02T09:00:00', '2025-01-03T00:00:00Z'),
    ];
    const sorted = sortTodos(input);
    expect(sorted.map(({ id }) => id)).toEqual([3, 2, 5, 4, 1]);
    expect(input.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('sections overdue, pending, and completed todos with stable priority ordering', () => {
    const result = sectionTodos([
      todo(1, 'high', '2025-01-01T09:00:00'),
      todo(2, 'low', null),
      todo(3, 'medium', null, undefined, true),
    ], new Date('2025-01-02T00:00:00Z'));
    expect(result.overdue.map(({ id }) => id)).toEqual([1]);
    expect(result.pending.map(({ id }) => id)).toEqual([2]);
    expect(result.completed.map(({ id }) => id)).toEqual([3]);
  });

  it('keeps a todo due at the exact current instant in Pending', () => {
    const result = sectionTodos(
      [todo(9, 'medium', '2025-01-02T08:00:00')],
      new Date('2025-01-02T00:00:00Z'),
    );
    expect(result.pending.map(({ id }) => id)).toEqual([9]);
    expect(result.overdue).toEqual([]);
  });

  it('sorts completed todos newest completion first, regardless of priority', () => {
    const result = sectionTodos([
      { ...todo(1, 'high', null, '2025-01-01T00:00:00Z', true), updated_at: '2025-01-01T01:00:00Z' },
      { ...todo(2, 'low', null, '2025-01-01T00:00:00Z', true), updated_at: '2025-01-01T02:00:00Z' },
    ]);
    expect(result.completed.map(({ id }) => id)).toEqual([2, 1]);
  });
});
