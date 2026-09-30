import type {
  AnalyticsCaseMixData,
  AnalyticsCaseMixRowKind,
  AnalyticsCount,
  AnalyticsExportCell,
  AnalyticsExportTableSpec,
} from '@hms/shared-types';

// What a withheld count reads as in the file, the same "<5" the screen shows.
const SUPPRESSED_LABEL = '<5';

function toCell(count: AnalyticsCount): AnalyticsExportCell {
  return typeof count === 'number' ? count : SUPPRESSED_LABEL;
}

function labelRow(
  kind: AnalyticsCaseMixRowKind,
  others: number | undefined,
  label: string | null,
): string {
  if (kind === 'OTHER') {
    return `Lainnya (${others ?? 0})`;
  }
  return kind === 'UNCODED' ? 'Tanpa kode' : (label ?? '');
}

/**
 * The Pola penyakit tables as the page shows them (P29-T12): suppressed
 * counts stay "<5" in the file too, so the export discloses nothing the
 * screen withholds.
 */
export const CASE_MIX_EXPORT_TABLES: readonly AnalyticsExportTableSpec<AnalyticsCaseMixData>[] = [
  {
    key: 'summary',
    title: 'Ringkasan',
    build: ({ totals }) => ({
      columns: ['Indikator', 'Nilai'],
      rows: [
        ['Pemeriksaan selesai', totals.finishedEncounters],
        ['Pemeriksaan berkode ICD-10', totals.codedEncounters],
        ['Pemeriksaan tanpa diagnosis utama berkode', totals.uncodedEncounters],
        ['Kelengkapan kode (%)', totals.codingCompletenessPercent],
        ['Kode ICD-10 berbeda', totals.distinctCodes],
      ],
    }),
  },
  {
    key: 'top-diagnoses',
    title: '10 diagnosis utama terbanyak',
    build: ({ breakdowns }) => ({
      columns: ['Kode ICD-10', 'Diagnosis', 'Pemeriksaan', 'Porsi (%)'],
      rows: breakdowns.topDiagnoses.map((row) => [
        row.code,
        labelRow(row.kind, row.otherCodes, row.name),
        toCell(row.count),
        row.sharePercent,
      ]),
    }),
  },
  {
    key: 'groups',
    title: 'Per kelompok ICD-10',
    build: ({ breakdowns }) => ({
      columns: ['Kelompok', 'Pemeriksaan', 'Porsi (%)'],
      rows: breakdowns.groups.map((row) => [
        labelRow(row.kind, row.otherGroups, row.group),
        toCell(row.count),
        row.sharePercent,
      ]),
    }),
  },
  {
    key: 'coding-by-poli',
    title: 'Kelengkapan kode per poli',
    build: ({ breakdowns }) => ({
      columns: ['Poli', 'Pemeriksaan selesai', 'Belum berkode', 'Kelengkapan (%)'],
      rows: breakdowns.codingByPoli.map((row) => [
        row.specialtyName ?? 'Tanpa poli',
        row.finishedEncounters,
        toCell(row.uncodedEncounters),
        row.codingCompletenessPercent,
      ]),
    }),
  },
  {
    key: 'top-procedures',
    title: 'Tindakan terbanyak (ICD-9-CM)',
    build: ({ breakdowns }) => ({
      columns: ['Kode ICD-9-CM', 'Tindakan', 'Jumlah'],
      rows: breakdowns.topProcedures.map((row) => [
        row.code,
        labelRow(row.kind, row.otherCodes, row.name),
        toCell(row.count),
      ]),
    }),
  },
];
