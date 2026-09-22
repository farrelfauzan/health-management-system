import type { MaternalReportColumn } from '#maternal-reporting/types';

/**
 * **Provisional** kohort bayi layout (P25-T15, D-040), derived from what the
 * P25 tickets store about a newborn: the birth (P25-T09), HB0, vitamin K1 and
 * eye prophylaxis in the first hour, the KN1–KN3 visits (P25-T12) and the SHK
 * sample (P25-T10). The Kemenkes register was not obtained by P25-T01; this
 * order must be compared with the pilot puskesmas' form once Q11 lands.
 */
export const KOHORT_BAYI_COLUMNS: readonly MaternalReportColumn[] = [
  { field: 'no', label: 'NO' },
  { field: 'babyName', label: 'NAMA BAYI' },
  { field: 'nik', label: 'NIK BAYI' },
  { field: 'birthDate', label: 'TANGGAL LAHIR' },
  { field: 'sex', label: 'JENIS KELAMIN' },
  { field: 'motherName', label: 'NAMA IBU' },
  { field: 'address', label: 'ALAMAT (DESA/KELURAHAN)' },
  { field: 'birthWeightGrams', label: 'BERAT LAHIR (g)' },
  { field: 'lengthCm', label: 'PANJANG LAHIR (cm)' },
  { field: 'outcome', label: 'LAHIR HIDUP/MATI' },
  { field: 'imd', label: 'IMD' },
  { field: 'vitaminK1', label: 'VITAMIN K1' },
  { field: 'eyeProphylaxis', label: 'SALEP MATA' },
  { field: 'hb0', label: 'HB0' },
  { field: 'kn1', label: 'KN1' },
  { field: 'kn2', label: 'KN2' },
  { field: 'kn3', label: 'KN3' },
  { field: 'shkSample', label: 'SHK (SAMPEL)' },
  { field: 'shkResult', label: 'SHK (HASIL)' },
  { field: 'remarks', label: 'KETERANGAN' },
];
