import { describe, expect, it } from 'vitest';
import {
  isReminderDue,
  REMINDER_LABELS,
  REMINDER_MINUTES,
  validateReminderMinutes,
} from '@/lib/reminders';

describe('reminder windows', () => {
  it('exposes the seven supported offsets and labels', () => {
    expect(REMINDER_MINUTES).toEqual([15, 30, 60, 120, 1440, 2880, 10080]);
    expect(REMINDER_LABELS[10080]).toBe('1w');
  });

  it('includes the exact trigger instant and excludes reminders outside the window', () => {
    expect(isReminderDue('2025-01-02T10:00:00', 60, '2025-01-02T09:00:00')).toBe(true);
    expect(isReminderDue('2025-01-02T10:00:00', 60, '2025-01-02T08:59:59')).toBe(false);
    expect(isReminderDue('2025-01-02T10:00:00', 60, '2025-01-02T10:00:01')).toBe(false);
    expect(isReminderDue('invalid', 60, '2025-01-02T09:00:00')).toBe(false);
  });

  it('validates reminder offsets and allows no reminder', () => {
    expect(validateReminderMinutes(null)).toBeNull();
    expect(validateReminderMinutes(undefined)).toBeNull();
    for (const minutes of REMINDER_MINUTES) {
      expect(validateReminderMinutes(minutes)).toBe(minutes);
    }
    expect(() => validateReminderMinutes(10)).toThrow('Invalid reminder timing');
  });
});
