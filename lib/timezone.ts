export const SINGAPORE_TIME_ZONE = 'Asia/Singapore';
const SINGAPORE_OFFSET_MINUTES = 8 * 60;

export interface SingaporeDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function isValidParts(parts: SingaporeDateParts): boolean {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() + 1 === parts.month &&
    date.getUTCDate() === parts.day &&
    date.getUTCHours() === parts.hour &&
    date.getUTCMinutes() === parts.minute &&
    date.getUTCSeconds() === parts.second
  );
}

function localParts(value: string): SingaporeDateParts | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!match) return null;

  const parts: SingaporeDateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
  return isValidParts(parts) ? parts : null;
}

export function parseSingaporeDateTime(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const parts = localParts(value);
  if (parts) {
    const instant = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return new Date(instant - SINGAPORE_OFFSET_MINUTES * 60_000);
  }

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toSingaporeParts(value: string | Date): SingaporeDateParts {
  const instant = parseSingaporeDateTime(value);
  if (!instant) throw new RangeError('Invalid Singapore date/time');

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SINGAPORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function fromSingaporeParts(parts: SingaporeDateParts): string {
  const { year, month, day, hour, minute, second } = parts;
  if (!isValidParts(parts)) throw new RangeError('Invalid Singapore date/time parts');
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export function getSingaporeNow(): Date {
  return new Date();
}

export function formatSingaporeDate(
  value: string | Date,
  pattern = 'yyyy-MM-dd HH:mm:ss',
): string {
  const parts = toSingaporeParts(value);
  return pattern
    .replaceAll('yyyy', String(parts.year).padStart(4, '0'))
    .replaceAll('MM', String(parts.month).padStart(2, '0'))
    .replaceAll('dd', String(parts.day).padStart(2, '0'))
    .replaceAll('HH', String(parts.hour).padStart(2, '0'))
    .replaceAll('mm', String(parts.minute).padStart(2, '0'))
    .replaceAll('ss', String(parts.second).padStart(2, '0'));
}

export function normalizeSingaporeDateTime(value: string): string | null {
  const instant = parseSingaporeDateTime(value);
  if (!instant) return null;
  const parts = toSingaporeParts(instant);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}
