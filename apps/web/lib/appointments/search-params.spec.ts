import { describe, expect, it } from 'vitest';

import { buildAppointmentsSearchParams, parseAppointmentsSearchParams } from './search-params';

describe('parseAppointmentsSearchParams', () => {
  it('defaults to the week view anchored on today', () => {
    const parsed = parseAppointmentsSearchParams({});

    expect(parsed.view).toBe('week');
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts valid view, date, and pagination values', () => {
    const parsed = parseAppointmentsSearchParams({
      view: 'table',
      date: '2026-07-20',
      page: '3',
      limit: '25',
    });

    expect(parsed).toEqual({ view: 'table', date: '2026-07-20', page: 3, limit: 25 });
  });

  it('accepts every calendar view', () => {
    expect(parseAppointmentsSearchParams({ view: 'day' }).view).toBe('day');
    expect(parseAppointmentsSearchParams({ view: 'week' }).view).toBe('week');
    expect(parseAppointmentsSearchParams({ view: 'month' }).view).toBe('month');
    expect(parseAppointmentsSearchParams({ view: 'table' }).view).toBe('table');
  });

  it('falls back for unknown views, invalid dates, and out-of-range paging', () => {
    const parsed = parseAppointmentsSearchParams({
      view: 'agenda',
      date: '2026-13-40',
      page: '0',
      limit: '999',
    });

    expect(parsed.view).toBe('week');
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.date).not.toBe('2026-13-40');
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
  });

  it('round-trips through buildAppointmentsSearchParams', () => {
    const params = buildAppointmentsSearchParams({
      view: 'table',
      date: '2026-07-20',
      page: 2,
      limit: 25,
    });

    expect(params.toString()).toBe('view=table&date=2026-07-20&page=2&limit=25');
    expect(parseAppointmentsSearchParams(Object.fromEntries(params.entries()))).toEqual({
      view: 'table',
      date: '2026-07-20',
      page: 2,
      limit: 25,
    });
  });
});
