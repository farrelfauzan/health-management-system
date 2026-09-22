/** The recap table's columns, shared by the CSV and the PDF letter. */
export const NON_CAPITATION_LINE_COLUMNS = [
  'No',
  'Tanggal pelayanan',
  'Nama peserta',
  'No. BPJS (4 digit akhir)',
  'Jenis pelayanan',
  'Kunjungan',
  'Pemeriksa/penolong',
  'Tarif',
  'Dasar tarif',
  'Dokumen pendukung',
  'Status',
  'Batas kedaluwarsa',
] as const;
