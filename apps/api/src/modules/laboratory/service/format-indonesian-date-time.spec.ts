import { formatIndonesianDateTime } from './format-indonesian-date-time';

describe('formatIndonesianDateTime', () => {
  const value = new Date('2026-09-07T16:30:00.000Z');

  it('prints the date in the clinic zone, in Indonesian', () => {
    expect(formatIndonesianDateTime({ value, timeZone: 'Asia/Jakarta', withTime: false })).toBe(
      '7 September 2026',
    );
  });

  it('prints the time in the clinic zone with two-digit minutes', () => {
    expect(formatIndonesianDateTime({ value, timeZone: 'Asia/Jakarta', withTime: true })).toBe(
      '7 September 2026, 23:30',
    );
  });

  // A release at 23:30 in Jakarta is 16:30 UTC the same day; one at 00:30 is
  // 17:30 UTC the day *before*. The sheet is dated by the clinic's clock.
  it('rolls the date with the zone rather than with UTC', () => {
    const afterMidnight = new Date('2026-09-07T17:30:00.000Z');

    expect(
      formatIndonesianDateTime({ value: afterMidnight, timeZone: 'Asia/Jakarta', withTime: true }),
    ).toBe('8 September 2026, 00:30');
  });
});
