/**
 * The token registry a document template is authored against (`P16-T04`).
 *
 * It is a typed const rather than a database table on purpose. Every token
 * here has a resolver branch behind it, so a token that exists is a token
 * something can fill — and adding one is a code change reviewed alongside the
 * resolver that makes it real, not a row somebody inserted. The editor
 * (`P16-T11`) renders this list as its variable palette; publish-time
 * validation (`P16-T12`) rejects a template referencing anything outside it.
 *
 * Labels are carried in both languages rather than looked up by key because
 * the palette is the one surface where a translator needs to see the token
 * and its label together.
 */
export const TEMPLATE_VARIABLE_TYPES = [
  'text',
  'date',
  'money',
  'number',
  'enum',
  'image',
  'block',
] as const;

export type TemplateVariableType = (typeof TEMPLATE_VARIABLE_TYPES)[number];

export type TemplateVariable = {
  readonly token: string;
  readonly labelId: string;
  readonly labelEn: string;
  readonly type: TemplateVariableType;
  /**
   * What the token looks like filled in. Shown in the palette and used as the
   * fixture for `P16-T12`'s hostile-data preview, so it must be a realistic
   * value rather than a placeholder like `<name>`.
   */
  readonly sample: string;
};

/**
 * Which document a registry belongs to. Invoices (`P16-T04`), the two printed
 * clinical requests (`P18-T12`) — the surat pengantar laboratorium and the
 * resep — and the lab report (`P18-T05`) each get their own set, which is why
 * the route takes a kind rather than answering with one global list.
 * Agreements (`E5`) follow.
 */
export const TEMPLATE_VARIABLE_KINDS = [
  'INVOICE',
  'LAB_REQUEST',
  'PRESCRIPTION',
  'LAB_REPORT',
] as const;

export type TemplateVariableKind = (typeof TEMPLATE_VARIABLE_KINDS)[number];

/**
 * The column tokens the `items` repeating block can render, in the order the
 * built-in layout shows them (`P16-T11`). A template's `settings.itemsColumns`
 * is an ordered subset of this list — the author picks which columns appear
 * and in what order, and the renderer walks that choice rather than a
 * hard-coded table.
 */
export const INVOICE_ITEM_COLUMN_TOKENS = [
  'item.no',
  'item.description',
  'item.quantity',
  'item.unitPrice',
  'item.amount',
] as const;

export type InvoiceItemColumnToken = (typeof INVOICE_ITEM_COLUMN_TOKENS)[number];

/**
 * The columns available inside the `items` repeating block. They are ordinary
 * registry entries rather than a nested structure so the palette, the
 * publish-time validator, and this type stay flat — `P16-T11` decides which
 * of them a template's table actually renders.
 */
export const INVOICE_ITEM_ROW_VARIABLES: readonly TemplateVariable[] = [
  {
    token: 'item.no',
    labelId: 'Nomor baris',
    labelEn: 'Row number',
    type: 'number',
    sample: '1',
  },
  {
    token: 'item.description',
    labelId: 'Uraian',
    labelEn: 'Description',
    type: 'text',
    sample: 'Konsultasi Dokter Umum',
  },
  {
    token: 'item.quantity',
    labelId: 'Jumlah',
    labelEn: 'Quantity',
    type: 'number',
    sample: '1',
  },
  {
    token: 'item.unitPrice',
    labelId: 'Harga satuan',
    labelEn: 'Unit price',
    type: 'money',
    sample: 'Rp 50.000',
  },
  {
    token: 'item.amount',
    labelId: 'Jumlah harga',
    labelEn: 'Amount',
    type: 'money',
    sample: 'Rp 50.000',
  },
];

/**
 * Every token an invoice template may reference.
 *
 * **`patient.nikMasked` is the only identifier token, and there is no
 * plaintext counterpart anywhere in this list.** The NIK is encrypted at rest
 * and gated behind `patient.read-identifier`; putting it on a receipt the
 * patient carries out of the building must not be a layout choice available
 * in a WYSIWYG editor. The resolver never emits the plaintext either — it
 * masks and forgets.
 */
/**
 * The letterhead every clinic-issued document carries. Extracted from the
 * invoice registry when the printed clinical requests arrived (`P18-T12`)
 * rather than copied into each: a token added to one letterhead has to reach
 * all of them, and three hand-maintained copies drift on the first change.
 */
