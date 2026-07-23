import type { DoctorScheduleEntry } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { formatScheduleSummary } from './schedule-summary';

function buildEntry(overrides: Partial<DoctorScheduleEntry>): DoctorScheduleEntry {
  return {
    id: 'entry-id',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '16:00',
    isAvailable: true,
    maxPatients: null,
    ...overrides,
  };
}

describe('formatScheduleSummary', () => {
  it('compresses contiguous days with a uniform time range', () => {
    const schedules = [1, 2, 3, 4, 5].map((day) => buildEntry({ id: `d${day}`, dayOfWeek: day }));

    expect(formatScheduleSummary(schedules)).toBe('Mon–Fri · 08:00–16:00');
  });

  it('lists non-contiguous days separately', () => {
    const schedules = [1, 3, 5].map((day) => buildEntry({ id: `d${day}`, dayOfWeek: day }));

    expect(formatScheduleSummary(schedules)).toBe('Mon, Wed, Fri · 08:00–16:00');
  });

  it('marks varying time ranges', () => {
    const schedules = [
      buildEntry({ id: 'a', dayOfWeek: 1 }),
      buildEntry({ id: 'b', dayOfWeek: 2, startTime: '10:00' }),
    ];

    expect(formatScheduleSummary(schedules)).toBe('Mon–Tue · varies');
  });

  it('ignores unavailable entries and reports empty schedules', () => {
    expect(formatScheduleSummary([])).toBe('No schedule');
    expect(formatScheduleSummary([buildEntry({ isAvailable: false })])).toBe('No schedule');
  });
});
