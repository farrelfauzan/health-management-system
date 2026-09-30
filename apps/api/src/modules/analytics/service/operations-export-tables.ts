import type { AnalyticsExportTableSpec, AnalyticsOperationsData } from '@hms/shared-types';

// The same words the Operasional page uses.
const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  WALK_IN: 'Datang langsung',
  STAFF: 'Dijadwalkan staf',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  MOBILE_JKN: 'Mobile JKN',
};

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  COMPLETED: 'Selesai',
  NO_SHOW: 'Tidak datang',
  CANCELLED: 'Dibatalkan',
  REJECTED: 'Ditolak',
  SCHEDULED: 'Terjadwal',
  CONFIRMED: 'Dikonfirmasi',
  REQUESTED: 'Menunggu persetujuan',
};

const WEEKDAY_LABELS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const TWO_DIGITS = 2;

/** The Operasional tables as the page shows them (P29-T05, P29-T11). Counts only. */
export const OPERATIONS_EXPORT_TABLES: readonly AnalyticsExportTableSpec<AnalyticsOperationsData>[] =
  [
    {
      key: 'summary',
      title: 'Ringkasan',
      build: ({ totals }) => ({
        columns: ['Indikator', 'Nilai'],
        rows: [
          ['Kunjungan', totals.visits],
          ['Pasien baru', totals.newPatients],
          ['Pasien lama', totals.returningPatients],
          ['Datang langsung', totals.walkIns],
          ['Janji temu', totals.appointments],
          ['Tingkat tidak datang (%)', totals.noShowRatePercent],
          ['Median waktu tunggu (menit)', totals.medianWaitMinutes],
          ['Median lama periksa (menit)', totals.medianConsultMinutes],
          ['Keterisian sesi praktik (%)', totals.sessionUtilisationPercent],
        ],
      }),
    },
    {
      key: 'visits-trend',
      title: 'Kunjungan per periode',
      build: ({ series }) => ({
        columns: ['Periode', 'Kunjungan', 'Konsultasi', 'Lab saja', 'Rawat inap'],
        rows: series.map((point) => [
          point.bucket,
          point.visits,
          point.consultation,
          point.labOnly,
          point.admission,
        ]),
      }),
    },
    {
      key: 'visits-by-poli',
      title: 'Kunjungan per poli',
      build: ({ breakdowns }) => ({
        columns: ['Poli', 'Kunjungan'],
        rows: breakdowns.visitsByPoli.map((row) => [row.specialtyName ?? 'Tanpa poli', row.visits]),
      }),
    },
    {
      key: 'visits-by-doctor',
      title: 'Kunjungan per dokter',
      build: ({ breakdowns }) => ({
        columns: ['Dokter / bidan', 'Kunjungan'],
        rows: breakdowns.visitsByDoctor.map((row) => [row.doctorName, row.visits]),
      }),
    },
    {
      key: 'booking-channels',
      title: 'Kanal pemesanan',
      build: ({ breakdowns }) => ({
        columns: ['Kanal', 'Pemesanan', 'Selesai', 'Tidak datang', 'Tingkat tidak datang (%)'],
        rows: breakdowns.bookingChannels.map((row) => [
          CHANNEL_LABELS[row.channel] ?? row.channel,
          row.bookings,
          row.completed,
          row.noShows,
          row.noShowRatePercent,
        ]),
      }),
    },
    {
      key: 'appointment-outcomes',
      title: 'Hasil janji temu',
      build: ({ breakdowns }) => ({
        columns: ['Status', 'Janji temu'],
        rows: breakdowns.appointmentOutcomes.map((row) => [
          OUTCOME_LABELS[row.status] ?? row.status,
          row.appointments,
        ]),
      }),
    },
    {
      key: 'busiest-hours',
      title: 'Jam tersibuk',
      build: ({ breakdowns }) => ({
        columns: ['Hari', 'Jam', 'Check-in'],
        rows: breakdowns.busiestHours.map((cell) => [
          WEEKDAY_LABELS[cell.weekday - 1] ?? String(cell.weekday),
          `${String(cell.hour).padStart(TWO_DIGITS, '0')}.00`,
          cell.checkIns,
        ]),
      }),
    },
  ];
