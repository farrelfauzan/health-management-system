import type { AnalyticsExportTableSpec, AnalyticsReportingHealthData } from '@hms/shared-types';

// The same words the Status pelaporan page uses.
const SATUSEHAT_KIND_LABELS: Readonly<Record<string, string>> = {
  ENCOUNTER: 'Kunjungan',
  LAB_REPORT: 'Hasil lab',
  EPISODE_OF_CARE_FINISH: 'Episode kehamilan selesai',
  POSTNATAL_EPISODE_FINISH: 'Masa nifas selesai',
};

const BPJS_TYPE_LABELS: Readonly<Record<string, string>> = {
  PENDAFTARAN: 'Pendaftaran',
  KUNJUNGAN: 'Kunjungan',
  PENDAFTARAN_DELETE: 'Hapus pendaftaran',
  OBAT: 'Obat',
  ANTREAN_ADD: 'Antrean Mobile JKN: tambah',
  ANTREAN_PANGGIL: 'Antrean Mobile JKN: panggil',
  ANTREAN_BATAL: 'Antrean Mobile JKN: batal',
};

/**
 * The Status pelaporan tables as the page shows them (P29-T06). Counts
 * only: the failure text stays in the submission monitor, since it can carry
 * patient detail. BPJS exports as an empty table when neither BPJS feature
 * is on, rather than disappearing without a word.
 */
export const REPORTING_EXPORT_TABLES: readonly AnalyticsExportTableSpec<AnalyticsReportingHealthData>[] =
  [
    {
      key: 'satusehat',
      title: 'SATUSEHAT (menunggu dan gagal: saat ini)',
      build: ({ satusehat }) => ({
        columns: ['Jenis', 'Terkirim', 'Menunggu', 'Gagal'],
        rows: satusehat.map((row) => [
          SATUSEHAT_KIND_LABELS[row.kind] ?? row.kind,
          row.submitted,
          row.pending,
          row.failed,
        ]),
      }),
    },
    {
      key: 'bpjs',
      title: 'BPJS (menunggu dan gagal: saat ini)',
      build: ({ bpjs }) => ({
        columns: ['Jenis', 'Terkirim', 'Menunggu', 'Gagal'],
        rows: (bpjs ?? []).map((row) => [
          BPJS_TYPE_LABELS[row.type] ?? row.type,
          row.submitted,
          row.pending,
          row.failed,
        ]),
      }),
    },
    {
      key: 'readiness',
      title: 'Siap dikirim',
      build: ({ readiness }) => ({
        columns: ['Masalah', 'Pemeriksaan'],
        rows: [
          ['Tanpa diagnosis utama', readiness.encountersWithoutPrimaryDiagnosis],
          ['Dokter belum terhubung (tanpa NIK)', readiness.encountersWithUnlinkedClinician],
        ],
      }),
    },
  ];
