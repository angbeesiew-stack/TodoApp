import type { Todo } from '@/lib/db';
import { normalizeSingaporeDateTime, parseSingaporeDateTime } from '@/lib/timezone';
import { ValidationError } from '@/lib/validation';

export type Priority = 'high' | 'medium' | 'low';
export const PRIORITY_VALUES: Priority[] = ['high', 'medium', 'low'];
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function validatePriority(value: unknown): Priority {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  throw new ValidationError(`Invalid priority: ${String(value)}. Must be 'high', 'medium', or 'low'.`);
}

export function validateCreatePriority(value: unknown): Priority {
  if (value === undefined || value === null) return 'medium';
  return validatePriority(value);
}

export function validateUpdatePriority(value: unknown): Priority {
  return validatePriority(value);
}

export function validateDueDate(
  value: unknown,
  now: Date = new Date(),
  requireFuture = true,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('Invalid due date');

  const normalized = normalizeSingaporeDateTime(value);
  if (!normalized || !parseSingaporeDateTime(normalized)) {
    throw new ValidationError('Invalid due date');
  }
  const due = parseSingaporeDateTime(normalized);
  if (!due || (requireFuture && due.getTime() < now.getTime() + 60_000)) {
    throw new ValidationError('Due date must be at least 1 minute in the future');
  }
  return normalized;
}

function compareDueDate(a: Todo, b: Todo): number {
  if (a.due_date && b.due_date) {
    const left = parseSingaporeDateTime(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const right = parseSingaporeDateTime(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
  } else if (a.due_date) {
    return -1;
  } else if (b.due_date) {
    return 1;
  }
  return 0;
}

export function compareTodos(a: Todo, b: Todo): number {
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  const dueDiff = compareDueDate(a, b);
  if (dueDiff !== 0) return dueDiff;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodos);
}

export interface TodoSections {
  overdue: Todo[];
  pending: Todo[];
  completed: Todo[];
}

export function sectionTodos(todos: Todo[], now: Date = new Date()): TodoSections {
  const overdue: Todo[] = [];
  const pending: Todo[] = [];
  const completed = todos.filter((todo) => todo.completed);
  for (const todo of todos) {
    if (todo.completed) continue;
    const due = todo.due_date ? parseSingaporeDateTime(todo.due_date) : null;
    if (due && due.getTime() < now.getTime()) overdue.push(todo);
    else pending.push(todo);
  }

  completed.sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
  return {
    overdue: sortTodos(overdue),
    pending: sortTodos(pending),
    completed,
  };
}
