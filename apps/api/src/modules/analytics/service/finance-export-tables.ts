import type { AnalyticsExportTableSpec, AnalyticsFinanceData } from '@hms/shared-types';

const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  QRIS: 'QRIS',
  INSURANCE: 'Asuransi',
};

const ITEM_TYPE_LABELS: Readonly<Record<string, string>> = {
  CONSULTATION: 'Konsultasi',
  PROCEDURE: 'Tindakan',
  MEDICATION: 'Obat',
  ACCOMMODATION: 'Rawat inap',
  LAB: 'Laboratorium',
  OTHER: 'Lainnya',
};

const PAYER_LABELS: Readonly<Record<string, string>> = {
  GENERAL: 'Umum',
  BPJS: 'BPJS',
  INSURANCE: 'Asuransi',
};

const AGE_LABELS: Readonly<Record<string, string>> = {
  '0-7': '0–7 hari',
  '8-30': '8–30 hari',
  'over-30': '> 30 hari',
};

/**
 * The Keuangan tables as the page shows them (P29-T09), amounts in rupiah
 * as plain numbers so a spreadsheet can sum them. Revenue follows the
 * invoice date; payment methods follow the payment date (Q-3).
 */
export const FINANCE_EXPORT_TABLES: readonly AnalyticsExportTableSpec<AnalyticsFinanceData>[] = [
  {
    key: 'summary',
    title: 'Ringkasan',
    build: ({ totals }) => ({
      columns: ['Indikator', 'Nilai'],
      rows: [
        ['Pendapatan (per tanggal invoice, termasuk PPN)', totals.revenue],
        ['PPN di dalam pendapatan', totals.taxAmount],
        ['Invoice terbit', totals.invoices],
        ['Kunjungan dengan invoice', totals.invoicedVisits],
        ['Rata-rata per kunjungan', totals.revenuePerVisit],
        ['Invoice periode ini belum dibayar', totals.unpaidInvoices],
        ['Nilai belum dibayar', totals.unpaidAmount],
        ['Kas diterima (per tanggal bayar)', totals.cashReceived],
        ['Pembayaran', totals.payments],
        ['Invoice dibatalkan', totals.voidedInvoices],
        ['Nilai dibatalkan', totals.voidedAmount],
      ],
    }),
  },
  {
    key: 'revenue-trend',
    title: 'Pendapatan per periode',
    build: ({ series }) => ({
      columns: ['Periode', 'Pendapatan', 'Kas diterima'],
      rows: series.map((point) => [point.bucket, point.revenue, point.cashReceived]),
    }),
  },
  {
    key: 'payment-methods',
    title: 'Metode pembayaran (per tanggal bayar)',
    build: ({ breakdowns }) => ({
      columns: ['Metode', 'Pembayaran', 'Nilai'],
      rows: breakdowns.paymentMethods.map((row) => [
        PAYMENT_METHOD_LABELS[row.method] ?? row.method,
        row.payments,
        row.amount,
      ]),
    }),
  },
  {
    key: 'service-types',
    title: 'Per jenis layanan',
    build: ({ breakdowns }) => ({
      columns: ['Jenis layanan', 'Baris invoice', 'Nilai sebelum pajak', 'PPN'],
      rows: breakdowns.itemTypes.map((row) => [
        ITEM_TYPE_LABELS[row.itemType] ?? row.itemType,
        row.lines,
        row.amount - row.taxAmount,
        row.taxAmount,
      ]),
    }),
  },
  {
    key: 'payers',
    title: 'Penjamin',
    build: ({ breakdowns }) => ({
      columns: ['Penjamin', 'Kunjungan', 'Invoice', 'Pendapatan'],
      rows: breakdowns.payers.map((row) => [
        row.payerType === null ? 'Tidak tercatat' : (PAYER_LABELS[row.payerType] ?? row.payerType),
        row.visits,
        row.invoices,
        row.revenue,
      ]),
    }),
  },
  {
    key: 'doctors',
    title: 'Per dokter',
    build: ({ breakdowns }) => ({
      columns: ['Dokter / bidan', 'Poli', 'Invoice', 'Kunjungan', 'Pendapatan', 'Per kunjungan'],
      rows: breakdowns.doctors.map((row) => [
        row.doctorName ?? 'Tanpa dokter',
        row.specialtyName,
        row.invoices,
        row.doctorId === null ? null : row.visits,
        row.revenue,
        row.doctorId === null ? null : row.revenuePerVisit,
      ]),
    }),
  },
  {
    key: 'outstanding',
    title: 'Umur invoice belum dibayar (saat ini)',
    build: ({ breakdowns }) => ({
      columns: ['Umur', 'Invoice', 'Nilai'],
      rows: breakdowns.outstanding.aging.map((row) => [
        AGE_LABELS[row.bucket] ?? row.bucket,
        row.invoices,
        row.amount,
      ]),
    }),
  },
];
