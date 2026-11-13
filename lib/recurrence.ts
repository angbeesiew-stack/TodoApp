import type { Todo } from '@/lib/db';
import {
  fromSingaporeParts,
  toSingaporeParts,
  type SingaporeDateParts,
} from '@/lib/timezone';

export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
export const RECURRENCE_PATTERNS: RecurrencePattern[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(
  parts: SingaporeDateParts,
  amount: number,
): Pick<SingaporeDateParts, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern,
): string {
  const current = toSingaporeParts(currentDueDate);
  let date: Pick<SingaporeDateParts, 'year' | 'month' | 'day'>;

  switch (pattern) {
    case 'daily':
      date = addDays(current, 1);
      break;
    case 'weekly':
      date = addDays(current, 7);
      break;
    case 'monthly': {
      const month = current.month === 12 ? 1 : current.month + 1;
      const year = current.month === 12 ? current.year + 1 : current.year;
      date = { year, month, day: Math.min(current.day, daysInMonth(year, month)) };
      break;
    }
    case 'yearly': {
      const year = current.year + 1;
      date = {
        year,
        month: current.month,
        day: Math.min(current.day, daysInMonth(year, current.month)),
      };
      break;
    }
  }

  return fromSingaporeParts({ ...date, hour: current.hour, minute: current.minute, second: current.second });
}

export function shouldCreateNextOccurrence(existing: Todo, completed: boolean): boolean {
  return completed && !existing.completed && existing.is_recurring &&
    existing.recurrence_pattern !== null && existing.due_date !== null;
}