const CLINIC_IDENTITY_VARIABLES: readonly TemplateVariable[] = [
  {
    token: 'clinic.name',
    labelId: 'Nama klinik',
    labelEn: 'Clinic name',
    type: 'text',
    sample: 'Klinik Sehat Bersama',
  },
  {
    token: 'clinic.legalName',
    labelId: 'Nama badan hukum',
    labelEn: 'Legal entity name',
    type: 'text',
    sample: 'PT Sehat Bersama Indonesia',
  },
  {
    token: 'clinic.address',
    labelId: 'Alamat klinik',
    labelEn: 'Clinic address',
    type: 'text',
    sample: 'Jl. Merdeka No. 12, Bandung',
  },
  {
    token: 'clinic.phone',
    labelId: 'Telepon klinik',
    labelEn: 'Clinic phone',
    type: 'text',
    sample: '(022) 1234567',
  },
  {
    token: 'clinic.email',
    labelId: 'Email klinik',
    labelEn: 'Clinic email',
    type: 'text',
    sample: 'halo@kliniksehat.id',
  },
  {
    token: 'clinic.licenseNumber',
    labelId: 'Nomor izin operasional',
    labelEn: 'Operating licence number',
    type: 'text',
    sample: '440/1234/DPMPTSP',
  },
  {
    token: 'clinic.taxId',
    labelId: 'NPWP klinik',
    labelEn: 'Clinic tax ID',
    type: 'text',
    sample: '01.234.567.8-901.000',
  },
  {
    token: 'clinic.logo',
    labelId: 'Logo klinik',
    labelEn: 'Clinic logo',
    type: 'image',
    sample: 'data:image/png;base64,…',
  },
];

export const INVOICE_TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  ...CLINIC_IDENTITY_VARIABLES,
  {
    token: 'invoice.number',
    labelId: 'Nomor faktur',
    labelEn: 'Invoice number',
    type: 'text',
    sample: 'INV-20260830-0007',
  },
  {
    token: 'invoice.issuedAt',
    labelId: 'Tanggal terbit',
    labelEn: 'Issued on',
    type: 'date',
    sample: '30 Agustus 2026',
  },
  {
    token: 'invoice.status',
    labelId: 'Status faktur',
    labelEn: 'Invoice status',
    type: 'enum',
    sample: 'PAID',
  },
  {
    token: 'invoice.total',
    labelId: 'Total',
    labelEn: 'Total',
    type: 'money',
    sample: 'Rp 275.000',
  },
  {
    token: 'invoice.totalInWords',
    labelId: 'Terbilang',
    labelEn: 'Total in words',
    type: 'text',
    sample: 'dua ratus tujuh puluh lima ribu rupiah',
  },
  {
    token: 'invoice.itemCount',
    labelId: 'Jumlah baris',
    labelEn: 'Item count',
    type: 'number',
    sample: '4',
  },
  {
    token: 'invoice.qrVerify',
    labelId: 'QR verifikasi',
    labelEn: 'Verification QR',
    type: 'image',
    sample: 'data:image/png;base64,…',
  },
  {
    token: 'patient.fullName',
    labelId: 'Nama pasien',
    labelEn: 'Patient name',
    type: 'text',
    sample: 'Siti Rahmawati',
  },
  {
    token: 'patient.mrn',
    labelId: 'Nomor rekam medis',
    labelEn: 'Medical record number',
    type: 'text',
    sample: 'RM-000142',
  },
  {
    token: 'patient.dateOfBirth',
    labelId: 'Tanggal lahir',
    labelEn: 'Date of birth',
    type: 'date',
    sample: '4 Februari 1988',
  },
  {
    token: 'patient.sex',
    labelId: 'Jenis kelamin',
    labelEn: 'Sex',
    type: 'enum',
    sample: 'Perempuan',
  },
  {
    token: 'patient.address',
    labelId: 'Alamat pasien',
    labelEn: 'Patient address',
    type: 'text',
    sample: 'Jl. Kenanga No. 3',
  },
  {
    token: 'patient.phone',
    labelId: 'Telepon pasien',
    labelEn: 'Patient phone',
    type: 'text',
    sample: '0812xxxxxx',
  },
  {
    token: 'patient.nikMasked',
    labelId: 'NIK (tersamar)',
    labelEn: 'NIK (masked)',
    type: 'text',
    sample: '••••••••••••3271',
  },
  {
    token: 'encounter.date',
    labelId: 'Tanggal kunjungan',
    labelEn: 'Encounter date',
    type: 'date',
    sample: '30 Agustus 2026',
  },
  {
    token: 'encounter.doctorName',
    labelId: 'Nama dokter',
    labelEn: 'Doctor name',
    type: 'text',
    sample: 'dr. Andi Prasetyo, Sp.PD',
  },
  {
    token: 'encounter.specialty',
    labelId: 'Spesialisasi',
    labelEn: 'Specialty',
    type: 'text',
    sample: 'Penyakit Dalam',
  },
  {
    token: 'admission.roomLabel',
    labelId: 'Kamar',
    labelEn: 'Room',
    type: 'text',
    sample: 'Melati 2A',
  },
  {
    token: 'admission.nights',
    labelId: 'Jumlah malam',
    labelEn: 'Nights',
    type: 'number',
    sample: '3',
  },
  {
    token: 'payment.method',
    labelId: 'Metode pembayaran',
    labelEn: 'Payment method',
    type: 'enum',
    sample: 'QRIS',
  },
  {
    token: 'payment.paidAt',
    labelId: 'Waktu pembayaran',
    labelEn: 'Paid at',
    type: 'date',
    sample: '30 Agustus 2026, 14:22',
  },
  {
    token: 'payment.reference',
    labelId: 'Referensi pembayaran',
    labelEn: 'Payment reference',
    type: 'text',
    sample: 'QR-88213771',
  },
  {
    token: 'payment.cashierName',
    labelId: 'Kasir',
    labelEn: 'Cashier',
    type: 'text',
    sample: 'Rina Kartika',
  },
  {
    token: 'items',
    labelId: 'Rincian tagihan',
    labelEn: 'Line items',
    type: 'block',
    sample: '4 baris',
  },
  ...INVOICE_ITEM_ROW_VARIABLES,
];

