import type { TemplateSubtask } from '@/lib/db';
import { formatSingaporeDate } from '@/lib/timezone';

export function addMinutesToSingaporeDate(now: Date, minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError('Minute offset must be a non-negative integer');
  }
  const dueDate = new Date(now.getTime() + minutes * 60_000);
  return `${formatSingaporeDate(dueDate, 'yyyy-MM-dd')}T${formatSingaporeDate(dueDate, 'HH:mm:ss')}`;
}

export function serializeTemplateSubtasks(subtasks: TemplateSubtask[]): string | null {
  return subtasks.length ? JSON.stringify(subtasks) : null;
}

export function parseTemplateSubtasks(value: string | null): TemplateSubtask[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TemplateSubtask =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        Number.isSafeInteger(item.position) &&
        item.position >= 0,
    );
  } catch {
    return [];
  }
}
