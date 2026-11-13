import { parseSingaporeDateTime } from '@/lib/timezone';
import { ValidationError } from '@/lib/validation';

export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080;

export const REMINDER_MINUTES: ReminderMinutes[] = [
  15, 30, 60, 120, 1440, 2880, 10080,
];

export const REMINDER_LABELS: Record<ReminderMinutes, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

export function validateReminderMinutes(value: unknown): ReminderMinutes | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value === 'number' &&
    REMINDER_MINUTES.includes(value as ReminderMinutes)
  ) {
    return value as ReminderMinutes;
  }
  throw new ValidationError('Invalid reminder timing');
}

export function isReminderDue(
  dueDate: string,
  minutes: number,
  now: string | Date,
): boolean {
  const due = parseSingaporeDateTime(dueDate);
  const current = parseSingaporeDateTime(now);
  if (!due || !current) return false;
  const opensAt = due.getTime() - minutes * 60_000;
  return current.getTime() >= opensAt && current.getTime() <= due.getTime();
}