/**
 * The identity every printed clinical request carries: who issued it, who it is
 * about, and who signed it (`P18-T12`).
 *
 * Shared between the two registries below rather than written twice — the
 * letterhead of a surat pengantar and a resep is the same letterhead, and two
 * copies would drift the first time somebody added a token to one.
 */
const CLINICAL_REQUEST_SHARED_VARIABLES: readonly TemplateVariable[] = [
  ...CLINIC_IDENTITY_VARIABLES,
  {
    token: 'patient.fullName',
    labelId: 'Nama pasien',
    labelEn: 'Patient name',
    type: 'text',
    sample: 'Arsyila Layla Safiya',
  },
  {
    token: 'patient.mrn',
    labelId: 'Nomor rekam medis',
    labelEn: 'Medical record number',
    type: 'text',
    sample: '00000447',
  },
  {
    token: 'patient.dateOfBirth',
    labelId: 'Tanggal lahir',
    labelEn: 'Date of birth',
    type: 'date',
    sample: '12 April 1990',
  },
  {
    token: 'patient.sex',
    labelId: 'Jenis kelamin',
    labelEn: 'Sex',
    type: 'enum',
    sample: 'Perempuan',
  },
  {
    token: 'patient.age',
    labelId: 'Umur',
    labelEn: 'Age',
    type: 'text',
    sample: '36 tahun',
  },
  {
    token: 'doctor.fullName',
    labelId: 'Nama dokter',
    labelEn: 'Doctor name',
    type: 'text',
    sample: 'dr. Yusuf Hidayat',
  },
  {
    // The practice licence a request has to be signed under. Printed from the
    // doctor's own licence row rather than typed into the template, so a
    // renewed SIP reaches every future letter without an edit.
    token: 'doctor.licenseNumber',
    labelId: 'Nomor SIP',
    labelEn: 'Practice licence number',
    type: 'text',
    sample: 'SIP-2026-0005',
  },
  {
    token: 'request.issuedAt',
    labelId: 'Tanggal terbit',
    labelEn: 'Issued on',
    type: 'date',
    sample: '7 September 2026',
  },
];

/**
 * The surat pengantar laboratorium (`P18-T12`).
 *
 * `order.number` is the load-bearing token: it is what the analis types or
 * scans at the counter to pull the order up, and `order.barcode` is the same
 * value rendered as a scannable image.
 */
