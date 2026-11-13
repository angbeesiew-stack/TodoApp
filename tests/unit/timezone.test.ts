import { describe, expect, it } from 'vitest';
import {
  formatSingaporeDate,
  fromSingaporeParts,
  normalizeSingaporeDateTime,
  parseSingaporeDateTime,
  toSingaporeParts,
} from '@/lib/timezone';

describe('Singapore date/time helpers', () => {
  it('treats offset-free date/time values as Singapore local time', () => {
    expect(parseSingaporeDateTime('2025-01-02T08:00:00')?.toISOString()).toBe(
      '2025-01-02T00:00:00.000Z',
    );
    expect(toSingaporeParts('2025-01-02 08:00:00')).toEqual({
      year: 2025,
      month: 1,
      day: 2,
      hour: 8,
      minute: 0,
      second: 0,
    });
  });

  it('converts explicit UTC timestamps and formats Singapore calendar time', () => {
    const utc = '2025-01-01T16:30:00Z';
    expect(formatSingaporeDate(utc)).toBe('2025-01-02 00:30:00');
    expect(normalizeSingaporeDateTime(utc)).toBe('2025-01-02T00:30:00');
  });

  it('rejects invalid dates and impossible calendar parts', () => {
    expect(parseSingaporeDateTime('2025-02-29T10:00')).toBeNull();
    expect(normalizeSingaporeDateTime('not-a-date')).toBeNull();
    expect(() => toSingaporeParts('not-a-date')).toThrow('Invalid Singapore date/time');
    expect(() =>
      fromSingaporeParts({
        year: 2025,
        month: 2,
        day: 29,
        hour: 10,
        minute: 0,
        second: 0,
      }),
    ).toThrow('Invalid Singapore date/time parts');
  });
});
