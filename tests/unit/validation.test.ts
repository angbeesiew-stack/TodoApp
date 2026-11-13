import { describe, expect, it } from 'vitest';
import { validateDueDate, validateUpdatePriority } from '@/lib/todos';

describe('todo input validation', () => {
  const now = new Date('2025-01-02T00:00:00Z');

  it('accepts a due date exactly one minute in the future', () => {
    expect(validateDueDate('2025-01-02T08:01:00', now)).toBe('2025-01-02T08:01:00');
  });

  it('rejects due dates too soon or malformed and permits no due date', () => {
    expect(() => validateDueDate('2025-01-02T08:00:59', now)).toThrow(
      'at least 1 minute',
    );
    expect(() => validateDueDate('not-a-date', now)).toThrow('Invalid due date');
    expect(validateDueDate(null, now)).toBeNull();
  });

  it('allows past due dates during updates', () => {
    expect(validateDueDate('2020-01-02T08:00:00', now, false)).toBe(
      '2020-01-02T08:00:00',
    );
    expect(() => validateDueDate('not-a-date', now, false)).toThrow('Invalid due date');
  });

  it('rejects null as an update priority instead of clearing a required value', () => {
    expect(() => validateUpdatePriority(null)).toThrow('Invalid priority');
    expect(validateUpdatePriority('high')).toBe('high');
  });
});