export const LAB_REQUEST_TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  ...CLINICAL_REQUEST_SHARED_VARIABLES,
  {
    token: 'order.number',
    labelId: 'Nomor permintaan',
    labelEn: 'Order number',
    type: 'text',
    sample: 'LAB/20260907/0001',
  },
  {
    token: 'order.barcode',
    labelId: 'Barcode nomor permintaan',
    labelEn: 'Order number barcode',
    type: 'image',
    sample: 'data:image/svg+xml;base64,…',
  },
  {
    token: 'order.priority',
    labelId: 'Prioritas',
    labelEn: 'Priority',
    type: 'enum',
    sample: 'Rutin',
  },
  {
    token: 'order.isFasting',
    labelId: 'Puasa',
    labelEn: 'Fasting required',
    type: 'text',
    sample: 'Ya',
  },
  {
    token: 'order.clinicalNotes',
    labelId: 'Keterangan klinis',
    labelEn: 'Clinical notes',
    type: 'text',
    sample: 'Curiga infeksi saluran kemih',
  },
  {
    // Our own laboratory, or the outside one the patient was referred to
    // (P18-T11). One template serves both — the destination is the only line
    // that differs between a letter kept in-house and a referral out.
    token: 'order.destination',
    labelId: 'Ditujukan kepada',
    labelEn: 'Destination',
    type: 'text',
    sample: 'Laboratorium Klinik Sehat Bersama',
  },
  {
    token: 'tests',
    labelId: 'Daftar pemeriksaan',
    labelEn: 'Requested tests',
    type: 'block',
    sample: '10 pemeriksaan',
  },
  {
    token: 'test.no',
    labelId: 'No. baris pemeriksaan',
    labelEn: 'Test row number',
    type: 'number',
    sample: '1',
  },
  {
    token: 'test.code',
    labelId: 'Kode pemeriksaan',
    labelEn: 'Test code',
    type: 'text',
    sample: 'URPROT',
  },
  {
    token: 'test.name',
    labelId: 'Nama pemeriksaan',
    labelEn: 'Test name',
    type: 'text',
    sample: 'Urin - Protein',
  },
  {
    token: 'test.specimen',
    labelId: 'Jenis spesimen',
    labelEn: 'Specimen type',
    type: 'enum',
    sample: 'Urin',
  },
  {
    // The panel a test was expanded from, so the letter groups the way the
    // doctor ordered rather than listing ten loose rows.
    token: 'test.panel',
    labelId: 'Paket',
    labelEn: 'Panel',
    type: 'text',
    sample: 'Urin Rutin',
  },
];

/** The resep (`P18-T12`), for the clinic's own apotek or an outside one. */
export const PRESCRIPTION_TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  ...CLINICAL_REQUEST_SHARED_VARIABLES,
  {
    token: 'prescription.destination',
    labelId: 'Ditujukan kepada',
    labelEn: 'Destination',
    type: 'text',
    sample: 'Apotek Klinik Sehat Bersama',
  },
  {
    token: 'prescription.notes',
    labelId: 'Catatan resep',
    labelEn: 'Prescription notes',
    type: 'text',
    sample: 'Habiskan antibiotik meski keluhan mereda',
  },
  {
    token: 'medications',
    labelId: 'Daftar obat',
    labelEn: 'Prescribed items',
    type: 'block',
    sample: '2 obat',
  },
  {
    token: 'medication.no',
    labelId: 'No. baris obat',
    labelEn: 'Item row number',
    type: 'number',
    sample: '1',
  },
  {
    token: 'medication.name',
    labelId: 'Nama obat',
    labelEn: 'Medication name',
    type: 'text',
    sample: 'Amoxicillin 500 mg',
  },
  {
    token: 'medication.dosage',
    labelId: 'Dosis',
    labelEn: 'Dosage',
    type: 'text',
    sample: '1 kapsul',
  },
  {
    token: 'medication.frequency',
    labelId: 'Aturan pakai',
    labelEn: 'Frequency',
    type: 'text',
    sample: '3x sehari',
  },
  {
    token: 'medication.quantity',
    labelId: 'Jumlah',
    labelEn: 'Quantity',
    type: 'number',
    sample: '15',
  },
  {
    token: 'medication.instructions',
    labelId: 'Petunjuk',
    labelEn: 'Instructions',
    type: 'text',
    sample: 'Diminum sesudah makan',
  },
];

/**
 * The hasil laboratorium (`P18-T05`) — the sheet the patient leaves with, and
 * the file the record keeps as the same artefact.
 *
 * It shares the clinical letterhead and patient block with the two requests,
 * but not `doctor.licenseNumber` or `request.issuedAt`: a report is signed by
 * whoever verified it, not by the doctor who asked for it, and it is dated by
 * the release. **No NIK token, masked or otherwise** — a report travels on
 * WhatsApp locked with a date of birth, and the identifier has no business on
 * it.
 *
 * `results` is the load-bearing block: one row per test, with the value, the
 * flag marker and the band it was judged against, snapshotted at entry rather
 * than read from today's catalog (`P18-T04`).
 */
