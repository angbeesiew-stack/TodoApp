import type { FilterState } from '@/lib/filters';

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

export const FILTER_PRESETS_KEY = 'todo-app:filter-presets';

function isFilterState(value: unknown): value is FilterState {
  if (typeof value !== 'object' || value === null) return false;
  const filters = value as Record<string, unknown>;
  return (
    typeof filters.search === 'string' &&
    (filters.priority === 'all' || ['high', 'medium', 'low'].includes(String(filters.priority))) &&
    (filters.tagId === 'all' ||
      (typeof filters.tagId === 'number' && Number.isSafeInteger(filters.tagId) && filters.tagId > 0)) &&
    ['all', 'incomplete', 'completed'].includes(String(filters.completion)) &&
    (filters.dueDateFrom === null || typeof filters.dueDateFrom === 'string') &&
    (filters.dueDateTo === null || typeof filters.dueDateTo === 'string')
  );
}

function isFilterPreset(value: unknown): value is FilterPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    isFilterState(preset.filters) &&
    typeof preset.createdAt === 'string'
  );
}

export function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(FILTER_PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isFilterPreset) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(presets));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Could not save preset — storage full.');
    }
    throw error;
  }
}

export function savePreset(preset: FilterPreset): FilterPreset[] {
  const presets = [...loadPresets(), preset];
  writePresets(presets);
  return presets;
}

export function deletePreset(id: string): FilterPreset[] {
  const presets = loadPresets().filter((preset) => preset.id !== id);
  writePresets(presets);
  return presets;
}
