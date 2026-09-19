import { describe, expect, it } from 'vitest';

import { buildTaxReportPeriods } from '#lib/taxes/build-tax-report-periods';
import { formatTaxReportPeriod } from '#lib/taxes/format-tax-report-period';

describe('tax report periods (P27-T05)', () => {
  it('lists the twelve months of a year', () => {
    const actual = buildTaxReportPeriods(2026);

    expect(actual).toHaveLength(12);
    expect([actual[0], actual[11]]).toEqual(['2026-01', '2026-12']);
  });

  it('names a period in Indonesian', () => {
    expect(formatTaxReportPeriod('2026-02', 'id-ID')).toBe('Februari 2026');
  });
});
