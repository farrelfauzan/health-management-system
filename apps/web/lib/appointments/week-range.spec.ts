import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  formatDateParam,
  formatDayTitle,
  formatMonthTitle,
  formatWeekRangeTitle,
  getMonthGridDays,
  getMonthGridStart,
  getWeekDays,
  getWeekStart,
  parseDateParam,
} from './week-range';

describe('week-range', () => {
  it('returns the preceding Monday as the week start', () => {
    expect(formatDateParam(getWeekStart(new Date(2026, 6, 22)))).toBe('2026-07-20');
    expect(formatDateParam(getWeekStart(new Date(2026, 6, 26)))).toBe('2026-07-20');
    expect(formatDateParam(getWeekStart(new Date(2026, 6, 20)))).toBe('2026-07-20');
  });

  it('builds seven consecutive days starting from the week start', () => {
    const weekDays = getWeekDays(new Date(2026, 6, 20));

    expect(weekDays.map((day) => formatDateParam(day))).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
  });

  it('formats the range title within a single month', () => {
    expect(formatWeekRangeTitle(new Date(2024, 9, 21))).toBe('October 21 – 27, 2024');
  });

  it('formats the range title across months and years', () => {
    expect(formatWeekRangeTitle(new Date(2024, 9, 28))).toBe('October 28 – November 3, 2024');
    expect(formatWeekRangeTitle(new Date(2025, 11, 29))).toBe(
      'December 29, 2025 – January 4, 2026',
    );
  });

  it('round-trips valid date params and rejects invalid ones', () => {
    expect(formatDateParam(parseDateParam('2026-07-05') ?? new Date(0))).toBe('2026-07-05');
    expect(parseDateParam('2026-13-01')).toBeNull();
    expect(parseDateParam('not-a-date')).toBeNull();
  });

  it('shifts months while clamping the day to the target month length', () => {
    expect(formatDateParam(addMonths(new Date(2026, 6, 21), 1))).toBe('2026-08-21');
    expect(formatDateParam(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(formatDateParam(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12-15');
  });

  it('starts the month grid on the Monday covering the first of the month', () => {
    expect(formatDateParam(getMonthGridStart(new Date(2026, 6, 21)))).toBe('2026-06-29');
  });

  it('builds a month grid of full weeks covering the whole month', () => {
    const days = getMonthGridDays(new Date(2026, 6, 21));

    expect(days.length % 7).toBe(0);
    expect(formatDateParam(days[0] ?? new Date(0))).toBe('2026-06-29');
    expect(formatDateParam(days[days.length - 1] ?? new Date(0))).toBe('2026-08-02');
  });

  it('formats day and month titles', () => {
    expect(formatDayTitle(new Date(2026, 6, 21))).toBe('Tuesday, July 21, 2026');
    expect(formatMonthTitle(new Date(2026, 6, 21))).toBe('July 2026');
  });

  it('adds days without mutating the input date', () => {
    const input = new Date(2026, 6, 20);
    const shifted = addDays(input, 7);

    expect(formatDateParam(shifted)).toBe('2026-07-27');
    expect(formatDateParam(input)).toBe('2026-07-20');
  });
});
