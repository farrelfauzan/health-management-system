import type { ConfigService } from '@nestjs/config';

import { AnalyticsRangeService } from './analytics-range.service';

function buildService(timeZone: string | undefined = 'Asia/Jakarta'): AnalyticsRangeService {
  const mockConfig = { get: jest.fn(() => timeZone) };
  return new AnalyticsRangeService(mockConfig as unknown as ConfigService);
}

describe('AnalyticsRangeService.resolveTodayWindows', () => {
  it('cuts today at now and last Tuesday at the same clock time', () => {
    // 10:00 WIB on Tuesday 29 September 2026.
    const inputNow = new Date('2026-09-29T03:00:00.000Z');

    const actual = buildService().resolveTodayWindows(inputNow);

    expect(actual).toEqual({
      date: '2026-09-29',
      comparisonDate: '2026-09-22',
      todayStartUtc: '2026-09-28 17:00:00.000',
      nowUtc: '2026-09-29 03:00:00.000',
      comparisonStartUtc: '2026-09-21 17:00:00.000',
      comparisonEndUtc: '2026-09-22 03:00:00.000',
    });
  });

  it("takes the clinic's date, not UTC's, just after local midnight", () => {
    // 00:30 WIB on 30 September is still 29 September in UTC.
    const inputNow = new Date('2026-09-29T17:30:00.000Z');

    const actual = buildService().resolveTodayWindows(inputNow);

    expect(actual.date).toBe('2026-09-30');
    expect(actual.comparisonEndUtc).toBe('2026-09-22 17:30:00.000');
  });
});
