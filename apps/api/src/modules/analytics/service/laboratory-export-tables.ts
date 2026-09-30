import type {
  AnalyticsExportTableSpec,
  AnalyticsLabOrderSource,
  AnalyticsLaboratoryData,
} from '@hms/shared-types';

const SOURCE_LABELS: Readonly<Record<AnalyticsLabOrderSource, string>> = {
  ENCOUNTER: 'Dari pemeriksaan',
  WALK_IN: 'Datang langsung',
  EXTERNAL_REFERRAL: 'Rujukan luar',
};

/** The Laboratorium tables as the page shows them (P29-T14); turnaround in minutes. */
export const LABORATORY_EXPORT_TABLES: readonly AnalyticsExportTableSpec<AnalyticsLaboratoryData>[] =
  [
    {
      key: 'summary',
      title: 'Ringkasan',
      build: ({ totals }) => ({
        columns: ['Indikator', 'Nilai'],
        rows: [
          ['Order lab', totals.orders],
          ['Dirilis', totals.released],
          ['Dalam proses', totals.inProgress],
          ['Dikirim ke lab luar', totals.sentOut],
          ['Dibatalkan', totals.cancelled],
          ['Median waktu hasil (menit)', totals.medianTurnaroundMinutes],
          ['P90 waktu hasil (menit)', totals.p90TurnaroundMinutes],
          ['Order dengan ambil ulang sampel', totals.recollectedOrders],
          ['Ambil ulang sampel (%)', totals.recollectionRatePercent],
          ['Batal (%)', totals.cancellationRatePercent],
        ],
      }),
    },
    {
      key: 'orders-trend',
      title: 'Order per periode',
      build: ({ series }) => ({
        columns: ['Periode', 'Order', 'Dirilis'],
        rows: series.map((point) => [point.bucket, point.orders, point.released]),
      }),
    },
    {
      key: 'turnaround-by-test',
      title: 'Waktu hasil per pemeriksaan',
      build: ({ breakdowns }) => ({
        columns: ['Kode', 'Pemeriksaan', 'Order', 'Order dirilis', 'Median (menit)', 'P90 (menit)'],
        rows: breakdowns.tests.map((row) => [
          row.code,
          row.name,
          row.orders,
          row.releasedOrders,
          row.medianTurnaroundMinutes,
          row.p90TurnaroundMinutes,
        ]),
      }),
    },
    {
      key: 'sources',
      title: 'Asal order',
      build: ({ breakdowns }) => ({
        columns: ['Asal', 'Order'],
        rows: breakdowns.sources.map((row) => [SOURCE_LABELS[row.source], row.orders]),
      }),
    },
  ];
