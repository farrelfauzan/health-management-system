import type { MaternalReportColumn } from '#maternal-reporting/types';

/**
 * The Kemenkes 2020 Register Kohort Ibu, 53 columns in the printed order
 * (P25-T15, D-040; the mapping table in `docs/ops/e-kohort-kia-spike.md` §4).
 *
 * The default layout until the pilot puskesmas' form is obtained (Q11). Column
 * 25 is the one header the spike table did not read; it is labelled as the
 * register's "other examinations" slot and must be compared side by side with
 * the printed form once Q11 lands. Columns 28–39 are the twelve month cells of
 * the K-visit grid, January to December of the report year.
 */
export const KOHORT_IBU_COLUMNS: readonly MaternalReportColumn[] = [
  { field: 'no', label: 'NO' },
  { field: 'motherName', label: 'NAMA IBU' },
  { field: 'nik', label: 'NIK' },
  { field: 'address', label: 'ALAMAT (DESA/KELURAHAN)' },
  { field: 'payer', label: 'SUMBER PEMBIAYAAN' },
  { field: 'motherAge', label: 'USIA IBU' },
  { field: 'gpa', label: 'STATUS GPA' },
  { field: 'pregnancyInterval', label: 'JARAK KEHAMILAN' },
  { field: 'estimatedDeliveryDate', label: 'TAKSIRAN PERSALINAN' },
  { field: 'heightCm', label: 'TINGGI BADAN (cm)' },
  { field: 'muacCm', label: 'LILA (cm)' },
  { field: 'tetanusStatus', label: 'STATUS IMUNISASI TD' },
  { field: 'tetanusInjection', label: 'INJEKSI TD' },
  { field: 'tbScreening', label: 'SKRINING TBC' },
  { field: 'mentalHealthScreening', label: 'SKRINING JIWA' },
  { field: 'haemoglobin', label: 'HB (g/dL)' },
  { field: 'bloodType', label: 'GOLONGAN DARAH' },
  { field: 'proteinUrine', label: 'PROTEIN URIN' },
  { field: 'glucose', label: 'GLUKOSA URIN / GULA DARAH' },
  { field: 'hiv', label: 'HIV' },
  { field: 'syphilis', label: 'SIFILIS' },
  { field: 'hbsag', label: 'HBSAG' },
  { field: 'tbMicroscopy', label: 'TBC MIKROSKOPIS' },
  { field: 'malaria', label: 'MALARIA' },
  { field: 'otherExamination', label: 'PEMERIKSAAN LAIN' },
  { field: 'counselling', label: 'KONSELING' },
  { field: 'complications', label: 'KOMPLIKASI' },
  { field: 'visitJan', label: 'JAN' },
  { field: 'visitFeb', label: 'FEB' },
  { field: 'visitMar', label: 'MAR' },
  { field: 'visitApr', label: 'APR' },
  { field: 'visitMay', label: 'MEI' },
  { field: 'visitJun', label: 'JUN' },
  { field: 'visitJul', label: 'JUL' },
  { field: 'visitAug', label: 'AGU' },
  { field: 'visitSep', label: 'SEP' },
  { field: 'visitOct', label: 'OKT' },
  { field: 'visitNov', label: 'NOV' },
  { field: 'visitDec', label: 'DES' },
  { field: 'birthDateOutcome', label: 'TGL LAHIR / HIDUP-MATI' },
  { field: 'birthWeightLow', label: 'BB LAHIR < 2500 g' },
  { field: 'birthWeightNormal', label: 'BB LAHIR >= 2500 g' },
  { field: 'deliveryMode', label: 'CARA PERSALINAN' },
  { field: 'deliveryPlace', label: 'TEMPAT PERSALINAN' },
  { field: 'attendant', label: 'PENOLONG' },
  { field: 'deliveryComplication', label: 'PENYULIT' },
  { field: 'kf1', label: 'KF1' },
  { field: 'kf2', label: 'KF2' },
  { field: 'kf3', label: 'KF3' },
  { field: 'kf4', label: 'KF4' },
  { field: 'postpartumFamilyPlanning', label: 'PELAYANAN KB PASCA SALIN' },
  { field: 'postnatalCaseManagement', label: 'TATA LAKSANA KASUS NIFAS' },
  { field: 'remarks', label: 'KETERANGAN' },
];
