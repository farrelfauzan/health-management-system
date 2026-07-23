import { describe, expect, it } from 'vitest';

import {
  getMinutesFromCalendarStart,
  layoutDayEvent,
  layoutDaySessionBlock,
  layoutDaySessionColumns,
  layoutWeekEvent,
  layoutWeekSessionBlock,
  layoutWeekSessionColumns,
} from './event-layout';

const WEEK_START = new Date(2026, 6, 20);

function buildScheduledAt(day: number, hours: number, minutes: number): string {
  return new Date(2026, 6, day, hours, minutes).toISOString();
}

describe('layoutWeekEvent', () => {
  it('places a Tuesday 10:30 appointment in the second column at 150px with a one-hour block', () => {
    const placement = layoutWeekEvent({
      scheduledAt: buildScheduledAt(21, 10, 30),
      weekStart: WEEK_START,
    });

    expect(placement).toEqual({ dayIndex: 1, topPx: 150, heightPx: 60 });
  });

  it('places a Sunday appointment in the last column', () => {
    const placement = layoutWeekEvent({
      scheduledAt: buildScheduledAt(26, 8, 0),
      weekStart: WEEK_START,
    });

    expect(placement).toEqual({ dayIndex: 6, topPx: 0, heightPx: 60 });
  });

  it('clamps an appointment starting before the grid to the top', () => {
    const placement = layoutWeekEvent({
      scheduledAt: buildScheduledAt(20, 7, 45),
      weekStart: WEEK_START,
    });

    expect(placement).toEqual({ dayIndex: 0, topPx: 0, heightPx: 45 });
  });

  it('keeps a near-closing appointment inside the grid with the minimum height', () => {
    const placement = layoutWeekEvent({
      scheduledAt: buildScheduledAt(20, 17, 45),
      weekStart: WEEK_START,
    });

    expect(placement).toEqual({ dayIndex: 0, topPx: 570, heightPx: 30 });
  });

  it('returns null for appointments entirely outside the visible hours', () => {
    expect(
      layoutWeekEvent({ scheduledAt: buildScheduledAt(20, 6, 0), weekStart: WEEK_START }),
    ).toBeNull();
    expect(
      layoutWeekEvent({ scheduledAt: buildScheduledAt(20, 18, 30), weekStart: WEEK_START }),
    ).toBeNull();
  });

  it('returns null for appointments outside the visible week', () => {
    expect(
      layoutWeekEvent({ scheduledAt: buildScheduledAt(27, 10, 0), weekStart: WEEK_START }),
    ).toBeNull();
  });

  it('returns null for invalid timestamps', () => {
    expect(layoutWeekEvent({ scheduledAt: 'not-a-date', weekStart: WEEK_START })).toBeNull();
  });
});

describe('layoutDayEvent', () => {
  it('positions an event on the matching day', () => {
    const placement = layoutDayEvent({
      scheduledAt: buildScheduledAt(21, 10, 30),
      day: new Date(2026, 6, 21),
    });

    expect(placement).toEqual({ topPx: 150, heightPx: 60 });
  });

  it('returns null for events on another day or outside visible hours', () => {
    expect(
      layoutDayEvent({ scheduledAt: buildScheduledAt(22, 10, 30), day: new Date(2026, 6, 21) }),
    ).toBeNull();
    expect(
      layoutDayEvent({ scheduledAt: buildScheduledAt(21, 6, 0), day: new Date(2026, 6, 21) }),
    ).toBeNull();
  });
});

describe('getMinutesFromCalendarStart', () => {
  it('measures minutes relative to the 08:00 grid start', () => {
    expect(getMinutesFromCalendarStart(new Date(2026, 6, 20, 8, 0))).toBe(0);
    expect(getMinutesFromCalendarStart(new Date(2026, 6, 20, 11, 15))).toBe(195);
    expect(getMinutesFromCalendarStart(new Date(2026, 6, 20, 7, 0))).toBe(-60);
  });
});

