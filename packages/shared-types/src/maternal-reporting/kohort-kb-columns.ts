import type { MaternalReportColumn } from '#maternal-reporting/types';

/**
 * **Provisional** kohort KB layout (P25-T15, D-040), derived from the family
 * planning course and its services (P25-T14): method, new or continuing
 * acceptor, the start, this month's services and the next due date, side
 * effects and the discontinuation. The pilot puskesmas' kohort KB columns are
 * unknown (Q11) and this order must be compared with its form when they are.
 */
export const KOHORT_KB_COLUMNS: readonly MaternalReportColumn[] = [
  { field: 'no', label: 'NO' },
  { field: 'acceptorName', label: 'NAMA AKSEPTOR' },
  { field: 'nik', label: 'NIK' },
  { field: 'age', label: 'USIA' },
  { field: 'address', label: 'ALAMAT (DESA/KELURAHAN)' },
  { field: 'method', label: 'METODE' },
  { field: 'acceptorType', label: 'PESERTA BARU/AKTIF' },
  { field: 'startedOn', label: 'TANGGAL MULAI' },
  { field: 'postpartum', label: 'KB PASCA SALIN' },
  { field: 'provider', label: 'PENYEDIA' },
  { field: 'servicesThisMonth', label: 'PELAYANAN BULAN INI' },
  { field: 'nextDueOn', label: 'JADWAL BERIKUTNYA' },
  { field: 'sideEffects', label: 'EFEK SAMPING' },
  { field: 'discontinuedOn', label: 'TANGGAL BERHENTI' },
  { field: 'discontinuationReason', label: 'ALASAN BERHENTI' },
  { field: 'remarks', label: 'KETERANGAN' },
];
