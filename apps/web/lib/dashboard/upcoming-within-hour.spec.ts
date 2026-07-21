import { describe, expect, it } from 'vitest';

import { countUpcomingWithinHour } from './upcoming-within-hour';

describe('countUpcomingWithinHour', () => {
  const now = new Date('2026-07-21T10:00:00.000Z');

  it('counts scheduled and confirmed appointments inside the next hour', () => {
    const inputAppointments = [
      { scheduledAt: '2026-07-21T10:15:00.000Z', status: 'SCHEDULED' },
      { scheduledAt: '2026-07-21T10:45:00.000Z', status: 'CONFIRMED' },
      { scheduledAt: '2026-07-21T11:30:00.000Z', status: 'SCHEDULED' },
      { scheduledAt: '2026-07-21T09:30:00.000Z', status: 'SCHEDULED' },
    ];

    expect(countUpcomingWithinHour(inputAppointments, now)).toBe(2);
  });

  it('ignores cancelled and completed appointments inside the window', () => {
    const inputAppointments = [
      { scheduledAt: '2026-07-21T10:15:00.000Z', status: 'CANCELLED' },
      { scheduledAt: '2026-07-21T10:20:00.000Z', status: 'COMPLETED' },
      { scheduledAt: '2026-07-21T10:25:00.000Z', status: 'NO_SHOW' },
    ];

    expect(countUpcomingWithinHour(inputAppointments, now)).toBe(0);
  });
});