describe('layoutWeekSessionBlock', () => {
  it('spans the full session window in the matching column', () => {
    const placement = layoutWeekSessionBlock({
      sessionDate: '2026-07-20',
      startTime: '08:00',
      endTime: '12:00',
      weekStart: WEEK_START,
    });

    expect(placement).toEqual({ dayIndex: 0, topPx: 0, heightPx: 240 });
  });

  it('returns null for a session outside the visible week', () => {
    expect(
      layoutWeekSessionBlock({
        sessionDate: '2026-07-28',
        startTime: '08:00',
        endTime: '12:00',
        weekStart: WEEK_START,
      }),
    ).toBeNull();
  });
});

describe('layoutDaySessionBlock', () => {
  it('spans the session window on the matching day and clamps to the grid', () => {
    expect(
      layoutDaySessionBlock({
        sessionDate: '2026-07-21',
        startTime: '13:00',
        endTime: '17:00',
        day: new Date(2026, 6, 21),
      }),
    ).toEqual({ topPx: 300, heightPx: 240 });
    expect(
      layoutDaySessionBlock({
        sessionDate: '2026-07-21',
        startTime: '07:00',
        endTime: '10:00',
        day: new Date(2026, 6, 21),
      }),
    ).toEqual({ topPx: 0, heightPx: 120 });
  });

  it('returns null for a session on another day', () => {
    expect(
      layoutDaySessionBlock({
        sessionDate: '2026-07-22',
        startTime: '08:00',
        endTime: '12:00',
        day: new Date(2026, 6, 21),
      }),
    ).toBeNull();
  });
});

describe('layoutDaySessionColumns', () => {
  const DAY = new Date(2026, 6, 21);

  function buildWindow(startTime: string, endTime: string) {
    return { sessionDate: '2026-07-21', startTime, endTime };
  }

  it('gives non-overlapping sessions the full width', () => {
    const placements = layoutDaySessionColumns({
      sessions: [buildWindow('08:00', '10:00'), buildWindow('10:00', '12:00')],
      day: DAY,
    });

    expect(placements[0]).toMatchObject({ columnIndex: 0, columnCount: 1 });
    expect(placements[1]).toMatchObject({ columnIndex: 0, columnCount: 1 });
  });

  it('splits two overlapping sessions into side-by-side columns', () => {
    const placements = layoutDaySessionColumns({
      sessions: [buildWindow('08:00', '12:00'), buildWindow('09:00', '11:00')],
      day: DAY,
    });

    expect(placements[0]).toMatchObject({ columnIndex: 0, columnCount: 2 });
    expect(placements[1]).toMatchObject({ columnIndex: 1, columnCount: 2 });
  });

  it('reuses a freed column inside the same overlap cluster', () => {
    const placements = layoutDaySessionColumns({
      sessions: [
        buildWindow('08:00', '12:00'),
        buildWindow('08:00', '09:00'),
        buildWindow('09:00', '10:00'),
      ],
      day: DAY,
    });

    expect(placements[0]).toMatchObject({ columnIndex: 0, columnCount: 2 });
    expect(placements[1]).toMatchObject({ columnIndex: 1, columnCount: 2 });
    expect(placements[2]).toMatchObject({ columnIndex: 1, columnCount: 2 });
  });

  it('returns null for sessions on another day without affecting columns', () => {
    const placements = layoutDaySessionColumns({
      sessions: [
        { sessionDate: '2026-07-22', startTime: '08:00', endTime: '12:00' },
        buildWindow('08:00', '12:00'),
      ],
      day: DAY,
    });

    expect(placements[0]).toBeNull();
    expect(placements[1]).toMatchObject({ columnIndex: 0, columnCount: 1 });
  });
});

describe('layoutWeekSessionColumns', () => {
  it('assigns day columns independently per weekday', () => {
    const placements = layoutWeekSessionColumns({
      sessions: [
        { sessionDate: '2026-07-20', startTime: '08:00', endTime: '12:00' },
        { sessionDate: '2026-07-20', startTime: '10:00', endTime: '14:00' },
        { sessionDate: '2026-07-21', startTime: '08:00', endTime: '12:00' },
      ],
      weekStart: WEEK_START,
    });

    expect(placements[0]).toMatchObject({ dayIndex: 0, columnIndex: 0, columnCount: 2 });
    expect(placements[1]).toMatchObject({ dayIndex: 0, columnIndex: 1, columnCount: 2 });
    expect(placements[2]).toMatchObject({ dayIndex: 1, columnIndex: 0, columnCount: 1 });
  });
});
