import type { AnalyticsResponseMeta } from '@hms/shared-types';

import { buildAnalyticsExportCsv } from './build-analytics-export-csv';

const META: AnalyticsResponseMeta = {
  from: '2026-09-01',
  to: '2026-09-30',
  timezone: 'Asia/Jakarta',
  granularity: 'day',
  generatedAt: '2026-09-30T02:00:00.000Z',
};

describe('buildAnalyticsExportCsv', () => {
  it('opens with a BOM and the period, then one titled section per table', () => {
    const actual = buildAnalyticsExportCsv({
      dashboardTitle: 'Keuangan',
      meta: META,
      filterLines: [['Penjamin', 'BPJS']],
      tables: [
        {
          key: 'payment-methods',
          title: 'Metode pembayaran',
          columns: ['Metode', 'Nilai'],
          rows: [['Tunai', 1500000.5]],
        },
        { key: 'doctors', title: 'Per dokter', columns: ['Dokter', 'Pendapatan'], rows: [] },
      ],
    });

    expect(actual.startsWith('\uFEFF')).toBe(true);
    expect(actual.slice(1).split('\r\n')).toEqual([
      'MetaKlinik,Keuangan',
      'Periode,2026-09-01 s.d. 2026-09-30',
      'Zona waktu,Asia/Jakarta',
      'Data per,2026-09-30T02:00:00.000Z',
      'Penjamin,BPJS',
      '',
      'Metode pembayaran',
      'Metode,Nilai',
      'Tunai,1500000.5',
      '',
      'Per dokter',
      'Dokter,Pendapatan',
      '',
    ]);
  });

  it('quotes commas, neutralises text that would run as a formula, and leaves numbers alone', () => {
    const actual = buildAnalyticsExportCsv({
      dashboardTitle: 'Operasional',
      meta: META,
      filterLines: [],
      tables: [
        {
          key: 'poli',
          title: 'Kunjungan per poli',
          columns: ['Poli', 'Perubahan', 'Catatan'],
          rows: [
            ['=HYPERLINK("x")', -5, null],
            ['Gigi, Anak', 3, 'ok'],
          ],
        },
      ],
    });

    expect(actual).toContain(`"'=HYPERLINK(""x"")",-5,\r\n`);
    expect(actual).toContain('"Gigi, Anak",3,ok\r\n');
  });
});