export const LAB_REPORT_TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  ...CLINIC_IDENTITY_VARIABLES,
  {
    token: 'patient.fullName',
    labelId: 'Nama pasien',
    labelEn: 'Patient name',
    type: 'text',
    sample: 'Arsyila Layla Safiya',
  },
  {
    token: 'patient.mrn',
    labelId: 'Nomor rekam medis',
    labelEn: 'Medical record number',
    type: 'text',
    sample: '00000447',
  },
  {
    token: 'patient.dateOfBirth',
    labelId: 'Tanggal lahir',
    labelEn: 'Date of birth',
    type: 'date',
    sample: '12 April 1990',
  },
  {
    token: 'patient.sex',
    labelId: 'Jenis kelamin',
    labelEn: 'Sex',
    type: 'enum',
    sample: 'Perempuan',
  },
  {
    token: 'patient.age',
    labelId: 'Umur',
    labelEn: 'Age',
    type: 'text',
    sample: '36 tahun',
  },
  {
    token: 'order.number',
    labelId: 'Nomor permintaan',
    labelEn: 'Order number',
    type: 'text',
    sample: 'LAB/20260907/0001',
  },
  {
    token: 'order.orderedAt',
    labelId: 'Tanggal permintaan',
    labelEn: 'Ordered on',
    type: 'date',
    sample: '7 September 2026',
  },
  {
    token: 'doctor.fullName',
    labelId: 'Dokter pengirim',
    labelEn: 'Requesting doctor',
    type: 'text',
    sample: 'dr. Yusuf Hidayat',
  },
  {
    // Every accession number drawn for the order, comma-separated. One token
    // rather than a block: a report lists its tubes in a line, not a table.
    token: 'specimen.accessionNumbers',
    labelId: 'Nomor spesimen',
    labelEn: 'Specimen accession numbers',
    type: 'text',
    sample: 'SPC/20260907/0001, SPC/20260907/0002',
  },
  {
    token: 'specimen.collectedAt',
    labelId: 'Waktu pengambilan',
    labelEn: 'Collected at',
    type: 'date',
    sample: '7 September 2026, 08:15',
  },
  {
    token: 'report.releasedAt',
    labelId: 'Waktu rilis',
    labelEn: 'Released at',
    type: 'date',
    sample: '7 September 2026, 11:40',
  },
  {
    token: 'report.verifierName',
    labelId: 'Diverifikasi oleh',
    labelEn: 'Verified by',
    type: 'text',
    sample: 'dr. Yusuf Hidayat',
  },
  {
    // The banner a corrected report carries, or nothing. A token rather than a
    // fixed heading so a clinic may restyle it, and a required one on the
    // built-in layout so nobody can restyle it away.
    token: 'report.amendmentNotice',
    labelId: 'Keterangan revisi',
    labelEn: 'Amendment notice',
    type: 'text',
    sample: 'AMENDED — menggantikan laporan tanggal 7 September 2026, 11:40',
  },
  {
    token: 'results',
    labelId: 'Hasil pemeriksaan',
    labelEn: 'Results',
    type: 'block',
    sample: '10 pemeriksaan',
  },
  {
    token: 'result.no',
    labelId: 'No. baris hasil',
    labelEn: 'Result row number',
    type: 'number',
    sample: '1',
  },
  {
    token: 'result.test',
    labelId: 'Pemeriksaan',
    labelEn: 'Test',
    type: 'text',
    sample: 'Hemoglobin',
  },
  {
    token: 'result.value',
    labelId: 'Hasil',
    labelEn: 'Value',
    type: 'text',
    sample: '11,2',
  },
  {
    token: 'result.unit',
    labelId: 'Satuan',
    labelEn: 'Unit',
    type: 'text',
    sample: 'g/dL',
  },
  {
    // ▲ high, ▼ low, doubled when critical, * for a non-numeric abnormal. A
    // marker column rather than colour: the sheet is photocopied and faxed.
    token: 'result.flag',
    labelId: 'Tanda',
    labelEn: 'Flag',
    type: 'text',
    sample: '▼',
  },
  {
    token: 'result.referenceRange',
    labelId: 'Nilai rujukan',
    labelEn: 'Reference range',
    type: 'text',
    sample: '12,0 – 16,0',
  },
];

export const TEMPLATE_VARIABLES_BY_KIND: Readonly<
  Record<TemplateVariableKind, readonly TemplateVariable[]>
> = {
  INVOICE: INVOICE_TEMPLATE_VARIABLES,
  LAB_REQUEST: LAB_REQUEST_TEMPLATE_VARIABLES,
  PRESCRIPTION: PRESCRIPTION_TEMPLATE_VARIABLES,
  LAB_REPORT: LAB_REPORT_TEMPLATE_VARIABLES,
};
