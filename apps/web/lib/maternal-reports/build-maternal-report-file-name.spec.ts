import { describe, expect, it } from 'vitest';

import { buildMaternalReportFileName } from './build-maternal-report-file-name';

describe('buildMaternalReportFileName', () => {
  it('names a register file by month and village', () => {
    expect(
      buildMaternalReportFileName({
        kind: 'kohort-ibu',
        month: '2026-10',
        villageCode: '32.73.11.1001',
        format: 'csv',
      }),
    ).toBe('kohort-ibu-2026-10-32.73.11.1001.csv');
  });

  it('names the monthly reports without a village', () => {
    expect(
      buildMaternalReportFileName({
        kind: 'monthly-kia',
        month: '2026-10',
        villageCode: null,
        format: 'pdf',
      }),
    ).toBe('laporan-kia-2026-10.pdf');
  });
});
