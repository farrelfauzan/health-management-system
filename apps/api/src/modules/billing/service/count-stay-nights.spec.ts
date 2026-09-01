import { countStayNights } from './count-stay-nights';

describe('countStayNights', () => {
  const timeZone = 'Asia/Jakarta';

  it('bills one night for a stay that crosses a single clinic midnight', () => {
    // 23:00 WIB to 01:00 WIB the next day — two hours, one midnight.
    const actual = countStayNights({
      admittedAt: new Date('2026-08-30T16:00:00.000Z'),
      endedAt: new Date('2026-08-30T18:00:00.000Z'),
      timeZone,
    });

    expect(actual).toBe(1);
  });

  it('bills one night for a 24-hour daytime stay', () => {
    // 09:00 WIB to 09:00 WIB next day — one midnight, not "one elapsed day
    // plus rounding".
    const actual = countStayNights({
      admittedAt: new Date('2026-08-30T02:00:00.000Z'),
      endedAt: new Date('2026-08-31T02:00:00.000Z'),
      timeZone,
    });

    expect(actual).toBe(1);
  });

  it('bills nothing for a same-day admit and discharge', () => {
    const actual = countStayNights({
      admittedAt: new Date('2026-08-30T02:00:00.000Z'),
      endedAt: new Date('2026-08-30T10:00:00.000Z'),
      timeZone,
    });

    expect(actual).toBe(0);
  });

  it('counts a midnight that UTC dates would miss', () => {
    // 18:00 UTC is already the next calendar day in WIB (+7): a UTC-based
    // count sees no boundary here, the clinic's calendar sees one.
    const actual = countStayNights({
      admittedAt: new Date('2026-08-30T15:00:00.000Z'),
      endedAt: new Date('2026-08-30T18:00:00.000Z'),
      timeZone,
    });

    expect(actual).toBe(1);
  });

  it('bills three nights for a three-midnight stay across a month boundary', () => {
    const actual = countStayNights({
      admittedAt: new Date('2026-08-30T08:00:00.000Z'),
      endedAt: new Date('2026-09-02T03:00:00.000Z'),
      timeZone,
    });

    expect(actual).toBe(3);
  });

  it('bills nothing when the end does not follow the start', () => {
    const instant = new Date('2026-08-30T02:00:00.000Z');

    expect(countStayNights({ admittedAt: instant, endedAt: instant, timeZone })).toBe(0);
  });
});
