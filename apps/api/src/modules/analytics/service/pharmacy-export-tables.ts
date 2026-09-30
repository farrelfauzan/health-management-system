import type {
  AnalyticsExportTableSpec,
  AnalyticsPharmacyData,
  AnalyticsPharmacyExpiryWindow,
  MedicationUnitValue,
} from '@hms/shared-types';

const EXPIRY_WINDOW_LABELS: Readonly<Record<AnalyticsPharmacyExpiryWindow, string>> = {
  EXPIRED: 'Sudah kedaluwarsa',
  WITHIN_30_DAYS: '≤ 30 hari',
  WITHIN_60_DAYS: '31–60 hari',
  WITHIN_90_DAYS: '61–90 hari',
};

function toUnitLabel(unit: MedicationUnitValue | null): string {
  return unit === null ? '' : unit.toLowerCase();
}

function toMedicationLabel(name: string, strength: string | null): string {
  return strength ? `${name} ${strength}` : name;
}

/**
 * The Farmasi tables as the page shows them (P29-T13). Stock and expiry are
 * as of the day the file was made, whatever the period says.
 */
export const PHARMACY_EXPORT_TABLES: readonly AnalyticsExportTableSpec<AnalyticsPharmacyData>[] = [
  {
    key: 'summary',
    title: 'Ringkasan',
    build: ({ totals }) => ({
      columns: ['Indikator', 'Nilai'],
      rows: [
        ['Resep terbit', totals.prescriptionsIssued],
        ['Diserahkan penuh', totals.fullyDispensed],
        ['Diserahkan sebagian', totals.partiallyDispensed],
        ['Dibatalkan', totals.cancelled],
        ['Belum diserahkan', totals.awaitingDispense],
        ['Ditebus di apotek luar', totals.filledElsewhere],
        ['Diserahkan penuh (%)', totals.fullyDispensedPercent],
        ['Median terbit ke serah (menit)', totals.medianDispenseMinutes],
        ['Pendapatan obat (Rp, per tanggal invoice)', totals.medicationRevenue],
      ],
    }),
  },
  {
    key: 'prescriptions-trend',
    title: 'Tren resep',
    build: ({ series }) => ({
      columns: ['Periode', 'Resep terbit', 'Diserahkan penuh', 'Pendapatan obat (Rp)'],
      rows: series.map((point) => [
        point.bucket,
        point.prescriptionsIssued,
        point.fullyDispensed,
        point.medicationRevenue,
      ]),
    }),
  },
  {
    key: 'top-medications',
    title: 'Obat paling banyak diserahkan',
    build: ({ breakdowns }) => ({
      columns: ['Kode', 'Obat', 'Jumlah', 'Satuan', 'Penyerahan'],
      rows: breakdowns.topMedications.map((row) => [
        row.code,
        toMedicationLabel(row.name, row.strength),
        row.quantity,
        toUnitLabel(row.unit),
        row.dispenses,
      ]),
    }),
  },
  {
    key: 'reorder',
    title: 'Perlu dipesan ulang',
    build: ({ breakdowns }) => ({
      columns: [
        'Kode',
        'Obat',
        'Sisa',
        'Batas pesan',
        'Satuan',
        'Rata-rata per hari (30 hari)',
        'Cukup untuk (hari)',
      ],
      rows: breakdowns.stock.reorder.map((row) => [
        row.code,
        toMedicationLabel(row.name, row.strength),
        row.stock,
        row.reorderLevel,
        toUnitLabel(row.unit),
        row.averageDailyDispensed,
        row.daysOfCover,
      ]),
    }),
  },
  {
    key: 'expiring',
    title: 'Mendekati kedaluwarsa',
    build: ({ breakdowns }) => ({
      columns: ['Rentang', 'Batch', 'Jumlah sisa', 'Obat'],
      rows: breakdowns.stock.expiring.map((row) => [
        EXPIRY_WINDOW_LABELS[row.window],
        row.batches,
        row.units,
        row.medications,
      ]),
    }),
  },
];
